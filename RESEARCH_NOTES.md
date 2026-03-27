# Research notes: California wealth tax fiscal impact model

## The bill

The 2026 California Billionaire Tax Act (Initiative 25-0024) proposes a one-time 5% excise tax on worldwide net worth exceeding $1 billion for California residents as of January 1, 2026.

Key provisions:
- **Valuation date**: December 31, 2026 (not the Forbes snapshot date)
- **Phase-in**: Rate ramps linearly from 0% at $1B to 5% at $1.1B net worth
- **Real estate exclusion**: Directly held real property is excluded (already subject to property tax)
- **Threshold includes RE**: The $1B threshold is based on total net worth *including* real estate, even though RE is excluded from the taxable base
- **Payment**: Payable in annual installments of 1%/year over 5 years (with deferral charge)
- **Residency**: Based on CA resident/part-year resident status as of January 1, 2026; residency is determined by subjective and objective factors, not a simple address change

## Two papers

### Galle, Gamage, Saez & Shanske (2026)
- **[Paper](https://eml.berkeley.edu/~saez/galle-gamage-saez-shanskeCAbillionairetaxDec25.pdf)** (Dec 31, 2025)
- 204 CA billionaires from Forbes (Oct 17, 2025), $2.19T total wealth
- Flat 5% on entire base (no phase-in applied)
- 10% avoidance/evasion → ~$99B, rounded to **$100B**
- No departure modeling, no income tax dynamics
- Notes 7.5% real annual historical billionaire wealth growth but doesn't use it in scoring
- Uses Forbes snapshot as-is for a Dec 31, 2026 tax (implicitly 0% growth over 14.5 months)
- Does not exclude real estate from the Forbes base despite the bill requiring it
- Argues billionaires won't leave because it's a one-time tax

### Rauh, Jaros, Kearney, Doran & Cosso (2026)
- **[Paper](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6340778)** (Mar 17, 2026), **[Replication data](https://github.com/bjaros20/wealth_tax)**
- 212 CA billionaires after correcting residency errors (removed Ellison, Houston, Snyder who left pre-initiative; added David Sacks who was omitted)
- Total adjusted wealth: **$1,894.8B** ($1,895T)
- Baseline revenue (no behavioral response): **$94.20B**
- RE exclusion reduces stayer base by **$8.19B** (imputed at median 0.64% of net worth for missing data)
- Adjusted taxable base (stayers): **$1,350.2B**

#### Departure data (Tables 6 and 7)
- **6 confirmed pre-snapshot departures** (between Oct 15, 2025 filing and Jan 1, 2026 snapshot):
  - Larry Page ($256.2B), Sergey Brin ($236.4B), Peter Thiel ($26.7B), Don Hankey ($8.1B), Steven Spielberg ($7.0B), David Sacks ($2.0B)
  - Total: **$536.4B** (28.3% of base), **$26.7B** in tax avoided
- **10 confirmed + reported departures** (expanded estimate including post-snapshot and unconfirmed):
  - Adds Mark Zuckerberg ($225.1B, post-snapshot), Jan Koum ($17.1B, unconfirmed), Reed Hastings ($5.1B, unconfirmed), Andy Fang ($1.7B, pre-snapshot)
  - Total: **$785.4B** (41.4% of base), **$39.1B** in tax avoided
- Revenue after 6 confirmed departures: **$67.51B**
- Revenue after 10 expanded departures: **$55.10B**
- Preferred estimate (with literature-calibrated semi-elasticity): **~$40B** (range $35-46B)

#### Income tax methodology (Section 5.1)
- Does NOT derive income from a yield rate on wealth
- Fits a **Pareto tail** to CA's AGI distribution using FTB data (Tax Year 2023, $10M+ bracket, 4,729 filers)
- Pareto α = 1.44 (R² = 0.999)
- Top 212 filers' share of bracket tax: S(212, 4,729) = (212/4,729)^((α-1)/α) = 38.8%
- Scales from TY 2023 bracket tax ($11.1B) to FY 2024-25 collections ($130B): **$5.76B** (upper bound, assumes billionaires = top 212 income earners)
- Monte Carlo relaxation (K=500 pool): **$3.31B** (lower bound)
- **Range: $3.3–5.8B/yr**, midpoint **$4.55B/yr**

#### PV formula (Section 5.2)
Uses a growing perpetuity:

```
NPV = WT - f·C/(r-g)
```

Where:
- WT = wealth tax revenue collected
- C = annual income tax from all 212 billionaires (not just movers)
- f = departure fraction of income tax base
- r = real discount rate
- g = real income growth rate
- (r-g) is calibrated from S&P 500 dividend yield ≈ 1.5%

**Important**: Rauh presents results for (r-g) ∈ {1.5%, 3.0%, 4.5%} directly, not r and g separately. This implicitly assumes the state discounts at the equity return rate, which is debatable.

#### Central scenario (Table 9)
- WT = $42.0B, C = $4.55B, f = 55.4%
- (r-g) = 3.0%: PV(lost PIT) = $84.0B → **NPV = -$42.0B**
- (r-g) = 1.5%: NPV = -$126.1B
- (r-g) = 4.5%: NPV = -$14.0B

#### Monte Carlo headline (Section 5.5)
- WT ~ U[$35B, $67.1B]
- C ~ U[$3.3B, $5.8B]
- (r-g) ~ U[1.5%, 4.5%]
- 100,000 draws → **mean NPV = -$24.7B**, median -$19.1B
- 71% of scenarios yield negative NPV

## Discrepancy: replication data vs. paper

The replication data (`Raw_Data_Collection.xlsx`) has **9 movers** totaling **$806.4B**, while the paper's Table 6 shows **6 movers** totaling **$536.4B** and Table 7 shows **10 movers** totaling **$785.4B**. The replication data appears to be an intermediate version — it includes Ellison (who the paper removes as a pre-initiative departure, not a response to the tax), Houston, and Snyder, but excludes Zuckerberg, Spielberg, Sacks, Koum, Hastings, and Fang.

Our model should ideally match the paper's Table 7 (10 departures) or let users toggle between Table 6 (confirmed only) and Table 7 (expanded).

## Key modeling choices for our tool

### What we currently do
1. **Wealth base**: Toggle between "all Forbes" and "after known departures" using Rauh replication data
2. **Real estate**: Toggle to exclude directly-held RE per the bill
3. **Phase-in**: Per-billionaire effective rate from 0% ($1B) to 5% ($1.1B)
4. **Avoidance**: Slider (10% Saez, 15% Rauh)
5. **Unannounced departures**: Slider (share of remaining wealth)
6. **Income tax**: Derived from wealth × income yield rate × PolicyEngine CA income tax (MFJ, 2026-2030 lookup)
7. **PV**: Real discount rate (3%), minus inflation-adjusted nominal growth, with annual return hazard, over a horizon
8. **Wealth growth**: Nominal, forecast from Forbes snapshot date to Dec 31, 2026
9. **Inflation**: 2.5% CBO forecast baked in (converts nominal growth to real for PV)

### What should change based on the paper

#### Income tax approach
Rauh derives income tax from FTB data ($3.3-5.8B/yr), not from wealth × yield × tax rate. Our PE-derived approach is a reasonable alternative methodology, but we should:
- Consider letting users toggle between "PolicyEngine-derived" and "Rauh range" ($3.3-5.8B) for the income tax input
- Or at minimum, show how our PE-derived figure compares to Rauh's range

#### Departure data
Our replication data doesn't match the paper's tables. We should update `billionaires_rauh.json` to match either Table 6 (6 confirmed) or Table 7 (10 expanded). The paper's Table 7 is the more complete dataset and includes timing (pre-snapshot, post-snapshot, unconfirmed).

#### Discount rate vs (r-g)
Rauh uses (r-g) as a single parameter calibrated to dividend yield (~1.5%). Our model correctly separates r and g, which is more transparent, but:
- The user needs to understand what growth rate to pair with what discount rate
- We could add (r-g) as a derived display value so users can see how their choices compare to Rauh's range
- **Open question**: Should the state discount at the equity return rate (implicit in Rauh's approach) or at its borrowing cost (~2-3% real)? If r=3% and g=5%, (r-g) is negative and the PV diverges, implying infinite cost. This is a real limitation of the growing perpetuity model.

#### Wealth growth to EOY 2026
Both papers use the Forbes snapshot as-is (implicitly 0% growth to Dec 31, 2026). Our model allows forecasting growth, with the rate labeled "nominal." The bill taxes nominal wealth, so this is correct. The growth rate also feeds into the PV of income tax losses (converted to real by subtracting the 2.5% CBO inflation forecast).

### Unresolved questions

1. **Real vs nominal consistency**: We label wealth growth as nominal and discount rate as real, with a baked-in 2.5% inflation bridging them. Rauh works entirely in real terms with (r-g) directly. Should we offer both framings?

2. **Income tax from FTB data vs PE derivation**: Rauh's $3.3-5.8B range comes from actual CA tax return data. Our PE approach derives it from wealth × yield × marginal rates. These are complementary methods — we should probably support both.

3. **Departure data alignment**: The replication data has different movers than the paper. Need to reconcile.

4. **Post-snapshot departures**: Rauh's expanded estimate (Table 7) includes Zuckerberg and others who left after Jan 1, 2026. These don't reduce the wealth tax (they still owe it) but do create income tax loss. Our model currently treats all "movers" the same — they should be split by pre-snapshot (reduces wealth tax + income tax) vs post-snapshot (income tax only).

5. **Constitutional challenge**: Rauh (Section 6) argues the retroactive provision is constitutionally vulnerable. Post-snapshot departures may successfully argue they changed residency before the law was enacted (Nov 2026 vote). If the retroactive provision fails, only pre-vote residents would be taxed.
