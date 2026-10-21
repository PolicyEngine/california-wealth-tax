import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RELATED_WORK } from "./relatedWork";

const hrefs = RELATED_WORK.flatMap((work) => work.links.map((link) => link.href));

describe("related work", () => {
  it("has the two entries the page and README introduce as \"Two other analyses\"", () => {
    expect(RELATED_WORK).toHaveLength(2);
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    const section = readme.slice(readme.indexOf("## Related work"), readme.indexOf("## Data"));
    expect(section.match(/^- /gm)).toHaveLength(RELATED_WORK.length);
  });

  it("gives every entry a unique id, an author, a title and a summary", () => {
    const ids = RELATED_WORK.map((work) => work.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const work of RELATED_WORK) {
      expect(work.author).toBeTruthy();
      expect(work.title).toBeTruthy();
      expect(work.venue).toBeTruthy();
      expect(work.summary).toBeTruthy();
      expect(work.links.length).toBeGreaterThan(0);
    }
  });

  it("links only to absolute https addresses, each once", () => {
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) {
      expect(new URL(href).protocol).toBe("https:");
    }
  });

  it("cites the OPA comparison report and Hoopes's SSRN paper", () => {
    expect(hrefs).toContain("https://fhoces.github.io/opa-prop40/comparison/site/repro.html");
    expect(hrefs).toContain("https://doi.org/10.2139/ssrn.6428578");
  });

  it("is cited in the working paper with the same title and link", () => {
    const bib = readFileSync(new URL("../paper/references.bib", import.meta.url), "utf8");
    const paper = readFileSync(
      new URL("../paper/california-wealth-tax-ssrn-draft.qmd", import.meta.url),
      "utf8"
    );
    const field = (body, name) =>
      body.match(new RegExp(`^\\s*${name} = \\{(.*)\\},?$`, "m"))?.[1].replace(/[{}]/g, "");
    const entries = [...bib.matchAll(/^@\w+\{([\w-]+),\n([\s\S]*?)\n\}/gm)].map(
      ([, key, body]) => ({ key, title: field(body, "title"), url: field(body, "url") })
    );
    for (const work of RELATED_WORK) {
      const workHrefs = work.links.map((link) => link.href);
      const entry = entries.find((candidate) => workHrefs.includes(candidate.url));
      expect(entry, `references.bib should link to ${work.title}`).toBeDefined();
      expect(entry.title).toBe(work.title);
      expect(paper).toContain(`@${entry.key}]`);
    }
  });

  it("matches the README's list", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8").replace(
      /\s+/g,
      " "
    );
    for (const work of RELATED_WORK) {
      expect(readme).toContain(work.author);
      expect(readme).toContain(work.title);
      expect(readme).toContain(work.venue);
    }
    for (const href of hrefs) {
      expect(readme).toContain(`(${href})`);
    }
  });
});
