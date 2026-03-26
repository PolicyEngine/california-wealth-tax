"""
Precompute PolicyEngine results for the CA wealth tax calculator.

Outputs static JSON files that the Next.js app loads directly.
Run this whenever policyengine-us updates or the income-tax lookup assumptions
change.

Usage:
    cd ~/PolicyEngine/policyengine-us
    .venv/bin/python ~/PolicyEngine/california-wealth-tax/scripts/precompute.py
"""

import json
from pathlib import Path

from policyengine_us import Simulation

OUTPUT_DIR = Path(__file__).parent.parent / "data"
OUTPUT_DIR.mkdir(exist_ok=True)


def compute_income_tax_lookup():
    """Compute CA income tax at billionaire-scale incomes."""
    incomes = [
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
        sim = Simulation(
            situation={
                "people": {
                    "person": {
                        "age": {"2026": 40},
                        "employment_income": {"2026": income},
                    }
                },
                "tax_units": {"tax_unit": {"members": ["person"]}},
                "families": {"family": {"members": ["person"]}},
                "spm_units": {"spm_unit": {"members": ["person"]}},
                "marital_units": {"marital_unit": {"members": ["person"]}},
                "households": {
                    "household": {
                        "members": ["person"],
                        "state_code": {"2026": "CA"},
                    }
                },
            }
        )
        ca_tax = float(sim.calculate("ca_income_tax", "2026")[0])
        rows.append(
            {
                "income": income,
                "ca_tax": ca_tax,
                "eff_ca_rate": ca_tax / income,
            }
        )

    return rows


def main():
    print("Computing income tax lookup...")
    income_tax_lookup = compute_income_tax_lookup()
    with open(OUTPUT_DIR / "income_tax_lookup.json", "w") as f:
        json.dump(income_tax_lookup, f, indent=2)
    print("  Saved income_tax_lookup.json")

    print("Done.")


if __name__ == "__main__":
    main()
