/**
 * Validate Handover Core Logic
 *
 * runValidateHandover() - Validates handover document completeness (TD-008)
 *
 * Restores full validation from original validate-handover.ps1 (~220 lines):
 * - V1: Has task title
 * - V2: Has objective section
 * - V3: Has deliverables section
 * - V4: Has TDD/testing section
 * - V5: CREATE paths specified
 * - V6: CREATE files don't exist
 * - V7: UPDATE paths specified
 * - V8: UPDATE files exist
 * - V9: No TODO/TBD markers
 * - V10: Has code scaffold
 * - V11: Has test sample data
 * - V12: MUST USE section (integration tasks)
 * - V13: Demo file requirement (visual tasks)
 *
 * ZERO CLI dependencies - pure logic functions.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { requireOrchestraRoot } from "./config.js";
import type {
  ValidateHandoverOptions,
  ValidationCheckResult,
  ValidationReport,
  ValidationSeverity,
} from "./types.js";

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Run handover validation checks.
 * Used by both orchestrator (before handoff) and implementor (before starting work).
 */
export async function runValidateHandover(
  _options: ValidateHandoverOptions = {}
): Promise<ValidationReport> {
  const orchestraRoot = requireOrchestraRoot();
  const repoRoot = path.resolve(orchestraRoot, "..");

  // Load current task handover
  const handoverPath = path.join(orchestraRoot, "handover", "current-task.md");

  if (!fs.existsSync(handoverPath)) {
    throw new Error(
      `Handover not found: ${handoverPath}\n` +
        "Run 'orchestra prepare' first to create the handover."
    );
  }

  const content = fs.readFileSync(handoverPath, "utf-8");

  // Extract task info
  const taskId = extractTaskId(content);
  const taskTitle = extractTaskTitle(content);

  // Extract file operations
  const createFiles = extractFileOperations(content, "CREATE");
  const updateFiles = extractFileOperations(content, "UPDATE");

  // Detect task types
  const isIntegrationTask = /\b(INTEGRATION)\b/i.test(content);
  const isVisualTask = /\b(VISUAL|demo)\b/i.test(content);

  // Run all checks
  const checks: ValidationCheckResult[] = [];

  // =========================================================================
  // SECTION 1: Task Structure (V1-V4)
  // =========================================================================

  // V1: Has task title
  checks.push(checkTaskTitle(content));

  // V2: Has objective section
  checks.push(checkObjectiveSection(content));

  // V3: Has deliverables section
  checks.push(checkDeliverablesSection(content));

  // V4: Has TDD/testing section
  checks.push(checkTddSection(content));

  // =========================================================================
  // SECTION 2: File Paths (V5-V8)
  // =========================================================================

  // V5: CREATE paths specified
  checks.push(checkCreatePathsSpecified(createFiles));

  // V6: CREATE files don't exist (they should be new)
  for (const file of createFiles) {
    checks.push(checkCreateFileNotExists(file, repoRoot));
  }

  // V7: UPDATE paths specified (warning only)
  checks.push(checkUpdatePathsSpecified(updateFiles));

  // V8: UPDATE files exist (they should already exist)
  for (const file of updateFiles) {
    checks.push(checkUpdateFileExists(file, repoRoot));
  }

  // =========================================================================
  // SECTION 3: Completeness (V9-V11)
  // =========================================================================

  // V9: No TODO/TBD markers
  checks.push(checkNoTodoMarkers(content));

  // V10: Has code scaffold (if CREATE files specified)
  if (createFiles.length > 0) {
    checks.push(checkCodeScaffold(content));
  }

  // V11: Has test sample data (if TDD section exists)
  const hasTddSection = /(?:^|\n)##?\s*(?:TDD|Test|Testing)/im.test(content);
  if (hasTddSection) {
    checks.push(checkTestSampleData(content));
  }

  // =========================================================================
  // SECTION 4: Integration Requirements (V12-V13)
  // =========================================================================

  // V12: MUST USE section (for integration tasks)
  if (isIntegrationTask) {
    checks.push(checkMustUseSection(content));
  }

  // V13: Demo file requirement (for visual tasks)
  if (isVisualTask) {
    checks.push(checkDemoRequirement(content));
  }

  // =========================================================================
  // Calculate Summary
  // =========================================================================

  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.filter(
    (c) => !c.passed && c.severity === "BLOCKING"
  ).length;
  const warnings = checks.filter(
    (c) => !c.passed && c.severity === "WARNING"
  ).length;

  let status: "PASSED" | "FAILED" | "WARNINGS" = "PASSED";
  if (failed > 0) {
    status = "FAILED";
  } else if (warnings > 0) {
    status = "WARNINGS";
  }

  return {
    taskId,
    taskTitle,
    timestamp: new Date().toISOString(),
    status,
    checks,
    summary: {
      total: checks.length,
      passed,
      failed,
      warnings,
    },
    createFiles,
    updateFiles,
    isIntegrationTask,
    isVisualTask,
  };
}

// =============================================================================
// Check Functions
// =============================================================================

/**
 * V1: Has task title in expected format (# Task N: Title or ## Task N: Title)
 */
function checkTaskTitle(content: string): ValidationCheckResult {
  const hasTitle = /^#\s*Task\s+\d+:|^##\s*Task\s+\d+:/m.test(content);

  return createCheck(
    "V1",
    "Has task title",
    "structure",
    "BLOCKING",
    hasTitle,
    hasTitle ? undefined : "Missing task title in expected format",
    hasTitle ? undefined : "Expected: # Task N: Title or ## Task N: Title",
    hasTitle ? undefined : "Add task title at the top of the handover"
  );
}

/**
 * V2: Has objective/overview section
 */
function checkObjectiveSection(content: string): ValidationCheckResult {
  const hasObjective =
    /(?:^|\n)##?\s*(?:Objective|Overview|Goal|Purpose)/im.test(content);

  return createCheck(
    "V2",
    "Has objective section",
    "structure",
    "BLOCKING",
    hasObjective,
    hasObjective ? undefined : "Missing objective - unclear what to accomplish",
    hasObjective
      ? undefined
      : "Expected section: ## Objective, ## Overview, or ## Goal",
    hasObjective ? undefined : "Add an objective section explaining the goal"
  );
}

/**
 * V3: Has deliverables section
 */
function checkDeliverablesSection(content: string): ValidationCheckResult {
  const hasDeliverables =
    /(?:^|\n)##?\s*(?:Deliverables|File Operations|Files to Create|Files to Modify|File Changes)/im.test(
      content
    ) ||
    /\|\s*(?:CREATE|UPDATE)\s*\|/i.test(content) ||
    /-\s*(?:CREATE|UPDATE)\s*:/i.test(content);

  return createCheck(
    "V3",
    "Has deliverables section",
    "structure",
    "BLOCKING",
    hasDeliverables,
    hasDeliverables
      ? undefined
      : "No deliverables section - what files to create/modify?",
    hasDeliverables
      ? undefined
      : "Expected: ## Deliverables or file operations table",
    hasDeliverables ? undefined : "Add a deliverables section listing files"
  );
}

/**
 * V4: Has TDD/testing section
 */
function checkTddSection(content: string): ValidationCheckResult {
  const hasTdd =
    /(?:^|\n)##?\s*(?:TDD|Test|Testing|Test Requirements)/im.test(content) ||
    /\btest.*first\b/i.test(content);

  return createCheck(
    "V4",
    "Has TDD/testing section",
    "structure",
    "BLOCKING",
    hasTdd,
    hasTdd ? undefined : "No testing section - what tests to write?",
    hasTdd
      ? undefined
      : "Expected: ## TDD, ## Testing, or ## Test Requirements",
    hasTdd ? undefined : "Add a TDD/testing section with test requirements"
  );
}

/**
 * V5: CREATE paths specified
 */
function checkCreatePathsSpecified(
  createFiles: string[]
): ValidationCheckResult {
  const hasCreate = createFiles.length > 0;

  return createCheck(
    "V5",
    "CREATE paths specified",
    "paths",
    "WARNING",
    hasCreate,
    hasCreate ? undefined : "No CREATE file paths found",
    hasCreate
      ? `Found ${createFiles.length} CREATE file(s)`
      : "May be OK if task only updates existing files",
    hasCreate ? undefined : "Add CREATE file paths if new files are needed"
  );
}

/**
 * V6: CREATE file doesn't already exist
 */
function checkCreateFileNotExists(
  file: string,
  repoRoot: string
): ValidationCheckResult {
  const fullPath = path.isAbsolute(file) ? file : path.join(repoRoot, file);
  const exists = fs.existsSync(fullPath);

  return createCheck(
    "V6",
    `CREATE file doesn't exist: ${file}`,
    "paths",
    "BLOCKING",
    !exists,
    exists ? "File already exists - should this be UPDATE instead?" : undefined,
    exists ? `File exists: ${fullPath}` : undefined,
    exists ? "Change to UPDATE or verify the path is correct" : undefined,
    file
  );
}

/**
 * V7: UPDATE paths specified
 */
function checkUpdatePathsSpecified(
  updateFiles: string[]
): ValidationCheckResult {
  const hasUpdate = updateFiles.length > 0;

  return createCheck(
    "V7",
    "UPDATE paths specified",
    "paths",
    "INFO",
    true, // Always passes - just informational
    undefined,
    hasUpdate
      ? `Found ${updateFiles.length} UPDATE file(s)`
      : "No UPDATE paths (may be OK for new feature tasks)"
  );
}

/**
 * V8: UPDATE file exists
 */
function checkUpdateFileExists(
  file: string,
  repoRoot: string
): ValidationCheckResult {
  const fullPath = path.isAbsolute(file) ? file : path.join(repoRoot, file);
  const exists = fs.existsSync(fullPath);

  return createCheck(
    "V8",
    `UPDATE file exists: ${file}`,
    "paths",
    "BLOCKING",
    exists,
    exists ? undefined : "File doesn't exist - should this be CREATE instead?",
    exists ? undefined : `File not found: ${fullPath}`,
    exists ? undefined : "Change to CREATE or verify the path is correct",
    file
  );
}

/**
 * V9: No TODO/TBD markers
 */
function checkNoTodoMarkers(content: string): ValidationCheckResult {
  const todoPattern = /\[TODO\]|\[TBD\]|\[PLACEHOLDER\]|XXX|FIXME/gi;
  const matches = content.match(todoPattern);
  const hasTodos = matches !== null && matches.length > 0;

  return createCheck(
    "V9",
    "No TODO/TBD markers",
    "completeness",
    "BLOCKING",
    !hasTodos,
    hasTodos
      ? "Found incomplete markers - task instructions not finished"
      : undefined,
    hasTodos ? `Found: ${matches?.join(", ")}` : undefined,
    hasTodos ? "Complete all TODO/TBD sections before handoff" : undefined
  );
}

/**
 * V10: Has code scaffold
 */
function checkCodeScaffold(content: string): ValidationCheckResult {
  const hasScaffold =
    /```(?:dart|typescript|python|powershell|javascript|ts|js)/i.test(
      content
    ) || /(?:^|\n)##?\s*Code\s*Scaffold/im.test(content);

  return createCheck(
    "V10",
    "Has code scaffold",
    "completeness",
    "WARNING",
    hasScaffold,
    hasScaffold ? undefined : "No code scaffold provided for new files",
    hasScaffold
      ? undefined
      : "Expected: code blocks with implementation scaffold",
    hasScaffold ? undefined : "Add code scaffolds showing expected structure"
  );
}

/**
 * V11: Has test sample data
 */
function checkTestSampleData(content: string): ValidationCheckResult {
  const hasTestData =
    /test.*data|sample.*object|mock|stub|fixture|test\s*case/i.test(content) ||
    /```(?:dart|typescript|javascript)[\s\S]*?(?:test\(|describe\(|it\(|expect\()/i.test(
      content
    );

  return createCheck(
    "V11",
    "Has test sample data",
    "completeness",
    "WARNING",
    hasTestData,
    hasTestData ? undefined : "Test sample data not obvious",
    hasTestData
      ? undefined
      : "Expected: concrete test examples, not just test names",
    hasTestData ? undefined : "Add specific test data or example test cases"
  );
}

/**
 * V12: MUST USE section (for integration tasks)
 */
function checkMustUseSection(content: string): ValidationCheckResult {
  const hasMustUse =
    /(?:^|\n)##?\s*MUST\s*USE/im.test(content) || /must[\s-]use/i.test(content);

  return createCheck(
    "V12",
    "Has MUST USE section (integration task)",
    "integration",
    "WARNING",
    hasMustUse,
    hasMustUse
      ? undefined
      : "Integration tasks should specify what existing code to use",
    hasMustUse
      ? undefined
      : "Expected: ## MUST USE section with specific imports/methods",
    hasMustUse
      ? undefined
      : "Add MUST USE section listing required imports and APIs"
  );
}

/**
 * V13: Demo file requirement (for visual tasks)
 */
function checkDemoRequirement(content: string): ValidationCheckResult {
  const hasDemo =
    /demo|example.*lib.*demo|visual.*verification|screenshot/i.test(content);

  return createCheck(
    "V13",
    "Has demo file requirement (visual task)",
    "integration",
    "WARNING",
    hasDemo,
    hasDemo ? undefined : "Visual tasks should specify demo file to create",
    hasDemo
      ? undefined
      : "Expected: demo file path or visual verification steps",
    hasDemo ? undefined : "Add demo scaffold or visual verification steps"
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a validation check result
 */
function createCheck(
  id: string,
  name: string,
  category: string,
  severity: ValidationSeverity,
  passed: boolean,
  message?: string,
  details?: string,
  fix?: string,
  file?: string
): ValidationCheckResult {
  return {
    id,
    name,
    category,
    severity,
    passed,
    message,
    details,
    fix,
    file,
  };
}

/**
 * Extract task ID from handover content
 */
function extractTaskId(content: string): number | null {
  const match = content.match(/Task\s+(\d+):/i);
  return match && match[1] ? parseInt(match[1], 10) : null;
}

/**
 * Extract task title from handover content
 */
function extractTaskTitle(content: string): string | null {
  const match = content.match(/^#\s*Task\s+\d+:\s*(.+)$/m);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Extract file paths from handover (CREATE or UPDATE)
 * Supports both table format and list format.
 */
export function extractFileOperations(
  content: string,
  operation: "CREATE" | "UPDATE"
): string[] {
  const files: string[] = [];

  // Table format: | CREATE | `path` | or | CREATE | path |
  const tablePattern = new RegExp(
    `^\\|\\s*${operation}\\s*\\|\\s*\`?([^|\`\\n]+)\`?\\s*\\|`,
    "gim"
  );
  let match;
  while ((match = tablePattern.exec(content)) !== null) {
    const file = match[1]?.trim();
    if (file && !files.includes(file)) {
      files.push(file);
    }
  }

  // List format: - CREATE: `path` or - CREATE: path
  const listPattern = new RegExp(
    `^-\\s*${operation}[:\\s]+\`?([^\\n\`]+)\`?`,
    "gim"
  );
  while ((match = listPattern.exec(content)) !== null) {
    const file = match[1]?.trim();
    if (file && !files.includes(file)) {
      files.push(file);
    }
  }

  return files;
}
