/**
 * Core Types Tests
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/types.js";

describe("Types", () => {
  describe("DEFAULT_CONFIG", () => {
    it("should have correct version", () => {
      expect(DEFAULT_CONFIG.version).toBe("1.0");
    });

    it("should have correct default paths", () => {
      expect(DEFAULT_CONFIG.paths.manifest).toBe("manifest.yaml");
      expect(DEFAULT_CONFIG.paths.handovers).toBe("implementor/handovers");
      expect(DEFAULT_CONFIG.paths.signals).toBe("implementor/signals");
      expect(DEFAULT_CONFIG.paths.feedback).toBe("implementor/feedback");
      expect(DEFAULT_CONFIG.paths.artifacts).toBe("artifacts");
    });

    it("should have correct retry defaults", () => {
      expect(DEFAULT_CONFIG.retry.max_retries).toBe(3);
    });

    it("should have correct git defaults", () => {
      expect(DEFAULT_CONFIG.git.auto_commit).toBe(false);
      expect(DEFAULT_CONFIG.git.commit_prefix).toBe("orchestra");
    });
  });
});
