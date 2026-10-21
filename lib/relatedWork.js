/**
 * Other analyses that compare versions of the Berkeley and Hoover estimates.
 * Each summary paraphrases the work's own description of itself and names the
 * reports it compares as the work names them. The page and README introduce
 * this list as "Two other analyses"; change both if an entry is added.
 */
export const RELATED_WORK = [
  {
    id: "hoces-opa-2026",
    author: "Fernando Hoces de la Guardia",
    title: "California Proposition 40, Reconciliation of the Two Analyses",
    venue: "Open Policy Analysis report, October 2026",
    summary:
      "Puts the Boll, Saez and Zucman analysis (NBER, August 2026) and the Jaros and Rauh analysis (NBER, September 2026) on one common output, using the project's own reproduction of each, and explains the gap between them one disputed input at a time. The first builds on the Galle, Gamage, Saez and Shanske report; the second revises Rauh et al.'s March 2026 paper. Its appendix discusses this calculator.",
    links: [
      { label: "Overview", href: "https://fhoces.github.io/opa-prop40/" },
      {
        label: "Comparison report",
        href: "https://fhoces.github.io/opa-prop40/comparison/site/repro.html",
      },
      { label: "Code", href: "https://github.com/fhoces/opa-prop40" },
    ],
  },
  {
    id: "hoopes-2026",
    author: "Jeffrey L. Hoopes",
    title: "Galle v Rauh: Comparing Two Revenue Estimates for California Billionaire Taxation",
    venue: "SSRN Working Paper 6428578, March 2026",
    summary:
      "Compares the methods behind the 2026 revenue estimates by Galle, Gamage, Saez and Shanske and by Rauh, Jaros, Kearney, Doran and Cosso.",
    links: [{ label: "SSRN", href: "https://doi.org/10.2139/ssrn.6428578" }],
  },
];
