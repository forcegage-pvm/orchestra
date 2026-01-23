/**
 * Predefined verification check templates.
 *
 * These eliminate agent improvisation for standard verification patterns.
 * Instead of agents writing fragile regex/commands, the system generates
 * checks from these tested, validated templates.
 *
 * Usage in prepare_task:
 *   - System detects language from environment config
 *   - System calls getTddRedChecks(language, options)
 *   - Correct checks are generated with proper escaping
 *
 * NO AGENT INVOLVEMENT IN PATTERN/COMMAND CREATION.
 *
 * PLACEHOLDERS (replaced at runtime):
 * - {{CD_PREFIX}}: "cd subdir; " or "" for root
 * - {{TEST_FILE_PATTERN}}: glob pattern for test files
 * - {{TASK_ID}}: the task ID number
 * - {{TASK_TITLE}}: the task title for descriptions
 */

export interface CheckTemplate {
  check_type: "structural" | "behavioral" | "quality";
  description: string;
  severity: "BLOCKING" | "MAJOR" | "MINOR" | "INFO";
  check_config: {
    // Structural/Quality
    path?: string;
    pattern?: string;
    min_matches?: number;
    // Behavioral
    command?: string;
    expect_exit_code?: number;
    expect_output_contains?: string;
    // For display
    success_message?: string;
    failure_message?: string;
  };
}

export type SupportedLanguage = "dart" | "typescript" | "python" | "rust";

export interface LanguageCheckSet {
  [key: string]: CheckTemplate[] | undefined;
  typescript?: CheckTemplate[];
  dart?: CheckTemplate[];
  python?: CheckTemplate[];
  rust?: CheckTemplate[];
}

/**
 * TDD Red-Phase verification check templates.
 *
 * Each template uses placeholders that are replaced at runtime.
 * This ensures patterns/commands are correct and tested.
 */
export const TDD_RED_CHECKS: LanguageCheckSet = {
  dart: [
    {
      check_type: "behavioral",
      description: '[TDD RED] Tagged tests must fail for "{{TASK_TITLE}}"',
      severity: "BLOCKING",
      check_config: {
        command: "{{CD_PREFIX}}{{TEST_COMMAND}}",
        expect_exit_code: 1,
        success_message: "Tagged tests failed as expected (red phase)",
        failure_message: "Tagged tests must fail in red phase",
      },
    },
    {
      check_type: "behavioral",
      description: '[TDD RED] Non-tagged tests must pass for "{{TASK_TITLE}}"',
      severity: "BLOCKING",
      check_config: {
        command: "{{CD_PREFIX}}{{TEST_COMMAND}}",
        expect_exit_code: 0,
        success_message: "Non-tagged tests passed (no regressions)",
        failure_message: "Non-tagged tests failed - regressions detected",
      },
    },
    {
      check_type: "structural",
      description: '[TDD RED] Task-ID annotation present for "{{TASK_TITLE}}"',
      severity: "BLOCKING",
      check_config: {
        path: "{{TEST_FILE_PATTERN}}",
        pattern: "//\\s*@orchestra-task:\\s*{{TASK_ID}}",
        min_matches: 1,
      },
    },
    {
      check_type: "structural",
      description: '[TDD RED] Red-phase marker present for "{{TASK_TITLE}}"',
      severity: "BLOCKING",
      check_config: {
        path: "{{TEST_FILE_PATTERN}}",
        pattern: "@Tags.*tdd-red|tags:.*tdd-red",
        min_matches: 1,
      },
    },
  ],

  typescript: [
    {
      check_type: "behavioral",
      description: '[TDD RED] Red-phase tests must fail for "{{TASK_TITLE}}"',
      severity: "BLOCKING",
      check_config: {
        command: "{{CD_PREFIX}}{{TEST_COMMAND}}",
        expect_exit_code: 1,
        success_message: "Red-phase tests failed as expected",
        failure_message: "Red-phase tests must fail",
      },
    },
    {
      check_type: "behavioral",
      description: '[TDD RED] Non-red tests must pass for "{{TASK_TITLE}}"',
      severity: "BLOCKING",
      check_config: {
        command: "{{CD_PREFIX}}{{TEST_COMMAND}}",
        expect_exit_code: 0,
        success_message: "Non-red tests passed (no regressions)",
        failure_message: "Non-red tests failed - regressions detected",
      },
    },
    {
      check_type: "structural",
      description: '[TDD RED] Task-ID annotation present for "{{TASK_TITLE}}"',
      severity: "BLOCKING",
      check_config: {
        path: "{{TEST_FILE_PATTERN}}",
        pattern: "//\\s*@orchestra-task:\\s*{{TASK_ID}}",
        min_matches: 1,
      },
    },
    {
      check_type: "structural",
      description:
        '[TDD RED] Red-phase test marker present for "{{TASK_TITLE}}"',
      severity: "BLOCKING",
      check_config: {
        path: "{{TEST_FILE_PATTERN}}",
        pattern: "\\[tdd-red\\]",
        min_matches: 1,
      },
    },
  ],

  python: [
    {
      check_type: "behavioral",
      description: '[TDD RED] Tagged tests must fail for "{{TASK_TITLE}}"',
      severity: "BLOCKING",
      check_config: {
        command: "{{CD_PREFIX}}{{TEST_COMMAND}}",
        expect_exit_code: 1,
        success_message: "Tagged tests failed as expected (red phase)",
        failure_message: "Tagged tests must fail in red phase",
      },
    },
    {
      check_type: "behavioral",
      description: '[TDD RED] Non-tagged tests must pass for "{{TASK_TITLE}}"',
      severity: "BLOCKING",
      check_config: {
        command: "{{CD_PREFIX}}{{TEST_COMMAND}}",
        expect_exit_code: 0,
        success_message: "Non-tagged tests passed (no regressions)",
        failure_message: "Non-tagged tests failed - regressions detected",
      },
    },
    {
      check_type: "structural",
      description: '[TDD RED] Task-ID annotation present for "{{TASK_TITLE}}"',
      severity: "BLOCKING",
      check_config: {
        path: "{{TEST_FILE_PATTERN}}",
        pattern: "#\\s*@orchestra-task:\\s*{{TASK_ID}}",
        min_matches: 1,
      },
    },
    {
      check_type: "structural",
      description: '[TDD RED] Red-phase marker present for "{{TASK_TITLE}}"',
      severity: "BLOCKING",
      check_config: {
        path: "{{TEST_FILE_PATTERN}}",
        pattern: "@pytest\\.mark\\.tdd_red",
        min_matches: 1,
      },
    },
  ],

  rust: [
    {
      check_type: "behavioral",
      description: '[TDD RED] Tagged tests must fail for "{{TASK_TITLE}}"',
      severity: "BLOCKING",
      check_config: {
        command: "{{CD_PREFIX}}{{TEST_COMMAND}}",
        expect_exit_code: 101, // Rust test failures exit with 101
        success_message: "Tagged tests failed as expected (red phase)",
        failure_message: "Tagged tests must fail in red phase",
      },
    },
    {
      check_type: "behavioral",
      description: '[TDD RED] Non-tagged tests must pass for "{{TASK_TITLE}}"',
      severity: "BLOCKING",
      check_config: {
        command: "{{CD_PREFIX}}{{TEST_COMMAND}}",
        expect_exit_code: 0,
        success_message: "Non-tagged tests passed (no regressions)",
        failure_message: "Non-tagged tests failed - regressions detected",
      },
    },
    {
      check_type: "structural",
      description: '[TDD RED] Task-ID annotation present for "{{TASK_TITLE}}"',
      severity: "BLOCKING",
      check_config: {
        path: "{{TEST_FILE_PATTERN}}",
        pattern: "//\\s*@orchestra-task:\\s*{{TASK_ID}}",
        min_matches: 1,
      },
    },
    {
      check_type: "structural",
      description:
        '[TDD RED] Red-phase test function present for "{{TASK_TITLE}}"',
      severity: "BLOCKING",
      check_config: {
        path: "{{TEST_FILE_PATTERN}}",
        pattern: "fn\\s+tdd_red_",
        min_matches: 1,
      },
    },
  ],
};

/**
 * Placeholder values for template instantiation.
 */
export interface CheckTemplateContext {
  cdPrefix: string; // "cd subdir; " or ""
  testFilePattern: string; // glob pattern for test files
  taskId: number; // the task ID
  taskTitle: string; // the task title
  testCommand: string; // test command from sprint environment (required)
}

/**
 * Replace placeholders in a string with actual values.
 */
function replacePlaceholders(
  template: string,
  ctx: CheckTemplateContext,
): string {
  return template
    .replace(/\{\{CD_PREFIX\}\}/g, ctx.cdPrefix)
    .replace(/\{\{TEST_FILE_PATTERN\}\}/g, ctx.testFilePattern)
    .replace(/\{\{TASK_ID\}\}/g, String(ctx.taskId))
    .replace(/\{\{TASK_TITLE\}\}/g, ctx.taskTitle)
    .replace(/\{\{TEST_COMMAND\}\}/g, ctx.testCommand);
}

/**
 * Get TDD red-phase checks for a specific language.
 * Replaces all placeholders with actual values from context.
 */
export function getTddRedChecks(
  language: SupportedLanguage,
  ctx: CheckTemplateContext,
): CheckTemplate[] {
  const templates = TDD_RED_CHECKS[language];
  if (!templates) {
    throw new Error(`No TDD red-phase templates for language: ${language}`);
  }

  // Deep clone and replace placeholders
  return templates.map((template): CheckTemplate => {
    const config = { ...template.check_config };

    if (config.command) {
      config.command = replacePlaceholders(config.command, ctx);
    }
    if (config.path) {
      config.path = replacePlaceholders(config.path, ctx);
    }
    if (config.pattern) {
      config.pattern = replacePlaceholders(config.pattern, ctx);
    }

    return {
      check_type: template.check_type,
      description: replacePlaceholders(template.description, ctx),
      severity: template.severity,
      check_config: config,
    };
  });
}

/**
 * Detect language from sprint environment settings.
 */
export function detectLanguageFromEnv(
  testCommand?: string,
  testFilePattern?: string,
): SupportedLanguage | null {
  if (testCommand) {
    if (testCommand.includes("flutter") || testCommand.includes("dart"))
      return "dart";
    if (testCommand.includes("cargo")) return "rust";
    if (testCommand.includes("pytest") || testCommand.includes("python"))
      return "python";
    if (
      testCommand.includes("npm") ||
      testCommand.includes("vitest") ||
      testCommand.includes("jest")
    )
      return "typescript";
  }

  if (testFilePattern) {
    if (testFilePattern.includes(".dart")) return "dart";
    if (testFilePattern.includes(".rs")) return "rust";
    if (testFilePattern.includes(".py")) return "python";
    if (testFilePattern.includes(".ts") || testFilePattern.includes(".test."))
      return "typescript";
  }

  return null;
}

// ============================================================================
// Future check templates to add:
// ============================================================================
// - TDD_GREEN_CHECKS: Verify tests pass, markers removed
// - CODE_REVIEW_CHECKS: Verify code review was submitted
// - LINT_CHECKS: Run linter with zero errors
// - TYPE_CHECK: Run type checker
// - BUILD_CHECKS: Verify project builds
// ============================================================================
