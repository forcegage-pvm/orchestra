/**
 * Code review config defaults/validation tests
 */

import { existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { initializeOrchestra, loadConfig } from "../../src/core/config.js";

const createTempDir = (): string => {
  const dir = join(tmpdir(), `orchestra-code-review-config-${Date.now()}`);
  return dir;
};

describe("Code review config", () => {
  it("should include code_review_* defaults", () => {
    const tempDir = createTempDir();
    const config = loadConfig(tempDir);
    const configAny = config as Record<string, unknown>;

    expect(configAny["code_review_enabled"]).toBe(true);
    expect(configAny["code_review_policy"]).toBe("phase_gate");
    expect(configAny["code_review_blocking_severity"]).toBe("BLOCKING");
    expect(configAny["code_review_auto_trigger"]).toBe("both");
    expect(configAny["code_review_required_steps"]).toBeUndefined();
  });

  it("should validate code_review_* values", () => {
    const tempDir = createTempDir();

    expect(() =>
      initializeOrchestra(tempDir, {
        code_review_enabled: "yes" as unknown as boolean,
      }),
    ).toThrow();

    expect(() =>
      initializeOrchestra(tempDir, {
        code_review_policy: "MAYBE" as unknown as string,
        code_review_blocking_severity: "INFO" as unknown as string,
        code_review_auto_trigger: "sometimes" as unknown as string,
      }),
    ).toThrow();

    expect(() =>
      initializeOrchestra(tempDir, {
        code_review_required_steps: ["NOT_A_STEP"] as unknown as string[],
      }),
    ).toThrow();

    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
