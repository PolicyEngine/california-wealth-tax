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
