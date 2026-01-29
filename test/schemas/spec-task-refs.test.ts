/**
 * SpecTaskRefSchema validation tests
 *
 * Ensures range notation (e.g., "T001-T005") is rejected
 * and only individual task IDs are accepted
 */

import { describe, expect, it } from "vitest";
import {
  SpecTaskRefSchema,
  SpecTaskRefsSchema,
} from "../../src/schemas/sprint-config.js";

describe("SpecTaskRefSchema", () => {
  it("should accept valid task IDs", () => {
    expect(SpecTaskRefSchema.safeParse("T001").success).toBe(true);
    expect(SpecTaskRefSchema.safeParse("T002").success).toBe(true);
    expect(SpecTaskRefSchema.safeParse("T100").success).toBe(true);
    expect(SpecTaskRefSchema.safeParse("specs/001/tasks.md#T001").success).toBe(
      true,
    );
  });

  it("should reject empty strings", () => {
    const result = SpecTaskRefSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("should reject range notation", () => {
    const result = SpecTaskRefSchema.safeParse("T001-T005");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain("Range notation");
  });

  it("should reject range notation with suffix", () => {
    const result = SpecTaskRefSchema.safeParse("T001-T005d");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain("Range notation");
  });
});

describe("SpecTaskRefsSchema", () => {
  it("should accept array of valid task IDs", () => {
    const result = SpecTaskRefsSchema.safeParse(["T001", "T002", "T003"]);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(["T001", "T002", "T003"]);
  });

  it("should reject array containing range notation", () => {
    const result = SpecTaskRefsSchema.safeParse(["T001", "T002-T005", "T006"]);
    expect(result.success).toBe(false);
  });

  it("should accept empty array", () => {
    const result = SpecTaskRefsSchema.safeParse([]);
    expect(result.success).toBe(true);
  });
});
