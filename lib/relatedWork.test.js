import { describe, expect, it } from "vitest";
import { RELATED_WORK } from "./relatedWork";

describe("related work", () => {
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
    const hrefs = RELATED_WORK.flatMap((work) => work.links.map((link) => link.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) {
      expect(new URL(href).protocol).toBe("https:");
    }
  });

  it("cites the OPA comparison report and Hoopes's SSRN paper", () => {
    const hrefs = RELATED_WORK.flatMap((work) => work.links.map((link) => link.href));
    expect(hrefs).toContain("https://fhoces.github.io/opa-prop40/comparison/site/repro.html");
    expect(hrefs).toContain("https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6428578");
  });
});
