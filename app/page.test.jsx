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
const column = (id) =>
  document.querySelector(`.recharts-bar-background-rectangle[id="${id}"]`);
const publishedGapSummary = () =>
  pageText().match(/Berkeley assumptions \+\$[\d.]+B → Hoover assumptions -\$[\d.]+B/)?.[0];

describe("step one", () => {
  it("opens on the published estimates, with no scenario on the page", async () => {
    await open();

    expect(stepOnePressed()).toBe("true");
    expect(pageText()).toContain("What separates the published estimates");
    expect(pageText()).not.toContain("Your scenario");
    expect(publishedGapSummary()).toBeTruthy();
  });

  it("stays on the published estimates while a scenario changes", async () => {
    await open();
    const summary = publishedGapSummary();

    await click(button(/^Hoover assumptions/));
    expect(stepTwoPressed()).toBe("true");
    await click(assumptionRow("Legal challenges"));
    const slider = document.querySelector("#panel-legal input[type=range]");
    await act(async () => {
      fireEvent.change(slider, { target: { value: "0.8" } });
    });
    await settle();
    expect(pageText()).toContain("Your scenario");

    await click(button(/^1\. Why the estimates differ/));

    expect(publishedGapSummary()).toBe(summary);
    expect(pageText()).toContain("Picking a starting point replaces your scenario.");
    expect(button(/^Back to your scenario/)).toBeTruthy();
  });
});

describe("entering step two from a bar", () => {
  it("starts from the destination with that assumption open", async () => {
    await open();

    await click(column("legal"));

    expect(stepTwoPressed()).toBe("true");
    expect(button(/^Hoover assumptions/).getAttribute("aria-pressed")).toBe("true");
    expect(assumptionRow("Legal challenges").getAttribute("aria-expanded")).toBe("true");
  });

  it("takes a click on the empty space under a floating bar", async () => {
    await open();
    const [invisibleBase] = document.querySelectorAll(".recharts-bar");

    await click(invisibleBase.querySelector('[id="incomeTax"]'));

    expect(stepTwoPressed()).toBe("true");
    expect(assumptionRow("Count movers").getAttribute("aria-expanded")).toBe("true");
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

    await click(column("start"));

    expect(stepOnePressed()).toBe("true");
  });

  it("opens from the list on a phone, where a tap only shows the tooltip", async () => {
    mockViewport({ narrow: true });
    await open();

    await click(column("legal"));
    expect(stepOnePressed()).toBe("true");

    await click(button(/^Legal challenges to collection/));
    expect(stepTwoPressed()).toBe("true");
    expect(assumptionRow("Legal challenges").getAttribute("aria-expanded")).toBe("true");
  });
});

describe("building a scenario", () => {
  it("names the change that moved nothing", async () => {
    await open("?cohortpit=5");

    expect(stepTwoPressed()).toBe("true");
    expect(pageText()).toContain(
      "That change does not move the estimate from this starting point.",
    );
  });
});
