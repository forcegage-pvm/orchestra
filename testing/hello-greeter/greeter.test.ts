import { greet } from "./greeter";

describe("greet", () => {
  // Test greeting for Alice
  it("should greet Alice", () => {
    expect(greet("Alice")).toBe("Hello, Alice!");
  });

  // Test greeting for Bob
  it("should greet Bob", () => {
    expect(greet("Bob")).toBe("Hello, Bob!");
  });

  // Test handling empty string
  it("should handle empty string", () => {
    expect(greet("")).toBe("Hello, stranger!");
  });

  // Test handling whitespace
  it("should handle whitespace", () => {
    expect(greet("   ")).toBe("Hello, stranger!");
  });
});
