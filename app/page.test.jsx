// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page.js";

vi.mock("next/image", () => ({ default: () => null }));

// jsdom lays nothing out, so recharts needs a size to draw into.
class SizedResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe(target) {
    this.callback([{ target, contentRect: { width: 800, height: 380 } }], this);
  }
  unobserve() {}
  disconnect() {}
}

function mockViewport({ narrow }) {
  window.matchMedia = (query) => ({
    matches: narrow,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = SizedResizeObserver;
  mockViewport({ narrow: false });
  window.scrollBy = vi.fn();
  window.scrollTo = vi.fn();
  window.history.replaceState(null, "", "/us/california-wealth-tax");
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(380);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 800,
    bottom: 380,
    width: 800,
    height: 380,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function settle() {
  for (let turn = 0; turn < 4; turn += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function open(search = "") {
  window.history.replaceState(null, "", `/us/california-wealth-tax${search}`);
  render(<Home />);
  await settle();
}

async function click(element) {
  await act(async () => {
    fireEvent.click(element);
  });
  await settle();
}

async function slideLegalTo(value) {
  const slider = document.querySelector("#panel-legal input[type=range]");
  await act(async () => {
    fireEvent.change(slider, { target: { value } });
  });
  await settle();
}

const button = (pattern) =>
  [...document.querySelectorAll("button")].find((candidate) =>
    pattern.test(candidate.textContent.trim()),
  );
const pageText = () => document.body.textContent;
const stepOnePressed = () =>
  button(/^1\. Why the estimates differ/).getAttribute("aria-pressed");
const stepTwoPressed = () =>
  button(/^2\. Build your own/).getAttribute("aria-pressed");
const assumptionRow = (label) =>
  [...document.querySelectorAll("button[aria-expanded]")].find((candidate) =>
    candidate.textContent.startsWith(label),
  );
const column = (id) => document.querySelector(`[data-column="${id}"]`);
const visibleBar = (id) =>
  document.querySelectorAll(".recharts-bar")[1].querySelector(`.recharts-bar-rectangle [id="${id}"]`);
const publishedGapSummary = () =>
  pageText().match(/Berkeley assumptions \+\$[\d.]+B → Hoover assumptions -\$[\d.]+B/)?.[0];

describe("step one", () => {
  it("opens on the published estimates, with no scenario on the page", async () => {
    await open();

    expect(stepOnePressed()).toBe("true");
    expect(pageText()).toContain("What separates the published estimates");
    expect(pageText()).not.toContain("Your scenario");
    expect(publishedGapSummary()).toBeTruthy();
    expect(pageText()).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("labels each bar with its value", async () => {
    await open();

    const labels = [...document.querySelectorAll(".recharts-label-list text")];
    expect(labels.length).toBe(document.querySelectorAll("[data-column]").length + 2);
    expect(labels.every((label) => /[-+]\$[\d.]+B/.test(label.textContent))).toBe(true);
  });

  it("offers the starting points as actions, with none selected", async () => {
    await open();

    expect(button(/^Hoover assumptions/).hasAttribute("aria-pressed")).toBe(false);
  });

  it("gives a phone the value of each bar in the list", async () => {
    mockViewport({ narrow: true });
    await open();

    expect(button(/^Legal challenges to collection/).textContent).toMatch(/[-+]\$[\d.]+B$/);
  });

  it("stays on the published estimates while a scenario changes", async () => {
    await open();
    const summary = publishedGapSummary();

    await click(button(/^Hoover assumptions/));
    expect(stepTwoPressed()).toBe("true");
    await click(assumptionRow("Legal challenges"));
    await slideLegalTo("0.8");
    expect(pageText()).toContain("Your scenario");

    await click(button(/^1\. Why the estimates differ/));

    expect(publishedGapSummary()).toBe(summary);
    expect(pageText()).toContain("Picking a starting point replaces your scenario.");
  });

  it("goes back to the scenario with its edits intact", async () => {
    await open("?survive=0.8");
    const search = window.location.search;
    await click(button(/^1\. Why the estimates differ/));

    await click(button(/^Back to your scenario/));

    expect(stepTwoPressed()).toBe("true");
    expect(window.location.search).toBe(search);
    expect(pageText()).toContain("Your scenario");
  });
});

describe("entering step two from a bar", () => {
  it("starts from the destination with that assumption open", async () => {
    await open();

    await click(column("legal"));

    expect(stepTwoPressed()).toBe("true");
    expect(button(/^Hoover assumptions/).getAttribute("aria-pressed")).toBe("true");
    expect(assumptionRow("Legal challenges").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(assumptionRow("Legal challenges"));
  });

  it("draws one target per step, full height and above the bar labels", async () => {
    await open();

    const targets = [...document.querySelectorAll("[data-column]")];
    const target = column("incomeTax");
    const [first, second] = targets;

    expect(new Set(targets.map((entry) => entry.getAttribute("height"))).size).toBe(1);
    expect(Number(second.getAttribute("x")) - Number(first.getAttribute("x"))).toBeCloseTo(
      Number(first.getAttribute("width")),
    );
    const label = document.querySelector(".recharts-label-list");
    expect(label.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await click(target);

    expect(stepTwoPressed()).toBe("true");
    expect(assumptionRow("Count movers").getAttribute("aria-expanded")).toBe("true");
  });

  it("outlines the open bar", async () => {
    await open();

    await click(column("legal"));
    await slideLegalTo("0.8");

    expect(visibleBar("legal").getAttribute("stroke")).toBe("var(--gray-700)");
  });

  it("keeps a scenario already under way", async () => {
    await open("?survive=0.8");
    const search = window.location.search;
    await click(button(/^1\. Why the estimates differ/));

    await click(column("legal"));

    expect(stepTwoPressed()).toBe("true");
    expect(window.location.search).toBe(search);
  });

  it("leaves the starting point's column alone", async () => {
    await open();

    expect(column("legal")).toBeTruthy();
    expect(column("start")).toBeNull();
  });

  it("opens from the list on a phone, where a tap only shows the tooltip", async () => {
    mockViewport({ narrow: true });
    await open();

    expect(document.querySelector("[data-column]")).toBeNull();

    await click(button(/^Legal challenges to collection/));
    expect(stepTwoPressed()).toBe("true");
    expect(assumptionRow("Legal challenges").getAttribute("aria-expanded")).toBe("true");
  });
});

describe("building a scenario", () => {
  it("says what the cohort loses in the income tax summary", async () => {
    await open();
    await click(column("incomeTax"));

    expect(pageText()).toContain("at least 45% of the cohort's income tax lost");
  });

  const INERT_NOTE =
    "Your change to \u201cWho pays the cohort's income tax\u201d has no effect in this scenario.";

  it("names the change that moved nothing", async () => {
    await open("?cohortpit=5");

    expect(stepTwoPressed()).toBe("true");
    expect(pageText()).toContain(INERT_NOTE);
  });

  it("names it beside a change that did move something", async () => {
    await open("?cohortpit=5&survive=0.8&pit=0");

    expect(column("legal")).toBeTruthy();
    expect(pageText()).toContain(INERT_NOTE);
  });

  it("says nothing about a change that moved the estimate", async () => {
    await open();
    await click(column("legal"));
    await slideLegalTo("0.8");

    expect(pageText()).not.toContain("no effect in this scenario");
  });

  it("keeps focus on the step when a reset removes the button", async () => {
    await open("?survive=0.8");

    await click(button(/^Reset to/));

    expect(document.activeElement.textContent).toBe("Build your own estimate");
    expect(button(/^Reset to/)).toBeUndefined();
  });
});
