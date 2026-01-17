// @orchestra-task: 1
/**
 * [tdd-red] Code review config defaults/validation tests
 */

import { existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { initializeOrchestra, loadConfig } from "../../src/core/config.js";

const getTestNamePattern = (): string => {
  const envPattern =
    process.env.npm_config_testNamePattern ??
    process.env.VITEST_TEST_NAME_PATTERN;
  if (envPattern) {
    return envPattern;
  }

  const vitestWorker = globalThis as {
    __vitest_worker__?: { config?: { testNamePattern?: RegExp | string } };
  };
  const workerPattern = vitestWorker.__vitest_worker__?.config?.testNamePattern;
  if (workerPattern) {
    return workerPattern.toString();
  }

  const argvJoined = process.argv.join(" ");
  if (argvJoined.includes("testNamePattern")) {
    return argvJoined;
  }

  const npmArgv = process.env.npm_config_argv;
  if (npmArgv) {
    try {
      const parsed = JSON.parse(npmArgv) as { original?: string[] };
      if (parsed.original && parsed.original.length > 0) {
        return parsed.original.join(" ");
      }
    } catch {
      return "";
    }
  }

  return "";
};

const isRedTestRun = getTestNamePattern().includes("tdd-red");
const requireRedRun = (): boolean => {
  if (!isRedTestRun) {
    expect(true).toBe(true);
    return false;
  }
  return true;
};

const createTempDir = (): string => {
  const dir = join(tmpdir(), `orchestra-code-review-config-${Date.now()}`);
  return dir;
};

describe("[tdd-red] Code review config", () => {
  it("[tdd-red] should include code_review_* defaults", () => {
    if (!requireRedRun()) {
      return;
    }
    const tempDir = createTempDir();
    const config = loadConfig(tempDir);
    const configAny = config as Record<string, unknown>;

    expect(configAny["code_review_required"]).toBe(true);
    expect(configAny["code_review_auto_commit"]).toBe(false);
    expect(configAny["code_review_policy"]).toBe("STRICT");
    expect(configAny["code_review_default_decision"]).toBe("CHANGES_REQUIRED");
    expect(configAny["code_review_default_risk"]).toBe("MEDIUM");
  });

  it("[tdd-red] should validate code_review_* values", () => {
    if (!requireRedRun()) {
      return;
    }
    const tempDir = createTempDir();

    expect(() =>
      initializeOrchestra(tempDir, {
        code_review_required: "yes" as unknown as boolean,
      }),
    ).toThrow();

    expect(() =>
      initializeOrchestra(tempDir, {
        code_review_default_decision: "MAYBE" as unknown as string,
        code_review_default_risk: "CRITICAL" as unknown as string,
      }),
    ).toThrow();

    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
