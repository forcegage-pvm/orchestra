// @orchestra-task: 2
/**
 * TDD RED PHASE: Smoke tests for string-utils module exports
 *
 * These tests are expected to FAIL because string-utils.ts
 * contains stub implementations that throw "Not implemented".
 *
 * This test validates:
 * - All 4 functions are exported
 * - Each export is a function (typeof check)
 * - Basic sanity calls return expected types (will fail on stub)
 */

import { describe, expect, it } from "vitest";
import {
  slugify,
  truncate,
  capitalize,
  countWords,
} from "../../../src/core/string-utils.js";

describe("Smoke: string-utils exports", () => {
  it("should export slugify as a function", () => {
    expect(typeof slugify).toBe("function");
  });

  it("should export truncate as a function", () => {
    expect(typeof truncate).toBe("function");
  });

  it("should export capitalize as a function", () => {
    expect(typeof capitalize).toBe("function");
  });

  it("should export countWords as a function", () => {
    expect(typeof countWords).toBe("function");
  });

  it("slugify should return a string", () => {
    const result = slugify("Test String");
    expect(typeof result).toBe("string");
  });

  it("truncate should return a string", () => {
    const result = truncate("Test String", 10);
    expect(typeof result).toBe("string");
  });

  it("capitalize should return a string", () => {
    const result = capitalize("test string");
    expect(typeof result).toBe("string");
  });

  it("countWords should return a number", () => {
    const result = countWords("test string");
    expect(typeof result).toBe("number");
  });
});
