import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { OutputBuffer } from "../../../../../src/agents/tools/infrastructure/OutputBuffer.js";

const byteLength = (value: string): number => Buffer.byteLength(value, "utf8");

describe("OutputBuffer", () => {
  it("appends lines and returns text", () => {
    const buffer = new OutputBuffer();

    buffer.append("line-one\nline-two");

    expect(buffer.getLines()).toEqual(["line-one", "line-two"]);
    expect(buffer.getText()).toBe("line-one\nline-two");
  });

  it("handles mixed line endings", () => {
    const buffer = new OutputBuffer();

    buffer.append("alpha\r\nbeta\ngamma\rdelta");

    expect(buffer.getLines()).toEqual(["alpha", "beta", "gamma", "delta"]);
  });

  it("maintains a ring buffer when maxLines exceeded", () => {
    const buffer = new OutputBuffer({ maxLines: 2 });

    buffer.append("one\n");
    buffer.append("two\n");
    buffer.append("three\n");

    expect(buffer.getLines()).toEqual(["three", ""]);
    expect(buffer.getStats().truncated).toBe(true);
  });

  it("truncates when maxBytes exceeded while preserving head/tail", () => {
    const buffer = new OutputBuffer({
      maxBytes: 50,
      headRatio: 0.4,
      tailRatio: 0.6,
      truncationMessage: "<trunc>",
    });

    buffer.append(
      [
        "aaaaaaaa",
        "bbbbbbbb",
        "cccccccc",
        "dddddddd",
        "eeeeeeee",
        "ffffffff",
      ].join("\n"),
    );

    const lines = buffer.getLines();

    expect(lines).toContain("<trunc>");
    expect(lines).toContain("aaaaaaaa");
    expect(lines).toContain("ffffffff");
    expect(buffer.getStats().truncated).toBe(true);
    expect(buffer.getStats().bytes).toBeLessThanOrEqual(50);
  });

  it("reports accurate stats", () => {
    const buffer = new OutputBuffer();

    buffer.append("hi\nthere");

    const stats = buffer.getStats();
    const expectedBytes = byteLength("hi") + 1 + byteLength("there");

    expect(stats.lines).toBe(2);
    expect(stats.bytes).toBe(expectedBytes);
    expect(stats.truncated).toBe(false);
  });

  it("clears all content", () => {
    const buffer = new OutputBuffer();

    buffer.append("one\ntwo");
    buffer.clear();

    expect(buffer.getLines()).toEqual([]);
    expect(buffer.getText()).toBe("");
    expect(buffer.getStats()).toEqual({ lines: 0, bytes: 0, truncated: false });
  });
});
