"""Single-table DynamoDB access for the Udhaar Khata ledger."""

from __future__ import annotations

import os
import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional
from urllib.parse import quote

import boto3
from boto3.dynamodb.conditions import Key


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def money(value: Any) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def name_key(name: str) -> str:
    cleaned = re.sub(r"\s+", " ", (name or "").strip())
    return cleaned.upper()


def shop_pk(shop_id: str) -> str:
    return f"SHOP#{shop_id}"


def normalize_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    digits = re.sub(r"\D", "", str(phone))
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    if len(digits) == 10:
        return digits
    return None


def whatsapp_link(name: str, balance: Decimal, phone: Optional[str]) -> tuple[str, str]:
    amount = f"{money(balance):.2f}"
    message = (
        f"Namaste {name} ji, aapka udhaar Rs {amount} pending hai. "
        "Kripya jald payment kar dein. Dhanyavaad! — Udhaar Khata"
    )
    encoded = quote(message)
    digits = normalize_phone(phone)
    if digits:
        url = f"https://wa.me/91{digits}?text={encoded}"
    else:
        url = f"https://wa.me/?text={encoded}"
    return url, message


def days_since(iso_ts: Optional[str]) -> int:
    if not iso_ts:
        return 0
    try:
        parsed = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
    except ValueError:
        return 0
    delta = datetime.now(timezone.utc) - parsed
    return max(0, delta.days)


def item_to_public(item: dict) -> dict:
    """Convert a DynamoDB item into a JSON-friendly dict (no keys leaked raw)."""
    out = {}
    for key, value in item.items():
        if key in {"PK", "SK"}:
            continue
        if isinstance(value, Decimal):
            out[key] = float(value)
        else:
            out[key] = value
    return out


class Ledger:
    def __init__(
        self,
        table_name: Optional[str] = None,
        shop_id: Optional[str] = None,
        dynamodb_resource=None,
    ):
        self.table_name = table_name or os.environ["TABLE_NAME"]
        self.shop_id = shop_id or os.environ.get("SHOP_ID", "default")
        self._resource = dynamodb_resource
        self._table = None

    @property
    def table(self):
        if self._table is None:
            resource = self._resource or boto3.resource("dynamodb")
            self._table = resource.Table(self.table_name)
        return self._table

    def get_customer(self, customer: str) -> Optional[dict]:
        result = self.table.get_item(
            Key={"PK": shop_pk(self.shop_id), "SK": f"CUST#{name_key(customer)}"}
        )
        return result.get("Item")

    def add_transaction(
        self,
        customer: str,
        amount: Any,
        txn_type: str,
        raw_text: str,
        phone: Optional[str] = None,
    ) -> dict:
        amount_d = money(amount)
        if amount_d <= 0:
            raise ValueError("Amount must be greater than zero.")
        if txn_type not in {"UDHAAR", "PAYMENT"}:
            raise ValueError("txn_type must be UDHAAR or PAYMENT.")

        key = name_key(customer)
        now = utc_now()
        existing = self.get_customer(customer) or {}
        old_balance = money(existing.get("balance", "0"))
        if txn_type == "UDHAAR":
            new_balance = money(old_balance + amount_d)
        else:
            new_balance = money(old_balance - amount_d)

        first_due_at = existing.get("first_due_at")
        if new_balance > 0 and (not first_due_at or old_balance <= 0):
            first_due_at = now
        if new_balance <= 0:
            first_due_at = None

        saved_phone = normalize_phone(phone) or existing.get("phone")
        display_name = existing.get("name") or customer

        txn_sk = f"TXN#{now}#{uuid.uuid4().hex[:8]}"
        txn_item = {
            "PK": f"CUST#{key}",
            "SK": txn_sk,
            "type": "TXN",
            "shop_id": self.shop_id,
            "name": display_name,
            "amount": amount_d,
            "txn_type": txn_type,
            "raw_text": raw_text,
            "created_at": now,
        }

        cust_item = {
            "PK": shop_pk(self.shop_id),
            "SK": f"CUST#{key}",
            "type": "CUSTOMER",
            "shop_id": self.shop_id,
            "name": display_name,
            "name_key": key,
            "balance": new_balance,
            "last_txn_at": now,
            "updated_at": now,
        }
        if first_due_at:
            cust_item["first_due_at"] = first_due_at
        if saved_phone:
            cust_item["phone"] = saved_phone
        if not existing:
            cust_item["created_at"] = now

        # Two writes: the running balance and the immutable transaction line.
        self.table.put_item(Item=cust_item)
        self.table.put_item(Item=txn_item)

        return {
            "transaction": item_to_public(txn_item),
            "customer": item_to_public(cust_item),
        }

    def list_customers(self) -> list[dict]:
        items: list[dict] = []
        kwargs = {
            "KeyConditionExpression": Key("PK").eq(shop_pk(self.shop_id))
            & Key("SK").begins_with("CUST#")
        }
        while True:
            result = self.table.query(**kwargs)
            items.extend(result.get("Items", []))
            if "LastEvaluatedKey" not in result:
                break
            kwargs["ExclusiveStartKey"] = result["LastEvaluatedKey"]
        public = [item_to_public(i) for i in items]
        public.sort(key=lambda c: (-float(c.get("balance") or 0), c.get("name") or ""))
        return public

    def list_transactions(self, customer: str) -> list[dict]:
        items: list[dict] = []
        kwargs = {
            "KeyConditionExpression": Key("PK").eq(f"CUST#{name_key(customer)}")
            & Key("SK").begins_with("TXN#"),
            "ScanIndexForward": False,
        }
        while True:
            result = self.table.query(**kwargs)
            items.extend(result.get("Items", []))
            if "LastEvaluatedKey" not in result:
                break
            kwargs["ExclusiveStartKey"] = result["LastEvaluatedKey"]
        return [item_to_public(i) for i in items]

    def list_reminders(self, limit: int = 50) -> list[dict]:
        result = self.table.query(
            KeyConditionExpression=Key("PK").eq(shop_pk(self.shop_id))
            & Key("SK").begins_with("REM#"),
            ScanIndexForward=False,
            Limit=limit,
        )
        return [item_to_public(i) for i in result.get("Items", [])]

    def write_reminders(
        self, overdue_days: int, run_id: Optional[str] = None
    ) -> list[dict]:
        overdue_days = int(overdue_days)
        run_id = run_id or uuid.uuid4().hex[:10]
        now = utc_now()
        written: list[dict] = []

        for customer in self.list_customers():
            balance = money(customer.get("balance") or 0)
            if balance <= 0:
                continue
            due_from = customer.get("first_due_at") or customer.get("last_txn_at")
            age = days_since(due_from)
            if age < overdue_days:
                continue

            name = customer.get("name") or "Customer"
            url, message = whatsapp_link(name, balance, customer.get("phone"))
            item = {
                "PK": shop_pk(self.shop_id),
                "SK": f"REM#{now}#{name_key(name)}",
                "type": "REMINDER",
                "shop_id": self.shop_id,
                "name": name,
                "balance": balance,
                "days_overdue": age,
                "whatsapp_url": url,
                "message": message,
                "created_at": now,
                "run_id": run_id,
            }
            if customer.get("phone"):
                item["phone"] = customer["phone"]
            self.table.put_item(Item=item)
            written.append(item_to_public(item))

        return written
