# California wealth tax fiscal impact calculator

Interactive calculator for California's proposed 2026 Billionaire Tax Act
(Initiative 25-0024), a one-time 5% tax on net worth above $1 billion.

**Live app**: https://policyengine.org/us/california-wealth-tax

## Scope

The app separates the score into two stages:

- Stage 1 computes one-time wealth-tax receipts from the billionaire roster,
  valuation snapshot, legal-liability assumptions, real-estate exclusion,
  statutory phase-in, payment timing, non-migration erosion, and modeled wealth
  outside the tax base.
- Stage 2 optionally subtracts future California personal income tax losses from
  selected movers, with explicit assumptions for causal attribution, income
  yield, return migration, horizon, and discounting.

The named starting points are reference scenarios, not endorsements:

- **Berkeley (Saez et al.)** uses the paper-date Forbes snapshot, broad Forbes
  base, 10% non-migration erosion, and no future income-tax effects.
- **Hoover (Rauh et al.)** uses the paper-date Forbes snapshot, contested
  residency and departure exclusions, real-estate exclusion, additional
  migration response, and future income-tax effects.
- **Custom** starts from current Forbes data and walks through each assumption.

## Data

- Forbes wealth snapshots are stored in `public/snapshots/` and indexed in
  `public/snapshots/index.json`.
- The current live snapshot is mirrored to `data/billionaires_live.json`,
  `data/billionaires_live.csv`, and `data/billionaires_live_meta.json`.
- `data/billionaire_metadata.json` stores local residency/departure corrections
  and synthetic rows.
- `data/income_tax_lookup.json` maps billionaire-scale annual income to
  California personal income tax using PolicyEngine's `ca_income_tax`.

Daily Forbes updates are handled by `.github/workflows/update-forbes.yml`.

## Architecture

```text
app/
├── page.js                 # Calculator shell, tabs, scenario state
├── components/
│   ├── Wizard.js           # Guided assumption flow
│   ├── BillionaireTable.js # Row-level data tab
│   └── WaterfallChart.js   # Fiscal-impact waterfall
├── globals.css             # PolicyEngine-flavored design tokens
└── layout.js               # Metadata and site header

lib/
├── calculator.js           # Pure fiscal-impact math
├── microModel.js           # Person-level wealth-tax and income-tax base logic
├── scenarioUrl.js          # Shareable URL parse/serialize helpers
├── departureResponse.js    # Additional migration-response helpers
└── incomeTaxLookup.js      # Lookup interpolation for CA income tax

scripts/
├── fetch_forbes.py         # Forbes snapshot fetch/update script
├── precompute.py           # Generates income-tax lookup from PolicyEngine
└── test_fetch_forbes.py    # Python tests for the fetch/update path
```

The app is static. PolicyEngine-dependent calculations are precomputed into JSON
and loaded client-side.

## Development

```bash
bun install
bun run dev
bun run test
python -m pytest scripts/test_fetch_forbes.py -q
bun run build
```

### Regenerating the income-tax lookup

Requires `policyengine-us` installed:

```bash
cd ~/PolicyEngine/policyengine-us
.venv/bin/python ~/PolicyEngine/california-wealth-tax/scripts/precompute.py
```

### Rendering the paper

Requires Quarto:

```bash
bun run paper:render
```
