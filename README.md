# California wealth tax fiscal impact calculator

Interactive tool analyzing the fiscal impacts of California's proposed 2026 Billionaire Tax Act (Initiative 25-0024) — a one-time 5% tax on net worth exceeding $1 billion.

**Live app**: https://california-wealth-tax.vercel.app

## Background

Two recent reports estimate dramatically different fiscal impacts:

| Report | Revenue estimate | Net fiscal impact | Methodology |
|--------|-----------------|-------------------|-------------|
| [Galle, Gamage, Saez & Shanske (2026)](https://eml.berkeley.edu/~saez/galle-gamage-saez-shanskeCAbillionairetaxDec25.pdf) | ~$100B | ~$100B (no income tax offset) | Forbes wealth × 5% × 90% compliance |
| [Rauh, Jaros, Kearney, Doran & Cosso (2026)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6340778) | ~$40B | -$24.7B (net cost) | Person-by-person tax base, migration modeling, income tax NPV |

[Hoopes (2026)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6428578) provides a 7-page methodological comparison of the two reports.

This tool lets users explore how different assumptions drive the gap between these estimates. The preset buttons are calibrated to each paper's headline estimate within a simplified slider model; they are not full replications of the underlying methodologies.

## Features

### Fiscal impact calculator
- Sliders for baseline wealth tax revenue, avoidance rate, departure rate, return migration, income tax estimates, horizon (finite vs perpetuity), and discount rate
- Shareable scenario URLs that update as assumptions change
- Separate display of permanent vs temporary income-tax-loss present value
- Paper-calibrated preset buttons for the Saez et al. and Rauh et al. headline estimates
- Waterfall chart showing sequential adjustments from baseline to net fiscal impact

### Capital gains analysis
- **CA/Fed tax ratio by income type**: Shows that CA taxes LTCG at the same rate as wages (13.3%), while the federal code gives LTCG a preferential rate (23.8% vs 37%). This means billionaires contribute relatively more to CA state income tax than federal-derived ratios suggest.
- **Tax shares by AGI threshold**: Among CA filers with AGI above $5M, they pay 8.9% of CA state income tax but only 6.6% of federal — a ratio of 1.34x.
- **Progressivity comparison**: CA's rate structure is 1.11x as progressive as the federal rate structure per dollar of revenue (excluding federal and state refundable tax credits).

## Data sources

### Precomputed from PolicyEngine microsimulation
- `data/tax_shares.json` — Federal vs CA state income tax shares by AGI threshold (CA-calibrated enhanced CPS, 2026)
- `data/effective_rates.json` — Effective tax rates for wages vs LTCG at various income levels
- `data/progressivity.json` — Gini-based progressivity metrics

Replication notebook: https://gist.github.com/MaxGhenis/bbae835f25e3d07ce57b5e16b7ff170a

### External data and code
- **Rauh et al. replication code**: https://github.com/bjaros20/wealth_tax (MIT license)
  - `NPV_data/Raw_Data_Collection.xlsx` — 214 CA billionaires with Forbes net worth, residency, departure status, real estate valuations
  - `NPV_data/monte_carlo_sim.R` — Pareto fit to FTB data + Monte Carlo for income tax estimates
  - `NPV_data/NPV_dist.R` — 100K-draw NPV simulation
- **Forbes real-time billionaires API**: https://github.com/komed3/rtb-api (MIT license)
- **CA FTB data**: Published filer counts and tax liability by AGI bracket (Table B-4A)
- **PolicyEngine US model**: https://github.com/PolicyEngine/policyengine-us

### Key academic references
- Scheuer & Slemrod (2021). "Taxing Our Wealth." *Journal of Economic Perspectives* 35(1): 207-30.
- Balkir, Saez, Yagan & Zucman (2025). "How Much Tax Do US Billionaires Pay?" NBER WP 34170.
- Rauh & Shyu (2019). "Behavioral Responses to State Income Taxation of High Earners." SSRN 3461513.
- Galle, Gamage & Shanske (2025). "Money Moves: Taxing the Wealthy at the State Level." *California Law Review*.

## Architecture

```
app/
├── page.js              # Main page with tab navigation
├── components/
│   ├── Slider.js        # Reusable slider input
│   ├── WaterfallChart.js # Recharts waterfall
│   ├── EffectiveRatesChart.js  # CA/Fed ratio line chart
│   └── TaxSharesTable.js      # Tax share comparison table
├── globals.css          # PE design tokens + Tailwind
└── layout.js            # Metadata + fonts

lib/
└── calculator.js        # Pure JS fiscal impact calculator (no API calls)

scripts/
└── precompute.py        # Generates static JSON from PolicyEngine microsimulation

data/                    # Precomputed JSON (committed, not generated at build time)
```

The app is fully static — all PolicyEngine computations are precomputed into JSON files. The calculator tab uses pure client-side JavaScript. No API calls at runtime.

## Development

```bash
bun install
bun run dev        # http://localhost:3000
bun run build      # Production build
```

### Regenerating precomputed data

Requires `policyengine-us` installed (uses the `.venv` from the policyengine-us repo):

```bash
cd ~/PolicyEngine/policyengine-us
.venv/bin/python ~/PolicyEngine/california-wealth-tax/scripts/precompute.py
```

## Related PolicyEngine work

- [Marginal tax rates in California's proposed billionaire tax](https://policyengine.org/us/research/california-billionaire-tax-marginal-rates) (Oct 2025) — Phase-in creates 50-60% marginal rates in the $1.0-1.1B range
- [Warren's wealth tax would raise less than she claims](https://maxghenis.com/blog/warrens-wealth-tax-would-raise-less-than-she-claim/) (2019) — Saez/Zucman miscalculated avoidance response
- PolicyEngine US data issue [#613](https://github.com/PolicyEngine/policyengine-us-data/issues/613) — Integrating Forbes 400 into microsimulation model
