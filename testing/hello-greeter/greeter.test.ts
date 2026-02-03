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

  it("should handle tabs and newlines as whitespace-only", () => {
    expect(greet("\t\n  ")).toBe("Hello, stranger!");
  });

  it("should greet names with spaces", () => {
    expect(greet("Alice Smith")).toBe("Hello, Alice Smith!");
  });

  it("should preserve leading and trailing spaces in name", () => {
    expect(greet("  Alice  ")).toBe("Hello,   Alice  !");
  });
});
