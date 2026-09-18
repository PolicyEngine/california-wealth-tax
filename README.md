# California Proposition 40 billionaire tax calculator

Interactive calculator for California's Proposition 40 (the 2026 Billionaire
Tax Act, Initiative 25-0024A1) on the November 3, 2026 ballot: a one-time tax
of 5% of the entire net worth of California residents (as of January 1, 2026)
worth $1 billion or more, valued on December 31, 2026. Between $1.0 billion
and $1.1 billion the rate ramps from 0% to 5% (RTC §50301(b) as proposed).

**Live app**: https://policyengine.org/us/california-wealth-tax

## What the model does

One model, scored person by person, in two stages.

- **Stage 1: one-time wealth tax.** The residency roster is everyone Forbes
  listed in California on January 1, 2026. Each person is valued at their
  latest Forbes worth, wherever Forbes lists them now; people Forbes has
  added to its California list since are added, with their January 1
  residency assumed; people Forbes no longer lists at all are carried at the
  last value it published for them. The statute is applied per person:
  net worth under $1 billion owes nothing, real property held
  directly is excluded, then the rate ramp, then an optional erosion haircut
  and the payment election (lump sum due in 2027, or five installments with a
  7.5% charge on the unpaid balance). With stage 2 off, the headline is
  nominal receipts.
- **Stage 2 (optional): future California income tax.** Movers' income is
  modeled as a yield on their wealth and taxed with PolicyEngine's California
  rates; the loss stream is attributed, grown, discounted, and netted against
  receipts, both in present value as of 2026.

The baseline takes no position on contested residency. Eight documented claims
that a roster member was not a resident on January 1, 2026 are individual
adjustments, each shown with its evidence and source
(`lib/residencyAdjustments.js`, `data/billionaire_metadata.json`). Larry
Ellison is the one exclusion from every base: Forbes lists him in Florida and
both published estimates now exclude him.

The "Berkeley assumptions" and "Hoover assumptions" starting points apply the
assumptions of Galle, Gamage, Saez and Shanske and of Rauh et al. to this
calculator's roster. They are settings inside the same model, not replications
of those papers' rosters.

## Data

- `public/snapshots/<date>.json`: daily Forbes California snapshots, indexed in
  `public/snapshots/index.json`. `2026-01-01.json` is the residency roster.
- `data/billionaires_live.{json,csv}` and `data/billionaires_live_meta.json`:
  the latest snapshot.
- `data/roster_valuations.json`: current Forbes worth, in any state, for
  everyone on the residency roster.
- `data/billionaire_metadata.json`: per-person residency evidence with sources.
- `data/billionaires_rauh.json`: the October 17, 2025 list with Rauh et al.'s
  directly held real estate values (personal residences; a lower bound).
- `data/income_tax_lookup.json`: California income tax at billionaire-scale
  incomes, precomputed from PolicyEngine.

`.github/workflows/update-forbes.yml` refreshes the Forbes data daily. It runs
the fetcher's tests first, and `scripts/check_snapshot_sanity.py` must pass
before anything is committed. Names are joined on a normalized key (aliases,
trailing "& family", case), because Forbes changes display names.

Known gap: Forbes leaves the state blank for most non-US citizens, so
California residents who are not citizens are missing from the base.

## Architecture

```text
app/
├── page.js                  # Calculator shell, scenario state, summary panel
├── components/
│   ├── Wizard.js            # Guided assumption flow
│   ├── BillionaireTable.js  # Person-level table with valuation source flags
│   └── WaterfallChart.js    # Fiscal-impact waterfall
lib/
├── calculator.js            # Receipt schedule, present values, headline
├── microModel.js            # Roster join, person-level tax and income tax
├── residencyAdjustments.js  # Documented residency claims with sources
├── departureResponse.js     # Additional migration response mappings
├── scenarioUrl.js           # Shareable URL parse/serialize
├── incomeTaxLookup.js       # California income tax interpolation
└── paperNumbers.js          # Every number quoted in the paper
scripts/
├── fetch_forbes.py          # Daily Forbes fetch and roster valuations
├── check_snapshot_sanity.py # Gate between fetching and publishing
├── check_snapshot_freshness.py
├── paper_numbers.mjs        # Writes paper/paper_numbers.json
└── precompute.py            # Income-tax lookup generator (stale; see issue)
```

The app is static. PolicyEngine-dependent calculations are precomputed into
JSON and loaded client-side.

## Development

```bash
bun install
bun run dev
bun run test
uv run --with pytest python -m pytest scripts/test_fetch_forbes.py -q
bun run lint
bun run build
```

### The paper

`paper/california-wealth-tax-ssrn-draft.qmd` quotes only numbers that
`lib/paperNumbers.js` computes from the dated snapshot;
`lib/paperNumbers.test.js` fails if the text and the code disagree.

```bash
bun scripts/paper_numbers.mjs   # regenerate paper/paper_numbers.json
bun run paper:render            # requires Quarto
```
