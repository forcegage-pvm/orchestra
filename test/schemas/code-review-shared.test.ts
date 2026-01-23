/**
 * Shared code review schema tests
 */

import { describe, expect, it } from "vitest";
import * as shared from "../../src/schemas/shared.js";

describe("Code review shared schemas", () => {
  it("should export code review enums", () => {
    const sharedAny = shared as Record<string, unknown>;
    expect(sharedAny["CodeReviewStatusSchema"]).toBeDefined();
    expect(sharedAny["CodeReviewDecisionSchema"]).toBeDefined();
    expect(sharedAny["CodeReviewRiskSchema"]).toBeDefined();
    expect(sharedAny["CodeReviewBlockingSeveritySchema"]).toBeDefined();
  });

  it("should validate CodeReviewStatus values", () => {
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

  it("should validate CodeReviewDecision values", () => {
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

  it("should validate CodeReviewRisk values", () => {
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

  it("should validate CodeReviewIssue schema", () => {
    const sharedAny = shared as Record<
      string,
      { safeParse: (input: unknown) => { success: boolean } }
    >;
    const schema = sharedAny["CodeReviewIssueSchema"];

    const valid = schema.safeParse({
      severity: "MAJOR",
      issue: "Sensitive data is logged.",
      file: "src/core/logger.ts",
      line: 42,
      code_snippet: "console.log(secret)",
      rationale: "Credentials could be exposed in logs.",
      recommendation: "Redact credentials before logging.",
    });

    const invalid = schema.safeParse({
      severity: "INVALID",
      issue: "",
      rationale: "",
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it("should validate CodeReviewBlockingSeverity values", () => {
    const sharedAny = shared as Record<
      string,
      { safeParse: (input: unknown) => { success: boolean } }
    >;
    const schema = sharedAny["CodeReviewBlockingSeveritySchema"];
    expect(schema.safeParse("BLOCKING").success).toBe(true);
    expect(schema.safeParse("MAJOR").success).toBe(true);
    expect(schema.safeParse("MINOR").success).toBe(true);
    expect(schema.safeParse("INFO").success).toBe(false);
  });
});
