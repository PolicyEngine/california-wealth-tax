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
  last positive value in the stored daily history. Directly held real property
  is excluded, then the $1 billion threshold and rate ramp apply to each
  observed wealth-tax unit. Documented separately listed spouses share one
  threshold and rate (Jay-Z/Beyoncé and Lynda/Stewart Resnick); other family
  assets remain unobserved. The model then applies an optional erosion haircut,
  the legal assumptions, and the payment election (lump sum due in 2027, or
  five installments with a 7.5% charge on the unpaid balance). The legal
  assumptions are a probability that the measure survives legal challenge,
  which scales expected receipts and nothing else, and two switches that take
  people out of the base without moving them: people who left after
  January 1, and non-US citizens. Each defaults to the measure as written.
  With stage 2 off, the headline is nominal receipts.
- **Stage 2 (optional): future California income tax.** The cohort's total
  California income tax is an input ($4.3B a year by default; Rauh et al. and
  Boll, Saez and Zucman overlap on it). It is divided among people either by
  wealth (Rauh et al.'s f × C) or, by default, with filings-based estimates for
  the four largest fortunes (`data/income_tax_filings.json`, from Boll, Saez and
  Zucman's Table 3) and the rest by wealth. A mover's share is the loss; the
  stream is attributed, grown, discounted, and netted against receipts, both in
  present value as of 2026. Income-tax departures remain person-based: a
  departing spouse can lose California income tax while the unit's wealth-tax
  liability remains because the other spouse was a resident on January 1.
  An optional total share of the cohort's income tax lost to departures
  (Jaros and Rauh's f) counts documented and modeled departures first; any
  remainder is a proportional share of the people still paying who leave after
  January 1, owing the wealth tax but no longer California income tax.

The baseline takes no position on contested residency. Eleven documented claims
that a roster member was not a resident on January 1, 2026 are individual
adjustments, each shown with its evidence and source
(`lib/residencyAdjustments.js`, `data/billionaire_metadata.json`). Larry
Ellison is the one exclusion from every base: Forbes lists him in Florida and
both published estimates now exclude him.

The "Berkeley assumptions" and "Hoover assumptions" starting points apply the
assumptions of Galle, Gamage, Saez and Shanske and of Jaros and Rauh to this
calculator's roster. They are settings inside the same model, not replications
of those papers' rosters. Since October 21, 2026 the Hoover set follows Jaros
and Rauh's NBER Working Paper 35899 (October 2026), as in their central
revenue estimate: their departures and pre-filing exits out of the base, Mark
Zuckerberg and non-US citizens left out, 7% a year wealth growth to the
valuation date, a 50% chance the measure survives challenge, no unannounced
departures in the wealth-tax base, and 45% of a $4.55B cohort income tax lost,
divided by wealth. Their NPV section instead centers revenue on half of the
$72B ceiling with Zuckerberg and the pre-filing exits in (their formula gives
a point NPV of −$32.25B at f = 0.45, C = $4.55B and r − g = 3%) and reports a
mean over draws of revenue, f, C and r − g (−$38.9B), so
the set's point value is not their published mean. Before, the set followed
Rauh et al.'s March 2026 paper; that set stays in `lib/presets.js` as
`HOOVER_MARCH_2026_ASSUMPTIONS`, because the working paper's analysis is dated
to it.

## Related work

Two other analyses compare versions of the Berkeley and Hoover estimates. The
page lists them at the bottom, with summaries kept in `lib/relatedWork.js`:

- Fernando Hoces de la Guardia, [California Proposition 40, Reconciliation of
  the Two Analyses](https://fhoces.github.io/opa-prop40/) (Open Policy Analysis
  report, October 2026;
  [comparison report](https://fhoces.github.io/opa-prop40/comparison/site/repro.html),
  [code](https://github.com/fhoces/opa-prop40)).
- Jeffrey L. Hoopes, [Galle v Rauh: Comparing Two Revenue Estimates for
  California Billionaire Taxation](https://doi.org/10.2139/ssrn.6428578) (SSRN
  Working Paper 6428578, March 2026).

## Data

- `public/snapshots/<date>.json`: daily Forbes California snapshots, indexed in
  `public/snapshots/index.json`. `2026-01-01.json` is the residency roster.
- `data/billionaires_live.{json,csv}` and `data/billionaires_live_meta.json`:
  the latest snapshot.
- `data/roster_valuations.json`: current Forbes worth, in any state, for
  everyone on the residency roster.
- `data/billionaire_metadata.json`: per-person residency evidence with sources.
- `data/citizenship_by_name.json`: citizenship by name, for snapshots before
  2026-09-17, which carry no citizenship field. The daily fetch only adds
  names to it, so for everyone already in it a stored snapshot scores the
  same whatever Forbes lists later. People not in it count as US citizens; a
  wrong entry is corrected by hand.
- `data/wealth_tax_households.json`: sourced, separately valued spouse groups.
- `data/billionaires_rauh.json`: the October 17, 2025 list with Rauh et al.'s
  directly held real estate values (personal residences; a lower bound).
- `data/income_tax_filings.json`: filings-based California income tax for the
  four largest fortunes, 2019-2025, with source.
- `data/income_tax_lookup.json`: California income tax at billionaire-scale
  incomes, precomputed from PolicyEngine (used by the uniform-yield method).

`.github/workflows/update-forbes.yml` refreshes the Forbes data daily. It runs
the fetcher's tests first, and `scripts/check_snapshot_sanity.py` must pass
before anything is committed. Names are joined on a normalized key (aliases,
trailing "& family", case), because Forbes changes display names.

The job checks out the branch's tip when it starts, not the commit it was queued
for, and rebases its data commit onto the current tip before pushing, re-running
the sanity gate on the result. A push made with the workflow's token starts no
push run of `ci.yml`, so after pushing a data commit the job dispatches `ci.yml`
on it. A failed daily run, or a failed CI run on its data commit, opens a "Daily
Forbes update failed" issue (`scripts/report_daily_update.py`). If the issue is
still open two days later, the next failure assigns it to a maintainer and
mentions them, and mentions them again every week the outage lasts. The next
good run closes it: CI passing on its data commit, or no new data while the
current data is still fresh. A CI pass leaves open an issue opened after its
data commit about something else. If the daily workflow stops running at all
(disabled, or GitHub drops its scheduled runs), nothing reports it.

Known gap: the January 1, 2026 list is a backfill of US-citizen Forbes
profiles, so non-US citizens Forbes places in California enter the base only
through the current list, with their January 1 residency assumed.

## Architecture

```text
app/
├── page.js                  # Scenario state, URL sync, data loading, layout
├── components/
│   ├── LiveBridge.js        # The bridge between two assumption sets (hero)
│   ├── WaterfallChart.js    # The bridge's waterfall
│   ├── ResultStrip.js       # Your scenario's number, start-from sets, data, link
│   ├── AssumptionPanels.js  # One panel per assumption group
│   ├── Slider.js            # Slider with sourced quick picks
│   ├── Heatmap.js           # Net present value over two assumptions
│   └── BillionaireTable.js  # Person-level table with valuation source flags
lib/
├── scenario.js              # One scorer: parameters in, results out
├── presets.js               # The statutory, Berkeley and Hoover assumption sets
├── bridge.js                # Assumption groups and the Shapley bridge
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
├── report_daily_update.py   # Opens, escalates and closes the outage issue
├── paper_numbers.mjs        # Writes paper/paper_numbers.json
└── precompute.py            # Year-keyed income-tax lookup generator
```

The app is static. PolicyEngine-dependent calculations are precomputed into
JSON and loaded client-side.

Present values are expressed in 2026 dollars. Nominal wealth-tax receipts are
deflated using the inflation setting before real discounting; the default
explicitly assumes constant prices (0% inflation), and 2% is an illustrative
quick pick rather than a forecast. Income-tax growth and losses are already real.

To regenerate the income-tax table, run
`uv run --with "policyengine[us]" python scripts/precompute.py`.
The generator writes the year-keyed schema consumed by the app. Schema tests use
the committed tax amounts without claiming to revalidate them against new law.

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

`paper/california-wealth-tax-ssrn-draft.qmd` quotes only calculator figures
that `lib/paperNumbers.js` computes from the dated snapshot;
`lib/paperNumbers.test.js` fails if the text and the code disagree.

The body is dated to the September 18, 2026 snapshot and scores the Hoover
assumptions as Rauh et al.'s March 2026 version (`HOOVER_MARCH_2026_ASSUMPTIONS`).
That set counts the income tax of the four later or unconfirmed departures in
their Table 7 as lost on top of the share their formula ties to the wealth-tax
loss; the paper says so and reports the set with the share tied. An addendum
dated October 21, 2026 scores the calculator's current Hoover set, which follows
Jaros and Rauh's NBER version, on the same snapshot.

```bash
bun scripts/paper_numbers.mjs   # regenerate paper/paper_numbers.json
bun run paper:render            # requires Quarto
```
