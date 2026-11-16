"""HTTP API Lambda for Udhaar Khata (API Gateway HTTP API, payload format 2.0)."""

from __future__ import annotations

import json
import os
import time
import uuid
from decimal import Decimal
from urllib.parse import unquote

import boto3

from db import Ledger
from parser import parse


def _json_default(value):
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"Cannot serialize {type(value)}")


def respond(status: int, body: dict):
    # CORS is configured on the HTTP API. Do not send Access-Control-*
    # headers here or browsers may see duplicates and block the request.
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body, default=_json_default),
    }


def _path(event: dict) -> str:
    http = event.get("requestContext", {}).get("http", {})
    path = http.get("path") or event.get("rawPath") or "/"
    if path != "/" and path.endswith("/"):
        path = path[:-1]
    return path


def _method(event: dict) -> str:
    http = event.get("requestContext", {}).get("http", {})
    return (http.get("method") or event.get("httpMethod") or "GET").upper()


def _body(event: dict) -> dict:
    raw = event.get("body")
    if not raw:
        return {}
    if event.get("isBase64Encoded"):
        import base64

        raw = base64.b64decode(raw).decode("utf-8")
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("Request body must be JSON.") from exc


def _ledger() -> Ledger:
    return Ledger()


def _start_reminder_execution(overdue_days) -> dict:
    arn = os.environ.get("STATE_MACHINE_ARN")
    if not arn:
        # Local tests / fallback: run the reminder writer in-process.
        from reminders import run_reminders

        return run_reminders(overdue_days)

    client = boto3.client("stepfunctions")
    payload = {}
    if overdue_days is not None:
        payload["overdue_days"] = int(overdue_days)
    started = client.start_execution(
        stateMachineArn=arn,
        name=f"api-{int(time.time())}-{uuid.uuid4().hex[:8]}",
        input=json.dumps(payload),
    )
    execution_arn = started["executionArn"]
    deadline = time.time() + 12
    last = None
    while time.time() < deadline:
        last = client.describe_execution(executionArn=execution_arn)
        if last["status"] != "RUNNING":
            break
        time.sleep(0.4)

    result = {
        "execution_arn": execution_arn,
        "status": (last or {}).get("status", "RUNNING"),
    }
    output = (last or {}).get("output")
    if output:
        try:
            result.update(json.loads(output))
        except json.JSONDecodeError:
            result["raw_output"] = output
    return result


def handler(event, _context):
    method = _method(event)
    path = _path(event)

    if method == "OPTIONS":
        return respond(204, {})

    try:
        if method == "GET" and path == "/health":
            return respond(
                200,
                {"ok": True, "service": "udhaar-khata", "shop_id": os.environ.get("SHOP_ID", "default")},
            )

        if method == "POST" and path == "/transactions":
            payload = _body(event)
            text = payload.get("text") or payload.get("sentence") or ""
            parsed = parse(text)
            if not parsed.ok:
                return respond(400, {"ok": False, "error": parsed.error, "parsed": parsed.to_dict()})
            saved = _ledger().add_transaction(
                customer=parsed.customer,
                amount=parsed.amount,
                txn_type=parsed.txn_type,
                raw_text=parsed.raw_text,
                phone=payload.get("phone"),
            )
            return respond(201, {"ok": True, "parsed": parsed.to_dict(), **saved})

        if method == "GET" and path == "/customers":
            return respond(200, {"ok": True, "customers": _ledger().list_customers()})

        if method == "GET" and path.endswith("/transactions") and path.startswith("/customers/"):
            params = event.get("pathParameters") or {}
            name = params.get("name")
            if not name:
                mid = path[len("/customers/") : -len("/transactions")]
                name = mid
            name = unquote(name)
            customer = _ledger().get_customer(name)
            if not customer:
                return respond(404, {"ok": False, "error": f"No customer named {name}."})
            from db import item_to_public

            return respond(
                200,
                {
                    "ok": True,
                    "customer": item_to_public(customer),
                    "transactions": _ledger().list_transactions(name),
                },
            )

        if method == "GET" and path == "/reminders":
            return respond(200, {"ok": True, "reminders": _ledger().list_reminders()})

        if method == "POST" and path == "/reminders/run":
            payload = _body(event)
            overdue = payload.get("overdue_days")
            result = _start_reminder_execution(overdue)
            return respond(200, {"ok": True, **result})

        return respond(404, {"ok": False, "error": f"No route for {method} {path}."})
    except ValueError as exc:
        return respond(400, {"ok": False, "error": str(exc)})
    except Exception as exc:  # noqa: BLE001 — last-resort API error surface
        return respond(500, {"ok": False, "error": "Something went wrong.", "detail": str(exc)})
