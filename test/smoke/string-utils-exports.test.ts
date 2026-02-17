
import {
  capitalize,
  countWords,
  slugify,
  truncate,
} from "../../src/core/string-utils.js";

describe("string-utils exports", () => {
  it("exports slugify as a function", () => {
    expect(typeof slugify).toBe("function");
  });

  it("exports truncate as a function", () => {
    expect(typeof truncate).toBe("function");
  });

  it("exports capitalize as a function", () => {
    expect(typeof capitalize).toBe("function");
  });

  it("exports countWords as a function", () => {
    expect(typeof countWords).toBe("function");
  });
});

describe("string-utils sanity calls", () => {
  it("slugify returns a string", () => {
    const result = slugify("Hello World");
    expect(typeof result).toBe("string");
  });

  it("truncate returns a string", () => {
    const result = truncate("Hello World", 5);
    expect(typeof result).toBe("string");
  });

  it("capitalize returns a string", () => {
    const result = capitalize("hello world");
    expect(typeof result).toBe("string");
  });

  it("countWords returns a number", () => {
    const result = countWords("hello world");
    expect(typeof result).toBe("number");
  });
});
