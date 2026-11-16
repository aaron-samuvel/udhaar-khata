import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))


@pytest.fixture
def table_env(monkeypatch):
    monkeypatch.setenv("TABLE_NAME", "UdhaarKhataTest")
    monkeypatch.setenv("SHOP_ID", "default")
    monkeypatch.setenv("OVERDUE_DAYS", "7")
    monkeypatch.delenv("STATE_MACHINE_ARN", raising=False)


@pytest.fixture
def ledger(table_env):
    import boto3
    from moto import mock_aws

    from db import Ledger

    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="ap-south-1")
        dynamodb.create_table(
            TableName="UdhaarKhataTest",
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
        yield Ledger(table_name="UdhaarKhataTest", shop_id="default", dynamodb_resource=dynamodb)

@pytest.fixture(autouse=True)
def aws_region_and_dummy_creds(monkeypatch):
    """Lambda sets AWS_REGION automatically; local tests must set a region themselves."""
    monkeypatch.setenv("AWS_DEFAULT_REGION", "ap-south-1")
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_SECURITY_TOKEN", "testing")
    monkeypatch.setenv("AWS_SESSION_TOKEN", "testing")

