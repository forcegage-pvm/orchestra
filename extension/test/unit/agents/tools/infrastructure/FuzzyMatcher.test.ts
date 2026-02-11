import { describe, expect, it } from "vitest";

import { FuzzyMatcher } from "../../../../../src/agents/tools/infrastructure/FuzzyMatcher.js";

describe("FuzzyMatcher", () => {
  it("returns an exact match when text is identical", () => {
    const matcher = new FuzzyMatcher();

    const result = matcher.match(["alpha", "beta", "gamma"], "beta");

    expect(result.found).toBe(true);
    expect(result.match_type).toBe("EXACT");
    expect(result.confidence).toBe(1);
    expect(result.start_line).toBe(2);
    expect(result.end_line).toBe(2);
  });

  it("returns a normalized match when whitespace differs", () => {
    const matcher = new FuzzyMatcher();

    const result = matcher.match(["hello   world"], "hello world");

    expect(result.found).toBe(true);
    expect(result.match_type).toBe("NORMALIZED");
    expect(result.confidence).toBe(1);
  });

  it("returns a fuzzy match above the threshold", () => {
    const matcher = new FuzzyMatcher();

    const result = matcher.match(["kittens"], "kitten");

    expect(result.found).toBe(true);
    expect(result.match_type).toBe("FUZZY");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("respects configurable thresholds", () => {
    const strictMatcher = new FuzzyMatcher({ threshold: 0.9 });
    const relaxedMatcher = new FuzzyMatcher({ threshold: 0.8 });

    const strictResult = strictMatcher.match(["kittens"], "kitten");
    const relaxedResult = relaxedMatcher.match(["kittens"], "kitten");

    expect(strictResult.found).toBe(false);
    expect(relaxedResult.found).toBe(true);
  });

  it("searches outward from the start line hint", () => {
    const matcher = new FuzzyMatcher();
    const lines = [
      "target",
      "alpha",
      "beta",
      "gamma",
      "delta",
      "epsilon",
      "zeta",
      "target",
    ];

    const result = matcher.match(lines, "target", { startLineHint: 8 });

    expect(result.found).toBe(true);
    expect(result.start_line).toBe(8);
    expect(result.end_line).toBe(8);
  });

  it("returns no match when similarity is below threshold", () => {
    const matcher = new FuzzyMatcher();

    const result = matcher.match(["alpha", "beta"], "omega");

    expect(result.found).toBe(false);
    expect(result.start_line).toBe(0);
    expect(result.end_line).toBe(0);
  });
});
