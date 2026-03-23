"""
Precompute PolicyEngine results for the CA wealth tax calculator.

Outputs static JSON files that the Next.js app loads directly.
Run this whenever policyengine-us updates or assumptions change.

Usage:
    cd ~/PolicyEngine/policyengine-us
    .venv/bin/python ~/PolicyEngine/california-wealth-tax/scripts/precompute.py
"""

import json
import numpy as np
from pathlib import Path
from policyengine_us import Microsimulation, Simulation

OUTPUT_DIR = Path(__file__).parent.parent / "data"
OUTPUT_DIR.mkdir(exist_ok=True)


def weighted_positive_sum(series):
    clipped = series.clip(lower=0)
    return float((clipped.values * clipped.weights).sum())


def compute_tax_shares():
    """Compute federal vs CA state income tax shares by AGI threshold."""
    sim = Microsimulation(
        dataset="hf://policyengine/policyengine-us-data/states/CA.h5"
    )

    agi = sim.calc("adjusted_gross_income", period=2026)
    fed_tax = sim.calc("income_tax", period=2026)
    state_tax = sim.calc("state_income_tax", period=2026)

    w = agi.weights
    agi_v = agi.values
    fed_v = fed_tax.values
    state_v = state_tax.values

    fed_total = (fed_v * w).sum()
    state_total = (state_v * w).sum()

    thresholds = [100_000, 250_000, 500_000, 1_000_000, 5_000_000, 10_000_000]
    rows = []

    for t in thresholds:
        mask = agi_v > t
        fed_share = float((fed_v[mask] * w[mask]).sum() / fed_total)
        state_share = float((state_v[mask] * w[mask]).sum() / state_total)
        rows.append(
            {
                "threshold": t,
                "fed_share": fed_share,
                "state_share": state_share,
                "ratio": state_share / fed_share if fed_share > 0 else None,
                "raw_records": int(mask.sum()),
                "weighted_count": int(w[mask].sum()),
            }
        )

    return {
        "fed_total_billions": float(fed_total / 1e9),
        "state_total_billions": float(state_total / 1e9),
        "shares": rows,
    }


def compute_effective_rates():
    """Compute effective fed/CA tax rates for wages vs LTCG at various incomes."""
    incomes = [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000, 100_000_000]
    rows = []

    for income in incomes:
        for income_type, var_name in [
            ("wages", "employment_income"),
            ("ltcg", "long_term_capital_gains"),
        ]:
            sim = Simulation(
                situation={
                    "people": {
                        "person": {
                            "age": {"2026": 40},
                            var_name: {"2026": income},
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
            fed = float(sim.calculate("income_tax", "2026")[0])
            ca = float(sim.calculate("ca_income_tax", "2026")[0])
            rows.append(
                {
                    "income": income,
                    "type": income_type,
                    "fed_tax": fed,
                    "ca_tax": ca,
                    "eff_fed_rate": fed / income,
                    "eff_ca_rate": ca / income,
                    "ca_fed_ratio": ca / fed if fed > 0 else None,
                }
            )

    return rows


def compute_progressivity():
    """Compute Gini-based progressivity: fed rate structure vs CA."""
    sim = Microsimulation(
        dataset="hf://policyengine/policyengine-us-data/states/CA.h5"
    )

    hh_net = sim.calc("household_net_income", period=2026, map_to="person")
    fed_tax_before = sim.calc(
        "income_tax_before_refundable_credits", period=2026, map_to="person"
    )
    state_tax_before = sim.calc(
        "state_income_tax_before_refundable_credits",
        period=2026,
        map_to="person",
    )

    no_fed_rates = (hh_net + fed_tax_before).clip(lower=0)
    no_state = (hh_net + state_tax_before).clip(lower=0)
    actual = hh_net.clip(lower=0)

    gini_actual = float(actual.gini())
    gini_no_fed = float(no_fed_rates.gini())
    gini_no_state = float(no_state.gini())

    fed_impact = gini_no_fed - gini_actual
    state_impact = gini_no_state - gini_actual

    fed_tax_before_tax_unit = sim.calc(
        "income_tax_before_refundable_credits", period=2026
    )
    state_tax_before_tax_unit = sim.calc(
        "state_income_tax_before_refundable_credits", period=2026
    )
    fed_rev = weighted_positive_sum(fed_tax_before_tax_unit)
    state_rev = weighted_positive_sum(state_tax_before_tax_unit)

    return {
        "gini_actual": gini_actual,
        "gini_no_fed_rates": gini_no_fed,
        "gini_no_state": gini_no_state,
        "fed_gini_reduction": float(fed_impact),
        "state_gini_reduction": float(state_impact),
        "fed_revenue_billions": fed_rev / 1e9,
        "state_revenue_billions": state_rev / 1e9,
        "fed_gini_per_trillion": float(fed_impact / (fed_rev / 1e12)),
        "state_gini_per_trillion": float(state_impact / (state_rev / 1e12)),
        "progressivity_ratio": float(
            (state_impact / (state_rev / 1e12)) / (fed_impact / (fed_rev / 1e12))
        ),
    }


def main():
    print("Computing tax shares...")
    tax_shares = compute_tax_shares()
    with open(OUTPUT_DIR / "tax_shares.json", "w") as f:
        json.dump(tax_shares, f, indent=2)
    print(f"  Saved tax_shares.json")

    print("Computing effective rates...")
    effective_rates = compute_effective_rates()
    with open(OUTPUT_DIR / "effective_rates.json", "w") as f:
        json.dump(effective_rates, f, indent=2)
    print(f"  Saved effective_rates.json")

    print("Computing progressivity...")
    progressivity = compute_progressivity()
    with open(OUTPUT_DIR / "progressivity.json", "w") as f:
        json.dump(progressivity, f, indent=2)
    print(f"  Saved progressivity.json")

    print("Done.")


if __name__ == "__main__":
    main()
