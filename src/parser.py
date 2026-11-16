"""Parse plain English / Hinglish shop sentences into a credit-ledger entry.

No paid AI service is used. The parser is a small keyword and regex routine
that a shopkeeper can learn in one glance:

    Ramesh took 2 kg rice for 120 rupees   -> Ramesh, Rs 120, UDHAAR
    Ramesh paid 50                         -> Ramesh, Rs 50,  PAYMENT
    Amit ne 200 ka udhaar liya             -> Amit,   Rs 200, UDHAAR
    Sita diya 50                           -> Sita,   Rs 50,  PAYMENT
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Optional


PAYMENT_WORDS = {
    "paid",
    "payment",
    "pay",
    "pays",
    "paying",
    "diya",
    "diye",
    "dia",
    "deya",
    "diyaa",
    "jama",
    "jamah",
    "settled",
    "settle",
    "settlement",
    "wapas",
    "waapas",
    "return",
    "returned",
    "repay",
    "repaid",
    "clear",
    "cleared",
    "clearing",
    "deposit",
    "deposited",
}

UDHAAR_WORDS = {
    "took",
    "take",
    "takes",
    "taken",
    "udhaar",
    "udhar",
    "udhari",
    "liya",
    "liye",
    "lia",
    "liyaa",
    "lene",
    "credit",
    "kharid",
    "kharida",
    "kharidi",
    "kharide",
    "bought",
    "buy",
    "buys",
    "purchase",
    "purchased",
    "loan",
    "due",
    "borrowed",
    "borrow",
}

HONORIFICS = {"ji", "sir", "madam", "madame", "bhai", "ben", "anna"}

QUANTITY_UNITS = {
    "kg",
    "kilo",
    "kilos",
    "kilogram",
    "kilograms",
    "g",
    "gm",
    "gram",
    "grams",
    "ltr",
    "liter",
    "litre",
    "liters",
    "litres",
    "ml",
    "packet",
    "packets",
    "pkt",
    "pkts",
    "piece",
    "pieces",
    "pc",
    "pcs",
    "item",
    "items",
    "dozen",
    "darjan",
    "bag",
    "bags",
    "box",
    "boxes",
    "bottle",
    "bottles",
    "tin",
    "tins",
}

# Words that end a customer name when they appear after it.
NAME_STOP = (
    {
        "ne",
        "ko",
        "se",
        "ke",
        "ki",
        "ka",
        "a",
        "an",
        "the",
        "for",
        "from",
        "to",
        "of",
        "and",
        "rs",
        "rupee",
        "rupees",
        "inr",
        "on",
        "in",
        "with",
        "by",
        "as",
        "has",
        "have",
        "had",
        "his",
        "her",
        "their",
        "my",
        "our",
    }
    | PAYMENT_WORDS
    | UDHAAR_WORDS
    | QUANTITY_UNITS
)

AMOUNT_PATTERNS = [
    re.compile(r"₹\s*(\d+(?:\.\d{1,2})?)"),
    re.compile(r"(?:rs\.?|rupees?|inr)\s*(\d+(?:\.\d{1,2})?)", re.IGNORECASE),
    re.compile(r"(\d+(?:\.\d{1,2})?)\s*(?:rs\.?|rupees?|inr|₹|/-)", re.IGNORECASE),
    re.compile(r"(?:for|ka|ki|ke)\s+(\d+(?:\.\d{1,2})?)\b", re.IGNORECASE),
]


@dataclass
class ParseResult:
    ok: bool
    customer: Optional[str] = None
    amount: Optional[float] = None
    txn_type: Optional[str] = None  # UDHAAR or PAYMENT
    raw_text: str = ""
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


def _detect_type(tokens_lower: list[str]) -> Optional[str]:
    has_payment = any(t in PAYMENT_WORDS for t in tokens_lower)
    has_udhaar = any(t in UDHAAR_WORDS for t in tokens_lower)
    if has_payment:
        # "paid his udhaar" / "udhaar settled" is a payment.
        return "PAYMENT"
    if has_udhaar:
        return "UDHAAR"
    return None


def _extract_amount(text: str) -> Optional[float]:
    for pattern in AMOUNT_PATTERNS:
        matches = pattern.findall(text)
        if matches:
            return round(float(matches[-1]), 2)

    # Fallback: numbers that are not quantities (not followed by kg, litre, …).
    tokens = re.findall(r"[A-Za-z]+|\d+(?:\.\d{1,2})?", text)
    skip = set()
    for i, tok in enumerate(tokens):
        if re.fullmatch(r"\d+(?:\.\d{1,2})?", tok):
            nxt = tokens[i + 1].lower() if i + 1 < len(tokens) else ""
            if nxt in QUANTITY_UNITS:
                skip.add(i)
    amounts = [
        float(tok)
        for i, tok in enumerate(tokens)
        if i not in skip and re.fullmatch(r"\d+(?:\.\d{1,2})?", tok)
    ]
    if not amounts:
        return None
    return round(amounts[-1], 2)


def _extract_customer(text: str) -> Optional[str]:
    cleaned = re.sub(r"[₹,]", " ", text)
    words = re.findall(r"[A-Za-z][A-Za-z'.]*", cleaned)
    parts: list[str] = []
    for word in words:
        lowered = word.lower().rstrip(".")
        if lowered in HONORIFICS:
            continue
        if lowered in NAME_STOP:
            break
        parts.append(word)
    if not parts:
        return None
    # Most personal names in this context are one to three words.
    name = " ".join(parts[:3])
    return " ".join(part.capitalize() for part in name.split())


def parse(text: str) -> ParseResult:
    if text is None or not str(text).strip():
        return ParseResult(
            ok=False,
            raw_text="" if text is None else str(text),
            error=(
                "Please enter a sentence, for example: "
                "'Ramesh took 2 kg rice for 120 rupees'."
            ),
        )

    raw = str(text).strip()
    normalized = re.sub(r"\s+", " ", raw).replace(",", "")

    tokens = re.findall(r"[A-Za-z]+|\d+(?:\.\d+)?", normalized)
    tokens_lower = [t.lower() for t in tokens]

    txn_type = _detect_type(tokens_lower)
    amount = _extract_amount(normalized)
    customer = _extract_customer(normalized)

    if not customer:
        return ParseResult(
            ok=False,
            raw_text=raw,
            error=(
                "Could not find the customer name. Try starting with the name, "
                "for example: 'Ramesh paid 50'."
            ),
        )
    if amount is None:
        return ParseResult(
            ok=False,
            raw_text=raw,
            customer=customer,
            error=(
                "Could not find the amount. Try 'Ramesh paid 50' or "
                "'Ramesh took rice for 120 rupees'."
            ),
        )
    if amount <= 0:
        return ParseResult(
            ok=False,
            raw_text=raw,
            customer=customer,
            amount=amount,
            error="Amount must be greater than zero.",
        )
    if txn_type is None:
        # A name plus an amount with no verb is treated as new credit,
        # which is how a kirana owner typically uses a one-line khata entry.
        txn_type = "UDHAAR"

    return ParseResult(
        ok=True,
        customer=customer,
        amount=amount,
        txn_type=txn_type,
        raw_text=raw,
    )
