import { describe, expect, it } from "vitest";
import { greet } from "./greeter.js";

describe("greet", () => {
  it("should greet Alice", () => {
    expect(greet("Alice")).toBe("Hello, Alice!");
  });

  it("should greet Bob", () => {
    expect(greet("Bob")).toBe("Hello, Bob!");
  });

  it("should trim leading and trailing whitespace", () => {
    expect(greet("  Alice  ")).toBe("Hello, Alice!");
  });

  it("should trim tabs and newlines", () => {
    expect(greet("\tBob\n")).toBe("Hello, Bob!");
  });

  it("should preserve internal multiple spaces after trimming", () => {
    expect(greet("  Ada   Lovelace  ")).toBe("Hello, Ada   Lovelace!");
  });

  it("should preserve internal tabs after trimming", () => {
    expect(greet("  Ada\tLovelace  ")).toBe("Hello, Ada\tLovelace!");
  });

  it("should preserve internal spaces", () => {
    expect(greet("Ada Lovelace")).toBe("Hello, Ada Lovelace!");
  });

  it("should handle empty string", () => {
    expect(greet("")).toBe("Hello, stranger!");
  });

  it("should handle whitespace", () => {
    expect(greet("   ")).toBe("Hello, stranger!");
  });

  it("should handle whitespace-only tabs and newlines", () => {
    expect(greet("\n\t  ")).toBe("Hello, stranger!");
  });
});
