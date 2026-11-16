import pytest

from parser import parse


@pytest.mark.parametrize(
    "text,customer,amount,txn_type",
    [
        ("Ramesh took 2 kg rice for 120 rupees", "Ramesh", 120.0, "UDHAAR"),
        ("Ramesh paid 50", "Ramesh", 50.0, "PAYMENT"),
        ("Ramesh ne 2 kilo chawal liya 120", "Ramesh", 120.0, "UDHAAR"),
        ("Amit ne 200 ka udhaar liya", "Amit", 200.0, "UDHAAR"),
        ("Sita diya 50", "Sita", 50.0, "PAYMENT"),
        ("Priya paid Rs 100", "Priya", 100.0, "PAYMENT"),
        ("Ramesh liya ₹80", "Ramesh", 80.0, "UDHAAR"),
        ("Mohammed Hussain took rice for 250 rupees", "Mohammed Hussain", 250.0, "UDHAAR"),
        ("ramesh ne 50 diye", "Ramesh", 50.0, "PAYMENT"),
        ("Sita ji paid 75", "Sita", 75.0, "PAYMENT"),
        ("Anita took oil for Rs. 90", "Anita", 90.0, "UDHAAR"),
        ("Vikas paid 1,250 rupees", "Vikas", 1250.0, "PAYMENT"),
        ("Kiran 300", "Kiran", 300.0, "UDHAAR"),
        ("Meena settled 40", "Meena", 40.0, "PAYMENT"),
        ("Rahul ne 99.50 ka udhaar liya", "Rahul", 99.50, "UDHAAR"),
        ("Pooja paid her udhaar of 20", "Pooja", 20.0, "PAYMENT"),
        ("Ramesh took 2 kg rice for 120/-", "Ramesh", 120.0, "UDHAAR"),
        ("Asha wapas 30", "Asha", 30.0, "PAYMENT"),
        ("Imran bought sugar for 45 rs", "Imran", 45.0, "UDHAAR"),
        ("Neha jama 100", "Neha", 100.0, "PAYMENT"),
    ],
)
def test_happy_paths(text, customer, amount, txn_type):
    result = parse(text)
    assert result.ok, result.error
    assert result.customer == customer
    assert result.amount == amount
    assert result.txn_type == txn_type


def test_empty_text():
    result = parse("   ")
    assert not result.ok
    assert "sentence" in result.error.lower() or "enter" in result.error.lower()


def test_missing_name():
    result = parse("paid 50 rupees")
    assert not result.ok
    assert "name" in result.error.lower()


def test_missing_amount():
    result = parse("Ramesh took rice")
    assert not result.ok
    assert result.customer == "Ramesh"
    assert "amount" in result.error.lower()


def test_zero_amount():
    result = parse("Ramesh paid 0")
    assert not result.ok
    assert "zero" in result.error.lower()


def test_quantity_is_not_the_amount():
    result = parse("Ramesh took 2 kg rice for 120 rupees")
    assert result.ok
    assert result.amount == 120.0


def test_raw_text_preserved():
    text = "  Ramesh paid 50  "
    result = parse(text)
    assert result.ok
    assert result.raw_text == "Ramesh paid 50"
