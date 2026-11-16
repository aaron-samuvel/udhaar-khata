"""Step Functions task: find overdue customers and write reminder records."""

from __future__ import annotations

import json
import os
from decimal import Decimal

from db import Ledger


def _as_int(value, default: int) -> int:
    if value is None or value == "":
        return default
    return int(value)


def extract_overdue_days(event) -> int:
    default = _as_int(os.environ.get("OVERDUE_DAYS"), 7)
    if event is None:
        return default
    if isinstance(event, str):
        try:
            event = json.loads(event)
        except json.JSONDecodeError:
            return default
    if not isinstance(event, dict):
        return default

    if event.get("overdue_days") is not None:
        return _as_int(event.get("overdue_days"), default)

    inner = event.get("input")
    if isinstance(inner, str):
        try:
            inner = json.loads(inner)
        except json.JSONDecodeError:
            inner = None
    if isinstance(inner, dict) and inner.get("overdue_days") is not None:
        return _as_int(inner.get("overdue_days"), default)

    # API Gateway-style body is not expected here, but be tolerant.
    body = event.get("body")
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except json.JSONDecodeError:
            body = None
    if isinstance(body, dict) and body.get("overdue_days") is not None:
        return _as_int(body.get("overdue_days"), default)

    return default


def run_reminders(overdue_days=None, run_id=None) -> dict:
    days = extract_overdue_days({"overdue_days": overdue_days} if overdue_days is not None else {})
    ledger = Ledger()
    reminders = ledger.write_reminders(days, run_id=run_id)
    return {
        "ok": True,
        "overdue_days": days,
        "reminders_written": len(reminders),
        "reminders": reminders,
    }


def handler(event, _context):
    days = extract_overdue_days(event or {})
    result = run_reminders(overdue_days=days)
    # Step Functions stores the return value as the task output.
    return result


# Allow the JSON encoder used in tests to handle Decimals if someone dumps this.
def json_default(value):
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError
