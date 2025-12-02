/**
 * Core Types Tests - Scaffold
 *
 * These tests verify the type definitions exist and have correct defaults.
 * Full implementation tests will be added in Task 1.2.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/types.js";

describe("Types (Scaffold)", () => {
  describe("DEFAULT_CONFIG", () => {
    it("should have correct version", () => {
      expect(DEFAULT_CONFIG.version).toBe("1.0");
    });

    it("should have correct default paths per Bible Section 6.1", () => {
      expect(DEFAULT_CONFIG.paths.manifest).toBe("manifest.yaml");
      expect(DEFAULT_CONFIG.paths.handovers).toBe("implementor/handovers");
      expect(DEFAULT_CONFIG.paths.signals).toBe("implementor/signals");
      expect(DEFAULT_CONFIG.paths.feedback).toBe("implementor/feedback");
      expect(DEFAULT_CONFIG.paths.artifacts).toBe("artifacts");
    });

    it("should have correct retry defaults", () => {
      expect(DEFAULT_CONFIG.retry.max_retries).toBe(3);
    });
  });
});
