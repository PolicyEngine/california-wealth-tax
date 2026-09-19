"""Schema contract only: reuse committed tax amounts, without recomputing rates."""
import json
import subprocess
from pathlib import Path

from precompute import compute_income_tax_lookup

ROOT = Path(__file__).resolve().parents[1]


def test_generated_lookup_is_consumable_by_the_app():
    committed = json.loads((ROOT / "data/income_tax_lookup.json").read_text())["2026"]
    by_income = {row["income"]: row["ca_tax"] for row in committed}
    generated = compute_income_tax_lookup(
        year=2026, incomes=list(by_income),
        calculate_tax=lambda income, year: by_income[income],
    )
    assert generated == {"2026": committed}
    result = subprocess.run(
        ["bun", "-e", "import {estimateCaliforniaIncomeTaxB} from './lib/incomeTaxLookup.js';"
         "const lookup=await Bun.stdin.json();"
         "console.log(JSON.stringify(lookup['2026'].map(row => "
         "estimateCaliforniaIncomeTaxB(row.income/1e9,lookup)*1e9)));"],
        cwd=ROOT, input=json.dumps(generated), text=True, capture_output=True, check=True,
    )
    actual = json.loads(result.stdout)
    for value, row in zip(actual, committed, strict=True):
        assert abs(value - row["ca_tax"]) < 0.0001
