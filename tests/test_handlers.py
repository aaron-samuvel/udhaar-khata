import json
import os
from datetime import datetime, timedelta, timezone

import boto3
import pytest
from moto import mock_aws

import api
import reminders
from db import Ledger, money


def _create_table():
    dynamodb = boto3.resource("dynamodb", region_name="ap-south-1")
    dynamodb.create_table(
        TableName=os.environ["TABLE_NAME"],
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[
            {"AttributeName": "PK", "AttributeType": "S"},
            {"AttributeName": "SK", "AttributeType": "S"},
        ],
        KeySchema=[
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
    )
    return dynamodb


def apigw(method, path, body=None, path_params=None):
    event = {
        "requestContext": {"http": {"method": method, "path": path}},
        "rawPath": path,
    }
    if body is not None:
        event["body"] = json.dumps(body)
    if path_params:
        event["pathParameters"] = path_params
    return event


def load(result):
    return result["statusCode"], json.loads(result["body"])


@pytest.fixture
def aws_env(table_env):
    with mock_aws():
        _create_table()
        yield


def test_health(aws_env):
    status, body = load(api.handler(apigw("GET", "/health"), None))
    assert status == 200
    assert body["ok"] is True
    assert body["service"] == "udhaar-khata"


def test_add_udhaar_and_payment_updates_balance(aws_env):
    status, body = load(
        api.handler(
            apigw("POST", "/transactions", {"text": "Ramesh took 2 kg rice for 120 rupees"}),
            None,
        )
    )
    assert status == 201
    assert body["parsed"]["txn_type"] == "UDHAAR"
    assert body["customer"]["balance"] == 120.0

    status, body = load(
        api.handler(apigw("POST", "/transactions", {"text": "Ramesh paid 50", "phone": "9876543210"}), None)
    )
    assert status == 201
    assert body["customer"]["balance"] == 70.0
    assert body["customer"]["phone"] == "9876543210"

    status, body = load(api.handler(apigw("GET", "/customers"), None))
    assert status == 200
    assert len(body["customers"]) == 1
    assert body["customers"][0]["name"] == "Ramesh"
    assert body["customers"][0]["balance"] == 70.0


def test_transaction_history(aws_env):
    api.handler(apigw("POST", "/transactions", {"text": "Sita diya 10"}), None)
    # payment on a new customer goes negative? Sita diya 10 -> balance -10. That's allowed
    # (shopkeeper recorded a payment first). Fine.
    api.handler(apigw("POST", "/transactions", {"text": "Sita ne 80 ka udhaar liya"}), None)
    status, body = load(
        api.handler(
            apigw("GET", "/customers/Sita/transactions", path_params={"name": "Sita"}),
            None,
        )
    )
    assert status == 200
    assert len(body["transactions"]) == 2
    types = {row["txn_type"] for row in body["transactions"]}
    assert types == {"UDHAAR", "PAYMENT"}


def test_unknown_customer_history_is_404(aws_env):
    status, body = load(
        api.handler(
            apigw("GET", "/customers/Nobody/transactions", path_params={"name": "Nobody"}),
            None,
        )
    )
    assert status == 404
    assert body["ok"] is False


def test_bad_sentence_is_400(aws_env):
    status, body = load(api.handler(apigw("POST", "/transactions", {"text": "hello"}), None))
    assert status == 400
    assert body["ok"] is False


def test_unknown_route(aws_env):
    status, body = load(api.handler(apigw("GET", "/nope"), None))
    assert status == 404


def test_reminders_skip_recent_dues(aws_env):
    api.handler(apigw("POST", "/transactions", {"text": "Ramesh took rice for 120 rupees"}), None)
    # Default overdue_days is 7; a brand-new due should not be reminded.
    result = reminders.run_reminders(overdue_days=7)
    assert result["reminders_written"] == 0


def test_reminders_include_old_dues_and_whatsapp_link(aws_env, table_env):
    ledger = Ledger()
    saved = ledger.add_transaction("Ramesh", 120, "UDHAAR", "Ramesh took rice for 120", phone="9876543210")
    # Backdate the due date so the customer is overdue.
    old = (datetime.now(timezone.utc) - timedelta(days=10)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    customer = ledger.get_customer("Ramesh")
    customer["first_due_at"] = old
    ledger.table.put_item(Item=customer)

    result = reminders.run_reminders(overdue_days=7)
    assert result["reminders_written"] == 1
    reminder = result["reminders"][0]
    assert reminder["name"] == "Ramesh"
    assert reminder["days_overdue"] >= 10
    assert reminder["whatsapp_url"].startswith("https://wa.me/919876543210?text=")
    assert "120" in reminder["message"]

    status, body = load(api.handler(apigw("GET", "/reminders"), None))
    assert status == 200
    assert len(body["reminders"]) == 1


def test_demo_mode_zero_days_includes_today(aws_env):
    api.handler(apigw("POST", "/transactions", {"text": "Amit ne 200 ka udhaar liya"}), None)
    result = reminders.run_reminders(overdue_days=0)
    assert result["reminders_written"] == 1
    assert result["reminders"][0]["name"] == "Amit"


def test_reminders_run_via_api_without_state_machine(aws_env):
    api.handler(apigw("POST", "/transactions", {"text": "Amit ne 200 ka udhaar liya"}), None)
    status, body = load(api.handler(apigw("POST", "/reminders/run", {"overdue_days": 0}), None))
    assert status == 200
    assert body["ok"] is True
    assert body["reminders_written"] == 1


def test_extract_overdue_days_from_step_functions_envelope(table_env):
    assert reminders.extract_overdue_days({}) == 7
    assert reminders.extract_overdue_days({"overdue_days": 0}) == 0
    assert reminders.extract_overdue_days({"input": {"overdue_days": 3}}) == 3
    assert reminders.extract_overdue_days({"source": "step-functions", "input": {}}) == 7


def test_money_rounds_to_paise():
    assert money("10.456") == money("10.46")
    assert money(50) == money("50.00")
