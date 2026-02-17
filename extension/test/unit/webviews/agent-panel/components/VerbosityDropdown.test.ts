/**
 * VerbosityDropdown Component Tests
 *
 * Verifies export, options, and uiStore compatibility.
 */

import { describe, expect, it } from "vitest";
import {
  VerbosityDropdown,
  verbosityOptions,
} from "../../../../../src/webviews/agent-panel/components/VerbosityDropdown.js";
import type { VerbosityLevel } from "../../../../../src/webviews/agent-panel/stores/uiStore.js";

describe("VerbosityDropdown", () => {
  it("should export VerbosityDropdown component", () => {
    expect(VerbosityDropdown).toBeDefined();
    expect(typeof VerbosityDropdown).toBe("function");
  });

  it("should be exported from components barrel", async () => {
    const module =
      await import("../../../../../src/webviews/agent-panel/components/index.js");
    expect(module.VerbosityDropdown).toBeDefined();
  });

  it("should include all verbosity options", () => {
    const values = verbosityOptions.map((option) => option.value);
    expect(values).toEqual(["minimal", "normal", "verbose", "debug"]);
  });

  it("should accept all VerbosityLevel values", () => {
    const levels: VerbosityLevel[] = ["minimal", "normal", "verbose", "debug"];

    expect(levels).toHaveLength(4);
  });
});
