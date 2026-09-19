"""
Precompute PolicyEngine results for the CA wealth tax calculator.

Outputs static JSON files that the Next.js app loads directly.
Run this whenever policyengine-us updates or the income-tax lookup assumptions
change.

Usage:
    uv run --with "policyengine[us]" python scripts/precompute.py
"""

import json
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "data"
OUTPUT_DIR.mkdir(exist_ok=True)


def calculate_ca_tax(income: float, year: int) -> float:
    """Calculate one California household through the PolicyEngine interface."""
    import policyengine as pe

    result = pe.us.calculate_household(
        people=[{"age": 40, "employment_income": income}],
        tax_unit={"filing_status": "SINGLE"},
        household={"state_code": "CA"},
        year=year,
        extra_variables=["ca_income_tax"],
    )
    return float(result.tax_unit.ca_income_tax)


def compute_income_tax_lookup(*, year=2026, incomes=None, calculate_tax=None):
    """Return the app's year-keyed lookup; allow schema tests without model imports."""
    calculate_tax = calculate_tax or calculate_ca_tax
    incomes = incomes if incomes is not None else [
        100_000_000,
        250_000_000,
        500_000_000,
        1_000_000_000,
        2_000_000_000,
        5_000_000_000,
        10_000_000_000,
        20_000_000_000,
        30_000_000_000,
        40_000_000_000,
        50_000_000_000,
        60_000_000_000,
    ]
    rows = []

    for income in incomes:
        ca_tax = calculate_tax(income, year)
        rows.append(
            {
                "income": income,
                "ca_tax": ca_tax,
                "eff_ca_rate": ca_tax / income,
            }
        )

    return {str(year): rows}


def main():
    print("Computing income tax lookup...")
    income_tax_lookup = compute_income_tax_lookup()
    with open(OUTPUT_DIR / "income_tax_lookup.json", "w") as f:
        json.dump(income_tax_lookup, f, indent=2)
    print("  Saved income_tax_lookup.json")

    print("Done.")


if __name__ == "__main__":
    main()
