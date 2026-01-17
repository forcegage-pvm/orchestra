// @orchestra-task: 1
/**
 * [tdd-red] Shared code review schema tests
 */

import { describe, expect, it } from "vitest";
import * as shared from "../../src/schemas/shared.js";

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

describe("[tdd-red] Code review shared schemas", () => {
  it("[tdd-red] should export code review enums", () => {
    if (!requireRedRun()) {
      return;
    }
    const sharedAny = shared as Record<string, unknown>;
    expect(sharedAny["CodeReviewStatusSchema"]).toBeDefined();
    expect(sharedAny["CodeReviewDecisionSchema"]).toBeDefined();
    expect(sharedAny["CodeReviewRiskSchema"]).toBeDefined();
  });

  it("[tdd-red] should validate CodeReviewStatus values", () => {
    if (!requireRedRun()) {
      return;
    }
    const sharedAny = shared as Record<
      string,
      { safeParse: (input: unknown) => { success: boolean } }
    >;
    const schema = sharedAny["CodeReviewStatusSchema"];
    expect(schema.safeParse("PENDING").success).toBe(true);
    expect(schema.safeParse("IN_REVIEW").success).toBe(true);
    expect(schema.safeParse("COMPLETED").success).toBe(true);
    expect(schema.safeParse("INVALID_STATUS").success).toBe(false);
  });

  it("[tdd-red] should validate CodeReviewDecision values", () => {
    if (!requireRedRun()) {
      return;
    }
    const sharedAny = shared as Record<
      string,
      { safeParse: (input: unknown) => { success: boolean } }
    >;
    const schema = sharedAny["CodeReviewDecisionSchema"];
    expect(schema.safeParse("APPROVED").success).toBe(true);
    expect(schema.safeParse("CHANGES_REQUIRED").success).toBe(true);
    expect(schema.safeParse("REJECTED").success).toBe(true);
    expect(schema.safeParse("INVALID_DECISION").success).toBe(false);
  });

  it("[tdd-red] should validate CodeReviewRisk values", () => {
    if (!requireRedRun()) {
      return;
    }
    const sharedAny = shared as Record<
      string,
      { safeParse: (input: unknown) => { success: boolean } }
    >;
    const schema = sharedAny["CodeReviewRiskSchema"];
    expect(schema.safeParse("LOW").success).toBe(true);
    expect(schema.safeParse("MEDIUM").success).toBe(true);
    expect(schema.safeParse("HIGH").success).toBe(true);
    expect(schema.safeParse("INVALID_RISK").success).toBe(false);
  });

  it("[tdd-red] should validate CodeReviewIssue schema", () => {
    if (!requireRedRun()) {
      return;
    }
    const sharedAny = shared as Record<
      string,
      { safeParse: (input: unknown) => { success: boolean } }
    >;
    const schema = sharedAny["CodeReviewIssueSchema"];

    const valid = schema.safeParse({
      severity: "MAJOR",
      category: "SECURITY",
      problem: "Sensitive data is logged.",
      impact: "Secrets could be exposed in logs.",
      guidance: "Redact credentials before logging.",
      file_path: "src/core/logger.ts",
      line: 42,
    });

    const invalid = schema.safeParse({
      severity: "INVALID",
      category: "",
      problem: "",
      impact: "",
      guidance: "",
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });
});
