# California wealth tax fiscal impact calculator

Interactive tool analyzing the fiscal impact of California's proposed 2026
Billionaire Tax Act (Initiative 25-0024), a one-time 5% tax on net worth above
$1 billion.

**Live app**: https://california-wealth-tax.vercel.app

## Scope

This repo is intentionally narrow. It models the fiscal impact of the wealth
tax under user-set assumptions about:

- baseline one-time wealth tax revenue
- avoidance
- departures
- annual return hazard for remaining movers
- annual California-taxable income as a share of taxed wealth
- time horizon and discounting

California income tax is not entered directly. The app derives it from
PolicyEngine's `ca_income_tax` calculation using a precomputed lookup at
billionaire-scale income levels.

The preset buttons are calibrated to the headline figures in:

- [Galle, Gamage, Saez & Shanske (2026)](https://eml.berkeley.edu/~saez/galle-gamage-saez-shanskeCAbillionairetaxDec25.pdf)
- [Rauh, Jaros, Kearney, Doran & Cosso (2026)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6340778)

They are simplified calibrations, not full replications of either paper.

### Preset calibration notes

- **Saez headline**: the backed-out parameter is the gross one-time score. The
  app sets it to `$109.5B` so that, after a `10%` avoidance assumption,
  collected wealth-tax revenue is about `$98.6B`, close to the paper's roughly
  `$100B` static headline.
- **Rauh headline**: the backed-out parameter is the annual taxable-income
  yield on wealth. The app sets it to `3.6%` so that, given a `$67.2B` gross
  score, `15%` avoidance, `30%` departures, zero return migration, a `3%`
  discount rate, and a perpetuity horizon, the simplified model lands at about
  `-$24.7B`.
- In both presets, other values like the discounting setup, return path, and
  the mapping from annual taxable income to California income tax come from
  this app's simplified model layer, not from a full paper replication.

## Features

- One-page fiscal impact calculator
- Shareable scenario URLs
- Annual return-hazard migration model
- Income-to-wealth assumption instead of a free dollar income input
- Year-by-year cash-flow chart alongside the discounted summary
- Waterfall chart from baseline revenue to net fiscal impact
- PolicyEngine-backed California income-tax lookup

## Data

### Precomputed from PolicyEngine

- `data/income_tax_lookup.json` — California income tax at billionaire-scale
  annual incomes, used to map derived annual taxable income to annual CA income
  tax

### External references

- **Rauh et al. replication code**: https://github.com/bjaros20/wealth_tax
- **Forbes real-time billionaires API**: https://github.com/komed3/rtb-api
- **PolicyEngine US model**: https://github.com/PolicyEngine/policyengine-us

## Architecture

```text
app/
├── page.js                 # Main calculator page
├── components/
│   ├── Slider.js           # Reusable slider + exact input
│   └── WaterfallChart.js   # Recharts waterfall
├── globals.css             # PE-flavored design tokens + Tailwind
└── layout.js               # Metadata + fonts

lib/
├── calculator.js           # Pure JS fiscal impact model
├── incomeTaxLookup.js      # Maps annual taxable income to CA income tax
├── scenarioUrl.js          # URL parsing/serialization for shared scenarios
└── waterfall.js            # Waterfall chart presentation helpers

scripts/
└── precompute.py           # Generates the income-tax lookup from PolicyEngine
```

The app is fully static. All PolicyEngine-dependent values are precomputed into
JSON and loaded client-side. There are no runtime API calls.

## Development

```bash
npm install
npm run dev
npm run build
```

### Regenerating the income-tax lookup

Requires `policyengine-us` installed:

```bash
cd ~/PolicyEngine/policyengine-us
.venv/bin/python ~/PolicyEngine/california-wealth-tax/scripts/precompute.py
```

## Related work

- [State tax progressivity explorer](../state-tax-progressivity) — separate repo
  for cross-state rate structure and progressivity analysis
