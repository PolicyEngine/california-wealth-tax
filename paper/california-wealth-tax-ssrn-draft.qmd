---
title: "Scoring California's proposed Billionaire Tax Act: a transparent comparison of static, migration, and valuation assumptions"
author:
  - name: "Max Ghenis"
    affiliation: "PolicyEngine"
date: "March 30, 2026"
bibliography: references.bib
abstract: |
  California's proposed Billionaire Tax Act would impose a one-time 5 percent
  tax on net worth above $1 billion for California residents as of January 1,
  2026. Public estimates of its fiscal effect differ sharply. A Berkeley team
  reports a roughly $100 billion static score, while Rauh et al. estimate a
  much smaller revenue range and a negative mean net present value once future
  California income tax losses are included. This paper documents the
  assumptions behind a new PolicyEngine calculator designed to make those
  disagreements explicit. The calculator separates raw Forbes wealth totals
  from residency-corrected tax bases, applies the initiative's real estate
  exclusion and phase-in, distinguishes observed departures from modeled
  additional departures, and lets users compare direct share-loss assumptions
  with exact semi-elasticity-based migration mappings. Using the stored March
  30, 2026 Forbes snapshot, the calculator's current corrected static baseline
  yields a gross one-time wealth tax score of about $70.6 billion and a net
  fiscal effect of about $53.8 billion after the income tax effect of
  already-observed movers. The paper's main claim is narrow. The most useful
  public contribution is not another opaque point estimate, but a transparent
  framework that shows how each modeling choice changes the score.
---

# Introduction

California's proposed Billionaire Tax Act has produced one of the widest gaps
in recent state tax scoring. Galle, Gamage, Saez, and Shanske report a roughly
$100 billion static score using Forbes data and a 10 percent haircut for
avoidance or evasion [@galle2025]. Rauh et al. build a person-level base,
correct the residency list, model departures, and estimate that the policy may
have negative net present value once foregone California income tax is counted
[@rauh2026]. The Legislative Analyst's Office describes the effect only as
being in the "tens of billions of dollars" [@lao2026].

This paper documents a public calculator built at PolicyEngine to make those
disagreements transparent [@policyengine2026]. The calculator is not a full
replication of any one paper. It is a common framework that lets users change
the assumptions that matter most: the billionaire base, residency corrections,
directly held real estate, observed and modeled departures, California income
tax exposure, payment timing, growth, and discounting.

The paper's argument is narrow. The main disagreement is not about arithmetic
inside a shared model. It is about a short list of modeling choices. A useful
public model should therefore expose those choices directly rather than hide
them behind a single headline number.

# The measure and existing estimates

The initiative ties residency to January 1, 2026 and valuation to December 31,
2026 [@ballot2026]. It phases the tax in from 0 percent at $1.0 billion to 5
percent at $1.1 billion, excludes directly held real property from net worth,
and allows either payment with the 2026 return or payment in five annual
installments with a 7.5 percent nondeductible deferral charge on the unpaid
balance.

The Berkeley estimate takes the broadest and simplest approach. It uses 204
California billionaires from the October 17, 2025 Forbes list, reports $2.19
trillion of wealth, multiplies by 5 percent, and applies a 10 percent haircut
to reach a roughly $100 billion figure [@galle2025]. That is a static revenue
score. It does not separately model departures or future California income tax
losses.

Rauh et al. construct a narrower and more behaviorally responsive base
[@rauh2026]. Their paper removes known non-California residents from the
Forbes list, adds an omitted California billionaire, estimates directly held
real estate, and treats observed departures as evidence of migration response.
They report a $94.2 billion no-behavior baseline, a $67.5 billion score after
six confirmed pre-snapshot departures, and a preferred revenue range of roughly
$35 billion to $46 billion once additional migration response is included. The
paper's Monte Carlo exercise yields a mean net present value of -$24.7 billion.

A separate concern is valuation. Forbes wealth is a public estimate, not a tax
filing. If reported values to the California Franchise Tax Board come in below
public Forbes values, or if market prices move materially before the valuation
date, both static and behavioral scores can shift even before any migration
response is added.

# PolicyEngine's scoring framework

The calculator is built around four layers: the wealth base, the statutory tax
rules, behavioral erosion, and the present value of future California income
tax losses.

## Wealth base options

The model supports three wealth bases.

The first is the raw Forbes California list. This best approximates the
Berkeley static framing. It intentionally keeps the public Forbes
classification even when later evidence suggests some names are not California
residents.

The second is a residency-corrected base. Here the model removes names that
the Rauh or Jaros work identifies as outside the California resident base and
adds David Sacks, who is omitted from the Forbes California list used in the
paper.

The third is the corrected base after confirmed pre-snapshot departures. This
retains the corrected resident pool but removes names that appear to have left
California before the January 1, 2026 residency cutoff. In the paper-date
replication, this means six confirmed departures. In the live calculator, the
same structure is applied to the latest stored Forbes snapshot using the same
metadata overlay.

## Real estate exclusion and phase-in

The calculator applies the initiative text person by person. Directly held
real estate is excluded before the phase-in is computed. For billionaires whose
holdings are known in the Rauh dataset, the model uses those name-level values.
For missing cases, it imputes directly held real estate at 0.64 percent of net
worth, following the median-share approach described by Rauh et al.
[@rauh2026].

This matters because the initiative does not simply impose a flat 5 percent on
all reported billionaire wealth. It first excludes directly held real estate
and then phases the rate in between $1.0 billion and $1.1 billion. A
person-level application of the statutory rule therefore gives a better answer
than an aggregate multiplication.

## Behavioral erosion and migration

The model separates two channels that are often blurred in public debate.

The first is non-migration erosion of the wealth tax base. This is a reduced-
form haircut that lowers one-time wealth tax collections but does not generate
future California income tax loss.

The second is migration. Observed departures already affect the tax base and,
where relevant, future California income tax collections. Additional modeled
departures can be entered either as a direct share of the remaining base or via
a migration semi-elasticity. The calculator therefore lets users compare the
paper's linearized share-loss framing with an exact finite-change
semi-elasticity mapping of `1 - exp(-epsilon times tau)`.

This distinction is central to interpreting the Berkeley and Hoover estimates.
The Berkeley score embeds a reduced-form haircut in a static wealth tax
estimate. Rauh et al. model behavioral response primarily through migration,
which simultaneously lowers wealth tax collections and raises the present value
of lost California income taxes.

## California income tax loss

The current calculator maps California income tax loss through PolicyEngine's
California income tax model rather than directly reproducing Rauh's Franchise
Tax Board-based estimate. Annual California-taxable income is modeled as a
share of taxed wealth, and California income tax is then estimated from a
precomputed lookup at billionaire-scale incomes.

This is an explicit methodological choice, not a replication claim. Rauh et
al. estimate a $3.3 billion to $5.8 billion annual California personal income
tax contribution from the relevant billionaire cohort using a Pareto-tail fit
to Franchise Tax Board data [@rauh2026]. The PolicyEngine implementation
instead uses a structural income-to-tax mapping. The benefit is consistency
across scenarios. The cost is that the Rauh path in the calculator is best
understood as Rauh-calibrated rather than as a direct FTB-data implementation.

## Discounting and payment timing

The calculator separates nominal wealth growth from the real discount rate and
converts nominal growth into real growth using a 2.5 percent inflation
assumption. This is more transparent than collapsing discounting and growth
into a single spread, though users may still compare their implied values with
the Rauh paper's 1.5 percent to 4.5 percent range.

The calculator also lets users compare lump-sum payment with the initiative's
five-installment option. Because installments carry a 7.5 percent charge on
the unpaid balance, payment timing changes the present value of receipts as
well as the nominal amount collected.

# What the calculator shows today

As of the stored Forbes snapshot for March 30, 2026, the calculator's default
opening state is an unnamed corrected-current baseline. It uses the latest
Forbes data, the corrected base after confirmed pre-snapshot departures,
excludes directly held real estate, and adds no extra non-migration erosion or
additional modeled departures.

Under that baseline, the calculator reports:

- gross one-time wealth tax of about $70.6 billion
- annual California income tax loss from already-observed movers of about
  $0.9 billion
- net fiscal effect of about $53.8 billion under the current discounting setup

The named presets remain reference points rather than default claims. The
Berkeley-style preset keeps the paper-date raw Forbes base, leaves real estate
in the base, and applies a 10 percent non-migration haircut. The Rauh-style
preset uses the corrected paper-date base after confirmed pre-snapshot
departures, excludes directly held real estate, and carries additional
migration through to future California income tax losses. The calculator does
not claim either preset is the correct answer. Its purpose is to show which
assumptions move the result.

# Valuation remains the largest open issue

The largest remaining uncertainty may be the gap between public Forbes wealth
and the values that would actually be reported and defended for tax purposes.
Forbes wealth is fast-moving and intentionally approximate [@forbes2012]. Tax
reporting is slower, more adversarial, and shaped by different incentives. If
tax-reported values are systematically lower than Forbes values, then both the
Berkeley-style and PolicyEngine static scores are too high before migration is
considered.

Market movement between a public snapshot and December 31, 2026 adds a second
valuation risk. For fortunes concentrated in public stock, ordinary price
changes can move the base materially without any legal avoidance or migration.
Future versions of the calculator should separate that valuation wedge from the
migration question.

# Limitations and extensions

This draft has four clear limitations.

First, the calculator does not yet expose a direct Rauh-style Franchise Tax
Board income tax range as a user-facing alternative to the PolicyEngine-derived
income tax path.

Second, the model does not yet isolate a separate valuation wedge between
Forbes-measured wealth and tax-reported wealth.

Third, the model does not attempt to forecast litigation or constitutional
outcomes around the initiative's retroactive structure.

Fourth, this paper is a methods note built around a public tool. It does not
claim to settle the correct revenue score for California's proposed wealth tax.
Its narrower goal is to identify the assumptions that drive the result and make
them inspectable.

# Conclusion

California's proposed Billionaire Tax Act should not be summarized by a single
number without showing the assumptions underneath it. Reasonable choices about
the billionaire base, residency, directly held real estate, migration, income
tax exposure, valuation, and discounting are enough to move the estimate from
a roughly $100 billion static score to a much smaller figure and, in some
scenarios, to a negative net present value.

A transparent calculator is useful because it makes those choices visible. The
next stage of work should focus less on replacing one opaque point estimate
with another and more on improving measurement of the valuation base, the
residency base, and the California income tax exposure of the affected cohort.

::: {#refs}
:::
