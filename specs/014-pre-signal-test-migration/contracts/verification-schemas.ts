/**
 * Test Verification Contracts
 *
 * Zod schemas and TypeScript types for declarative test verification.
 * These contracts define the interface between:
 * - Handover creation (prepare_task)
 * - Verification execution (verify_task)
 * - Test runner tools (run_tests)
 */

import { z } from "zod";

// =============================================================================
// Core Enums
// =============================================================================

/**
 * Expected outcome for test verification.
 */
export const TestExpectationSchema = z.enum([
  "all_pass", // Every test in the tier must pass
  "any_fail", // At least one test must fail (TDD red-phase)
  "min_pass_count", // At least N tests must pass
]);

export type TestExpectation = z.output<typeof TestExpectationSchema>;

/**
 * Test execution scope.
 */
export const TestScopeSchema = z.enum([
  "file", // Single file
  "pattern", // Regex pattern matching
  "suite", // Named tier/suite
  "related", // Related to changed files
  "red", // TDD red-phase tier
  "failed", // Previously failed tests
  "all", // All tests
]);

export type TestScope = z.output<typeof TestScopeSchema>;

// =============================================================================
// Test Verification Criteria (used in handover)
// =============================================================================

/**
 * Single test verification criterion.
 * Defines what tier to run and what outcome is expected.
 */
export const TestVerificationCriteriaSchema = z
  .object({
    /** Test tier name (must exist in .agent-test-config.json) */
    tier: z.string().min(1, "Tier name is required"),

    /** Expected verification outcome */
    expect: TestExpectationSchema,

    /** Minimum passing count (required when expect="min_pass_count") */
    min_pass_count: z.number().int().nonnegative().optional(),
  })
  .refine(
    (data) => {
      if (data.expect === "min_pass_count") {
        return data.min_pass_count !== undefined && data.min_pass_count > 0;
      }
      return true;
    },
    {
      message:
        "min_pass_count is required and must be > 0 when expect='min_pass_count'",
      path: ["min_pass_count"],
    },
  );

export type TestVerificationCriteria = z.output<
  typeof TestVerificationCriteriaSchema
>;

/**
 * Array of test verification criteria for a task.
 */
export const TestVerificationArraySchema = z.array(
  TestVerificationCriteriaSchema,
);

export type TestVerificationArray = z.output<
  typeof TestVerificationArraySchema
>;

// =============================================================================
// Test Configuration (from .agent-test-config.json)
// =============================================================================

/**
 * Single test tier configuration.
 */
export const TestTierSchema = z.object({
  /** Unique tier name */
  name: z.string().min(1),

  /** Glob pattern for test files */
  path: z.string().min(1),

  /** Tier-specific timeout in milliseconds */
  timeout: z.number().int().positive().optional(),

  /** TDD red-phase semantics (failures expected) */
  inverted: z.boolean().optional(),
});

export type TestTier = z.output<typeof TestTierSchema>;

/**
 * Promotion configuration.
 */
export const PromotionConfigSchema = z.object({
  /** Dry run mode (default: true for safety) */
  dryRun: z.boolean().default(true),
});

export type PromotionConfig = z.output<typeof PromotionConfigSchema>;

/**
 * Complete test configuration.
 */
export const TestConfigSchema = z.object({
  /** Test framework (currently only vitest) */
  framework: z.literal("vitest"),

  /** Available test tiers */
  tiers: z.array(TestTierSchema).min(1, "At least one tier is required"),

  /** Working directory relative to workspace root */
  workingDir: z.string().optional(),

  /** Default timeout in milliseconds */
  defaultTimeout: z.number().int().positive().default(30000),

  /** Max lines of failure output per test */
  maxFailureLines: z.number().int().positive().default(20),

  /** Glob patterns for config fingerprinting */
  configFingerprint: z.array(z.string()).optional(),

  /** Vitest project names (for monorepo) */
  projects: z.array(z.string()).optional(),

  /** Promotion settings */
  promotion: PromotionConfigSchema.optional(),
});

export type TestConfig = z.output<typeof TestConfigSchema>;

// =============================================================================
// Test Execution Results
// =============================================================================

/**
 * Individual test outcome.
 */
export const TestOutcomeSchema = z.object({
  /** Full test name */
  name: z.string(),

  /** Test file path (relative) */
  file: z.string(),

  /** Line number in file */
  line: z.number().int().positive().optional(),

  /** Test result status */
  status: z.enum(["passed", "failed", "skipped"]),

  /** Failure details (when status="failed") */
  failure: z
    .object({
      message: z.string(),
      stack: z.string().optional(),
    })
    .optional(),
});

export type TestOutcome = z.output<typeof TestOutcomeSchema>;

/**
 * Promotion target from red-phase.
 */
export const PromotionTargetSchema = z.object({
  /** Source path in test/red/ */
  source: z.string(),

  /** Destination path outside test/red/ */
  destination: z.string(),

  /** Target tier name */
  tier: z.string(),

  /** Number of tests in file */
  testCount: z.number().int().nonnegative(),
});

export type PromotionTarget = z.output<typeof PromotionTargetSchema>;

/**
 * TDD red-phase result metadata.
 */
export const RedPhaseResultSchema = z.object({
  /** Number of files where all tests pass */
  filesEligible: z.number().int().nonnegative(),

  /** Number of files with at least one failure */
  filesInRedPhase: z.number().int().nonnegative(),

  /** Files ready for promotion */
  promotionTargets: z.array(PromotionTargetSchema),
});

export type RedPhaseResult = z.output<typeof RedPhaseResultSchema>;

/**
 * Complete test run result.
 */
export const TestRunResultSchema = z.object({
  /** Unique run identifier */
  runId: z.string().uuid(),

  /** Test execution scope */
  scope: TestScopeSchema,

  /** Scope-specific target */
  target: z.string().optional(),

  /** Whether result came from cache */
  cached: z.boolean(),

  /** Content fingerprint for caching */
  fingerprint: z.string().optional(),

  /** Execution timestamp (epoch ms) */
  timestamp: z.number().int().positive(),

  /** Working directory used */
  workingDir: z.string(),

  /** Execution duration (ms) */
  duration: z.number().int().nonnegative(),

  // Aggregate counts
  total: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),

  /** Individual test outcomes */
  tests: z.array(TestOutcomeSchema),

  /** Red-phase metadata (when applicable) */
  redPhase: RedPhaseResultSchema.optional(),

  /** Token-efficient summary string */
  summary: z.string(),
});

export type TestRunResult = z.output<typeof TestRunResultSchema>;

// =============================================================================
// Verification Judgment
// =============================================================================

/**
 * Result of evaluating test results against a single criterion.
 */
export const VerificationJudgmentSchema = z.object({
  /** Index in test_verification array */
  criteriaIndex: z.number().int().nonnegative(),

  /** Tier that was verified */
  tier: z.string(),

  /** What outcome was expected */
  expectation: TestExpectationSchema,

  /** What was actually observed */
  actual: z.object({
    total: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),

  /** Whether expectation was satisfied */
  passed: z.boolean(),

  /** Human-readable explanation */
  message: z.string(),
});

export type VerificationJudgment = z.output<typeof VerificationJudgmentSchema>;

// =============================================================================
// Tool Inputs/Outputs
// =============================================================================

/**
 * Input for runTestsCore function.
 */
export const RunTestsInputSchema = z.object({
  /** Test execution scope */
  scope: TestScopeSchema,

  /** Scope-specific target */
  target: z.string().optional(),

  /** Working directory (relative to workspace root) */
  working_dir: z.string().optional(),

  /** Bypass cache */
  force: z.boolean().optional(),

  /** Timeout override (ms) */
  timeout: z.number().int().positive().optional(),

  /** Max failure lines per test */
  max_failure_lines: z.number().int().positive().optional(),
});

export type RunTestsInput = z.output<typeof RunTestsInputSchema>;

/**
 * Input for promoteTestsCore function.
 */
export const PromoteTestsInputSchema = z.object({
  /** Files to promote (paths within test/red/) */
  files: z.array(z.string()).min(1),

  /** Dry run mode */
  dry_run: z.boolean().optional(),
});

export type PromoteTestsInput = z.output<typeof PromoteTestsInputSchema>;

/**
 * Promotion record for successful promotion.
 */
export const PromotionRecordSchema = z.object({
  source: z.string(),
  destination: z.string(),
  tier: z.string(),
  testCount: z.number().int().nonnegative(),
});

export type PromotionRecord = z.output<typeof PromotionRecordSchema>;

/**
 * Blocked promotion record.
 */
export const PromotionBlockedRecordSchema = z.object({
  source: z.string(),
  destination: z.string(),
  reason: z.enum(["still-failing", "file-missing", "destination-exists"]),
  message: z.string(),
});

export type PromotionBlockedRecord = z.output<
  typeof PromotionBlockedRecordSchema
>;

/**
 * Promotion result.
 */
export const PromoteTestsResultSchema = z.object({
  /** Dry run indicator */
  dryRun: z.boolean(),

  /** Successfully promoted files */
  promoted: z.array(PromotionRecordSchema),

  /** Blocked promotions */
  blocked: z.array(PromotionBlockedRecordSchema),

  /** Summary string */
  summary: z.string(),
});

export type PromoteTestsResult = z.output<typeof PromoteTestsResultSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Patterns that indicate shell test commands (should be rejected).
 */
export const SHELL_COMMAND_PATTERNS = [
  /npm\s+test/i,
  /npx\s+(vitest|jest|mocha)/i,
  /yarn\s+test/i,
  /pnpm\s+test/i,
  /\bjest\b/i,
  /\bmocha\b/i,
  /\bpytest\b/i,
  /cargo\s+test/i,
  /go\s+test/i,
  /flutter\s+test/i,
  /--testNamePattern/i,
  /--testPathPattern/i,
] as const;

/**
 * Check if text contains a shell test command pattern.
 */
export function containsShellTestCommand(text: string): boolean {
  return SHELL_COMMAND_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Validate that test_verification criteria reference valid tiers.
 */
export function validateCriteriaTiers(
  criteria: TestVerificationArray,
  config: TestConfig,
): { valid: boolean; invalidTiers: string[] } {
  const validTierNames = new Set(config.tiers.map((t) => t.name));
  const invalidTiers: string[] = [];

  for (const criterion of criteria) {
    if (!validTierNames.has(criterion.tier)) {
      invalidTiers.push(criterion.tier);
    }
  }

  return {
    valid: invalidTiers.length === 0,
    invalidTiers,
  };
}
