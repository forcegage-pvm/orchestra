import { describe, expect, it } from "vitest";
import {
  capitalize,
  countWords,
  slugify,
  truncate,
} from "../../../src/core/string-utils.js";

describe("slugify", () => {
  it("converts normal input to a lowercase slug", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
  });

  it("removes special characters", () => {
    expect(slugify("C# & C++ @ 2024")).toBe("c-c-2024");
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(slugify("    \t   ")).toBe("");
  });

  it("collapses and trims consecutive hyphens", () => {
    expect(slugify("---test---")).toBe("test");
  });

  it("normalizes mixed case and spacing", () => {
    expect(slugify("  Foo  BAR  baz")).toBe("foo-bar-baz");
  });
});

describe("truncate", () => {
  it("returns input unchanged when shorter than max length", () => {
    expect(truncate("Hi", 5)).toBe("Hi");
  });

  it("returns input unchanged when exactly at max length", () => {
    expect(truncate("Hello", 5)).toBe("Hello");
  });

  it("truncates and appends default ellipsis", () => {
    expect(truncate("Hello World", 5)).toBe("He...");
  });

  it("truncates and appends custom ellipsis", () => {
    expect(truncate("Hello World", 5, "…")).toBe("Hell…");
  });

  it("returns empty string when maxLength is 0", () => {
    expect(truncate("Hello World", 0)).toBe("");
  });

  it("throws when maxLength is less than ellipsis length", () => {
    expect(() => truncate("Hello", 2)).toThrow(
      "maxLength must be greater than or equal to ellipsis length",
    );
  });
});

describe("capitalize", () => {
  it("capitalizes a single word", () => {
    expect(capitalize("hello")).toBe("Hello");
  });

  it("capitalizes multi-word input", () => {
    expect(capitalize("hello world")).toBe("Hello World");
  });

  it("normalizes all-caps input", () => {
    expect(capitalize("HELLO WORLD")).toBe("Hello World");
  });

  it("returns empty string for empty input", () => {
    expect(capitalize("")).toBe("");
  });

  it("preserves leading, trailing, and multiple spaces", () => {
    expect(capitalize("  foo  bar  ")).toBe("  Foo  Bar  ");
  });
});

describe("countWords", () => {
  it("counts words in normal input", () => {
    expect(countWords("hello world")).toBe(2);
  });

  it("handles excessive whitespace", () => {
    expect(countWords("  foo  bar  baz")).toBe(3);
  });

  it("returns 0 for empty input", () => {
    expect(countWords("")).toBe(0);
  });

  it("returns 0 for whitespace-only input", () => {
    expect(countWords("   \n\t   ")).toBe(0);
  });

  it("counts a single word", () => {
    expect(countWords("hello")).toBe(1);
  });
});
