import { describe, expect, it } from "vitest";
import { greet } from "./greeter.js";

describe("greet", () => {
  it("should greet Alice", () => {
    expect(greet("Alice")).toBe("Hello, Alice!");
  });

  it("should greet Bob", () => {
    expect(greet("Bob")).toBe("Hello, Bob!");
  });

  it("should handle empty string", () => {
    expect(greet("")).toBe("Hello, stranger!");
  });

  it("should handle whitespace", () => {
    expect(greet("   ")).toBe("Hello, stranger!");
  });
});
