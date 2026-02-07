/**
 * Handover Validation Module
 *
 * Enforces information isolation boundary between Orchestrator and Implementor.
 * Validates that handover content doesn't leak forbidden information like:
 * - Specification file references
 * - Task structure/list references
 * - Sprint structure references
 * - Verification criteria
 *
 * This is CRITICAL for Orchestra's trust model - implementors must never see
 * the verification criteria or sprint structure to prevent gaming the system.
 */

/**
 * Forbidden patterns in context text and file paths.
 * These patterns indicate potential trust boundary violations.
 */
export const FORBIDDEN_PATTERNS = {
  /**
   * Spec file references in text:
   * - "from spec lines 133-140"
   * - "see spec/file.md"
   * - "per specification document"
   */
  SPEC_REFERENCES: [
    /\bspec\s+(lines?|file|document)/i,
    /from\s+spec\s+lines?\s+\d+/i,
    /see\s+spec[/\\]/i,
    /per\s+spec(ification)?/i,
    /\bspec[/\\][\w-]+\.md/i,
  ],

  /**
   * Task references in text:
   * - "Task 6 (not started)"
   * - "see Task 3"
   * - "after task-005"
   * - "depends on Task #4"
   *
   * NOTE: Excludes @orchestra-task: N format which is legitimate TDD annotation
   */
  TASK_REFERENCES: [
    /\btask\s+\d+/i,
    /\btask\s+#\d+/i,
    /(?<!@orchestra-)task[-_]\d+/i, // Exclude @orchestra-task: N format
    /see\s+task\s+\d+/i,
    /after\s+task/i,
    /\(not\s+started\)/i,
    /\(pending\)/i,
    /\(in\s+progress\)/i,
  ],

  /**
   * Sprint structure references in text:
   * - "Sprint 003"
   * - "after sprint-004"
   * - "in sprint 5"
   */
  SPRINT_REFERENCES: [
    /\bsprint[_-]?\d+/i,
    /sprint\s+\d+/i,
    /after\s+sprint/i,
    /in\s+sprint/i,
    /current\s+sprint/i,
  ],

  /**
   * Forbidden file paths in context_files:
   * - spec/ directory
   * - tasks.md, task-breakdown.md
   * - manifest.yaml, progress.yaml
   * - .orchestrator-only/ directory
   * - implementation-plan files
   */
  FORBIDDEN_PATHS: [
    /spec[/\\]/i,
    /tasks\.md$/i,
    /task[-_]breakdown/i,
    /manifest\.yaml$/i,
    /progress\.yaml$/i,
    /\.orchestrator-only/i,
    /implementation[-_]?plan/i,
    /sprint[-_]\d+.*\.md$/i,
  ],
};

/**
 * Result of handover validation
 */
export interface HandoverValidationResult {
  valid: boolean;
  violations: string[];
}

/**
 * Validates handover context text for forbidden content.
 *
 * Checks for:
 * - Spec file references
 * - Task references
 * - Sprint structure references
 *
 * @param context - The context text from prepare_task
 * @returns Validation result with violations list
 */
export function validateHandoverContext(
  context: string | undefined,
): HandoverValidationResult {
  const violations: string[] = [];

  if (!context) {
    return { valid: true, violations: [] };
  }

  // Check spec references
  for (const pattern of FORBIDDEN_PATTERNS.SPEC_REFERENCES) {
    if (pattern.test(context)) {
      violations.push(
        `Context contains spec file reference matching pattern: ${pattern.source}`,
      );
    }
  }

  // Check task references
  for (const pattern of FORBIDDEN_PATTERNS.TASK_REFERENCES) {
    if (pattern.test(context)) {
      violations.push(
        `Context contains task reference matching pattern: ${pattern.source}`,
      );
    }
  }

  // Check sprint references
  for (const pattern of FORBIDDEN_PATTERNS.SPRINT_REFERENCES) {
    if (pattern.test(context)) {
      violations.push(
        `Context contains sprint structure reference matching pattern: ${pattern.source}`,
      );
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Validates context_files array for forbidden paths.
 *
 * Checks for:
 * - spec/ directory files
 * - Task breakdown files (tasks.md, task-breakdown.md)
 * - Sprint manifests (manifest.yaml, progress.yaml)
 * - Orchestrator-only directories
 * - Implementation plan files
 *
 * @param contextFiles - Array of file paths from prepare_task
 * @returns Validation result with violations list
 */
export function validateContextFiles(
  contextFiles: string[] | undefined,
): HandoverValidationResult {
  const violations: string[] = [];

  if (!contextFiles || contextFiles.length === 0) {
    return { valid: true, violations: [] };
  }

  for (const file of contextFiles) {
    for (const pattern of FORBIDDEN_PATTERNS.FORBIDDEN_PATHS) {
      if (pattern.test(file)) {
        violations.push(
          `context_files contains forbidden path: ${file} (matches pattern: ${pattern.source})`,
        );
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Validates all handover inputs for information isolation violations.
 *
 * This is the main entry point for validation. It checks both context text
 * and context_files array.
 *
 * @param context - Context text
 * @param contextFiles - Context files array
 * @throws Error if validation fails with detailed violation information
 */
export function validateHandoverIsolation(
  context: string | undefined,
  contextFiles: string[] | undefined,
): void {
  const contextResult = validateHandoverContext(context);
  const filesResult = validateContextFiles(contextFiles);

  const allViolations = [
    ...contextResult.violations,
    ...filesResult.violations,
  ];

  if (allViolations.length > 0) {
    const errorMessage =
      `## Information Isolation Violation\n\n` +
      `Handover contains forbidden content.\n\n` +
      `**TRUST BOUNDARY**: Implementor must NOT see spec files, task lists, sprint structure, or verification criteria.\n\n` +
      `### Violations\n\n` +
      `${allViolations.map((v) => `- ${v}`).join("\n")}\n\n` +
      `### Action Required\n\n` +
      `Extract relevant content into the \`context\` field instead of referencing forbidden files.`;

    throw new Error(errorMessage);
  }
}
