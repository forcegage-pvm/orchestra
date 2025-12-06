/**
 * Pre-Signal Check Core Logic
 *
 * runPreSignalCheck() - Implementor validates deliverables before signaling (TD-010)
 *
 * Restores full validation from original pre-signal-check.ps1 (~411 lines):
 * - P1: CREATE files exist
 * - P2: CREATE files have content
 * - P3: UPDATE files modified (git)
 * - P4: Test files exist
 * - P5: Tests pass
 * - P6: Build succeeds
 * - P7: Lint passes
 * - P8: No analyzer issues in touched files
 * - P9: No TODO/FIXME in new files
 * - P10: Demo file exists (visual tasks)
 * - P11: Demo has content (visual tasks)
 * - P12: Git has changes
 *
 * ZERO CLI dependencies - pure logic functions.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { requireOrchestraRoot } from "./config.js";
import { loadManifest } from "./manifest.js";
import { loadProgress } from "./progress.js";
import { writeYaml } from "./yaml.js";
import type {
  PreSignalCheckOptions,
  PreSignalCheckResult,
  PreSignalReport,
  PreSignalArtifact,
} from "./types.js";

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Run pre-signal checks before implementor signals completion.
 * Creates artifact at .orchestra/handover/verification/pre-signal.yaml
 */
export async function runPreSignalCheck(
  options: PreSignalCheckOptions
): Promise<PreSignalReport> {
  const orchestraRoot = requireOrchestraRoot();
  const repoRoot = path.resolve(orchestraRoot, "..");

  // Determine task ID
  const taskId = await determineCurrentTask(options.task, orchestraRoot);

  // Force mode: skip all checks
  if (options.force) {
    const report = createForceReport(taskId);
    const artifactPath = await writeArtifact(orchestraRoot, report);
    report.artifactPath = artifactPath;
    return report;
  }

  // Load current task handover
  const handoverPath = path.join(
    orchestraRoot,
    ".orchestra",
    "handover",
    "current-task.md"
  );

  if (!fs.existsSync(handoverPath)) {
    throw new Error(`Handover not found: ${handoverPath}`);
  }

  const handoverContent = fs.readFileSync(handoverPath, "utf-8");

  // Extract file requirements from handover
  const createFiles = extractFileOperations(handoverContent, "CREATE");
  const updateFiles = extractFileOperations(handoverContent, "UPDATE");

  // Determine if this is a visual task
  const isVisualTask = /\b(VISUAL|INTEGRATION|demo)\b/i.test(handoverContent);

  // Run all checks
  const checks: PreSignalCheckResult[] = [];

  // P1: CREATE files exist
  for (const file of createFiles) {
    checks.push(checkFileExists(file, repoRoot, "P1"));
  }

  // P2: CREATE files have content (min 50 bytes)
  for (const file of createFiles) {
    checks.push(checkFileHasContent(file, repoRoot, "P2"));
  }

  // P3: UPDATE files modified (git)
  for (const file of updateFiles) {
    checks.push(checkFileModified(file, repoRoot, "P3"));
  }

  // P4: Test files exist
  const testFiles = extractTestFiles(handoverContent, createFiles, repoRoot);
  for (const file of testFiles) {
    checks.push(checkTestFileExists(file, repoRoot, "P4"));
  }

  // P5: Tests pass
  if (!options.skipTests) {
    checks.push(await runTestsCheck(repoRoot, "P5"));
  }

  // P6: Build succeeds
  if (!options.skipBuild) {
    checks.push(await runBuildCheck(repoRoot, "P6"));
  }

  // P7: Lint passes
  checks.push(await runLintCheck(repoRoot, "P7"));

  // P8: No analyzer issues in touched files ("You Touch It, You Own It")
  const touchedFiles = [...createFiles, ...updateFiles].filter((f) =>
    fs.existsSync(path.join(repoRoot, f))
  );
  checks.push(await runAnalyzerOnTouchedFiles(touchedFiles, repoRoot, "P8"));

  // P9: No TODO/FIXME in new files
  for (const file of createFiles) {
    checks.push(checkNoTodoComments(file, repoRoot, "P9"));
  }

  // P10, P11: Visual/Demo checks
  if (isVisualTask) {
    checks.push(checkDemoFileExists(taskId, repoRoot, "P10"));
    checks.push(checkDemoHasContent(taskId, repoRoot, "P11"));
  }

  // P12: Git has changes
  checks.push(checkGitHasChanges(repoRoot, "P12"));

  // Calculate summary
  const summary = calculateSummary(checks);
  const status = summary.failed > 0 ? "FAILED" : "PASSED";

  const report: PreSignalReport = {
    taskId,
    timestamp: new Date().toISOString(),
    status,
    checks,
    summary,
  };

  // Write artifact
  const artifactPath = await writeArtifact(orchestraRoot, report);
  report.artifactPath = artifactPath;

  return report;
}

// =============================================================================
// Task Determination
// =============================================================================

async function determineCurrentTask(
  explicitTaskId: string | undefined,
  orchestraRoot: string
): Promise<number> {
  if (explicitTaskId) {
    return parseInt(explicitTaskId, 10);
  }

  // Load manifest to get sprint ID
  const manifestResult = loadManifest();
  if (!manifestResult.success || !manifestResult.data) {
    throw new Error("Failed to load manifest");
  }

  const sprintId = manifestResult.data.sprint.id;
  const progress = loadProgress(sprintId, orchestraRoot);

  // Find the task currently in IMPLEMENT status
  const manifest = manifestResult.data;
  const tasks = manifest.tasks ?? [];
  const implementTask = tasks.find((t) => t.status === "IMPLEMENT");

  if (implementTask && implementTask.task_id !== undefined) {
    return implementTask.task_id;
  }

  // Fallback to latest entry in progress log
  if (progress.entries && progress.entries.length > 0) {
    const lastEntry = progress.entries[progress.entries.length - 1];
    if (lastEntry && lastEntry.task_id !== undefined) {
      return lastEntry.task_id;
    }
  }

  throw new Error("No task currently in IMPLEMENT status");
}

// =============================================================================
// File Extraction from Handover
// =============================================================================

/**
 * Extract file paths from handover content.
 * Supports both table format (| CREATE | `path` |) and list format (- CREATE: `path`)
 */
function extractFileOperations(
  content: string,
  operation: "CREATE" | "UPDATE" | "DELETE"
): string[] {
  const paths: string[] = [];

  // Table format: | CREATE | `path` | or | CREATE | path |
  const tableRegex = new RegExp(
    `^\\|\\s*${operation}\\s*\\|\\s*\`?([^|\`\\n]+)\`?\\s*\\|`,
    "gim"
  );
  let match;
  while ((match = tableRegex.exec(content)) !== null) {
    const captured = match[1];
    if (captured) {
      const filePath = captured.trim().replace(/^`|`$/g, "");
      if (filePath && !paths.includes(filePath)) {
        paths.push(filePath);
      }
    }
  }

  // List format: - CREATE: `path` or - CREATE path
  const listRegex = new RegExp(
    `^-\\s*${operation}[:\\s]+\`?([^\\n\`]+)\`?`,
    "gim"
  );
  while ((match = listRegex.exec(content)) !== null) {
    const captured = match[1];
    if (captured) {
      const filePath = captured.trim().replace(/^`|`$/g, "");
      if (filePath && !paths.includes(filePath)) {
        paths.push(filePath);
      }
    }
  }

  // Also check for **CREATE** `path` format (bold operation)
  const boldRegex = new RegExp(
    `\\*\\*${operation}\\*\\*\\s*\`([^\`]+)\``,
    "gi"
  );
  while ((match = boldRegex.exec(content)) !== null) {
    const captured = match[1];
    if (!captured) continue;
    const filePath = captured.trim();
    if (filePath && !paths.includes(filePath)) {
      paths.push(filePath);
    }
  }

  return paths;
}

/**
 * Extract test file paths from handover content.
 * Also infers test paths from implementation file paths.
 */
function extractTestFiles(
  content: string,
  createFiles: string[],
  _repoRoot: string
): string[] {
  const testPaths: string[] = [];

  // Explicit test file references
  const testRegex = /test\/[^\s`\)]+\.(test|spec)\.(ts|js|dart)/gi;
  let match;
  while ((match = testRegex.exec(content)) !== null) {
    const testPath = match[0];
    if (!testPaths.includes(testPath)) {
      testPaths.push(testPath);
    }
  }

  // Infer test paths from implementation files
  for (const implPath of createFiles) {
    // TypeScript/JavaScript: src/foo/bar.ts → test/foo/bar.test.ts
    if (implPath.match(/^src\/.*\.(ts|js)$/)) {
      const inferredPath = implPath
        .replace(/^src\//, "test/")
        .replace(/\.(ts|js)$/, ".test.$1");
      if (!testPaths.includes(inferredPath)) {
        testPaths.push(inferredPath);
      }
    }
  }

  return testPaths;
}

// =============================================================================
// Individual Check Functions
// =============================================================================

/**
 * P1: Check that CREATE file exists
 */
function checkFileExists(
  filePath: string,
  repoRoot: string,
  checkId: string
): PreSignalCheckResult {
  const fullPath = path.join(repoRoot, filePath);
  const exists = fs.existsSync(fullPath);

  return {
    id: checkId,
    name: `File exists: ${filePath}`,
    category: "deliverables",
    severity: "BLOCKING",
    passed: exists,
    message: exists ? "File created" : "File not found",
    fix: exists ? undefined : `Create the file: ${filePath}`,
    file: filePath,
  };
}

/**
 * P2: Check that CREATE file has meaningful content (min 50 bytes)
 */
function checkFileHasContent(
  filePath: string,
  repoRoot: string,
  checkId: string
): PreSignalCheckResult {
  const fullPath = path.join(repoRoot, filePath);

  if (!fs.existsSync(fullPath)) {
    return {
      id: checkId,
      name: `Has content: ${filePath}`,
      category: "deliverables",
      severity: "BLOCKING",
      passed: false,
      message: "File does not exist",
      file: filePath,
    };
  }

  const stats = fs.statSync(fullPath);
  const hasContent = stats.size >= 50;

  return {
    id: checkId,
    name: `Has content: ${filePath}`,
    category: "deliverables",
    severity: "BLOCKING",
    passed: hasContent,
    message: hasContent
      ? `${stats.size} bytes`
      : `File too small (${stats.size} bytes, minimum 50)`,
    fix: hasContent ? undefined : "Implement the file content",
    file: filePath,
  };
}

/**
 * P3: Check that UPDATE file was modified (git diff)
 */
function checkFileModified(
  filePath: string,
  repoRoot: string,
  checkId: string
): PreSignalCheckResult {
  try {
    // Check if file has uncommitted changes (staged or unstaged)
    const diffOutput = execSync(`git diff --name-only HEAD -- "${filePath}"`, {
      cwd: repoRoot,
      encoding: "utf-8",
    }).trim();

    const stagedOutput = execSync(
      `git diff --staged --name-only -- "${filePath}"`,
      {
        cwd: repoRoot,
        encoding: "utf-8",
      }
    ).trim();

    const isModified = diffOutput.length > 0 || stagedOutput.length > 0;

    return {
      id: checkId,
      name: `Modified: ${filePath}`,
      category: "deliverables",
      severity: "BLOCKING",
      passed: isModified,
      message: isModified ? "File has changes" : "No changes detected",
      fix: isModified ? undefined : "Apply the required changes to this file",
      file: filePath,
    };
  } catch {
    return {
      id: checkId,
      name: `Modified: ${filePath}`,
      category: "deliverables",
      severity: "BLOCKING",
      passed: false,
      message: "Could not check git status",
      fix: "Ensure you are in a git repository",
      file: filePath,
    };
  }
}

/**
 * P4: Check that test file exists
 */
function checkTestFileExists(
  filePath: string,
  repoRoot: string,
  checkId: string
): PreSignalCheckResult {
  const fullPath = path.join(repoRoot, filePath);
  const exists = fs.existsSync(fullPath);

  return {
    id: checkId,
    name: `Test exists: ${filePath}`,
    category: "testing",
    severity: "BLOCKING",
    passed: exists,
    message: exists ? "Test file found" : "Test file not found",
    fix: exists ? undefined : `Create test file: ${filePath}`,
    file: filePath,
  };
}

/**
 * P5: Run tests
 */
async function runTestsCheck(
  repoRoot: string,
  checkId: string
): Promise<PreSignalCheckResult> {
  try {
    execSync("npm test", {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: "pipe",
    });

    return {
      id: checkId,
      name: "Tests pass",
      category: "testing",
      severity: "BLOCKING",
      passed: true,
      message: "All tests passed",
    };
  } catch (error) {
    const output =
      error instanceof Error && "stdout" in error
        ? String((error as NodeJS.ErrnoException & { stdout?: string }).stdout)
        : "";

    return {
      id: checkId,
      name: "Tests pass",
      category: "testing",
      severity: "BLOCKING",
      passed: false,
      message: "Tests failed",
      details: output.slice(0, 500),
      fix: "Run: npm test - and fix failing tests",
    };
  }
}

/**
 * P6: Run build
 */
async function runBuildCheck(
  repoRoot: string,
  checkId: string
): Promise<PreSignalCheckResult> {
  try {
    execSync("npm run build", {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: "pipe",
    });

    return {
      id: checkId,
      name: "Build succeeds",
      category: "quality",
      severity: "BLOCKING",
      passed: true,
      message: "Build completed successfully",
    };
  } catch (error) {
    const output =
      error instanceof Error && "stderr" in error
        ? String((error as NodeJS.ErrnoException & { stderr?: string }).stderr)
        : "";

    return {
      id: checkId,
      name: "Build succeeds",
      category: "quality",
      severity: "BLOCKING",
      passed: false,
      message: "Build failed",
      details: output.slice(0, 500),
      fix: "Run: npm run build - and fix errors",
    };
  }
}

/**
 * P7: Run lint
 */
async function runLintCheck(
  repoRoot: string,
  checkId: string
): Promise<PreSignalCheckResult> {
  try {
    execSync("npm run lint", {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: "pipe",
    });

    return {
      id: checkId,
      name: "Lint passes",
      category: "quality",
      severity: "BLOCKING",
      passed: true,
      message: "No lint errors",
    };
  } catch (error) {
    const output =
      error instanceof Error && "stdout" in error
        ? String((error as NodeJS.ErrnoException & { stdout?: string }).stdout)
        : "";

    return {
      id: checkId,
      name: "Lint passes",
      category: "quality",
      severity: "BLOCKING",
      passed: false,
      message: "Lint errors found",
      details: output.slice(0, 500),
      fix: "Run: npm run lint -- --fix",
    };
  }
}

/**
 * P8: Run analyzer on touched files only ("You Touch It, You Own It")
 */
async function runAnalyzerOnTouchedFiles(
  files: string[],
  repoRoot: string,
  checkId: string
): Promise<PreSignalCheckResult> {
  if (files.length === 0) {
    return {
      id: checkId,
      name: "Analyzer on touched files",
      category: "quality",
      severity: "BLOCKING",
      passed: true,
      message: "No files to analyze",
    };
  }

  // Run typecheck on the whole project (TypeScript doesn't support single-file check easily)
  try {
    execSync("npm run typecheck", {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: "pipe",
    });

    return {
      id: checkId,
      name: "Analyzer on touched files",
      category: "quality",
      severity: "BLOCKING",
      passed: true,
      message: `No issues in ${files.length} touched file(s)`,
      details: files.join(", "),
    };
  } catch (error) {
    const output =
      error instanceof Error && "stdout" in error
        ? String((error as NodeJS.ErrnoException & { stdout?: string }).stdout)
        : "";

    return {
      id: checkId,
      name: "Analyzer on touched files",
      category: "quality",
      severity: "BLOCKING",
      passed: false,
      message: "TypeScript errors in touched files - YOU MUST FIX ALL OF THEM",
      details: output.slice(0, 500),
      fix: "Run: npm run typecheck - and fix EVERY issue",
    };
  }
}

/**
 * P9: Check for TODO/FIXME comments in new files
 */
function checkNoTodoComments(
  filePath: string,
  repoRoot: string,
  checkId: string
): PreSignalCheckResult {
  const fullPath = path.join(repoRoot, filePath);

  if (!fs.existsSync(fullPath)) {
    return {
      id: checkId,
      name: `No TODOs: ${filePath}`,
      category: "quality",
      severity: "WARNING",
      passed: true,
      message: "File does not exist (skipped)",
      file: filePath,
    };
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  const hasTodos = /\/\/\s*(TODO|FIXME|XXX|HACK)/i.test(content);

  return {
    id: checkId,
    name: `No TODOs: ${filePath}`,
    category: "quality",
    severity: "WARNING",
    passed: !hasTodos,
    message: hasTodos ? "Found TODO/FIXME comments" : "No TODO comments",
    fix: hasTodos ? "Complete or remove TODO comments before submission" : undefined,
    file: filePath,
  };
}

/**
 * P10: Check demo file exists (for visual tasks)
 */
function checkDemoFileExists(
  taskId: number,
  repoRoot: string,
  checkId: string
): PreSignalCheckResult {
  // Look for common demo file patterns
  const patterns = [
    `example/lib/demos/task_${String(taskId).padStart(3, "0")}*.ts`,
    `examples/task-${taskId}*.ts`,
    `demo/task-${taskId}*.ts`,
  ];

  // Simple check: look for any file matching task ID in common demo locations
  const demoLocations = ["example", "examples", "demo", "demos"];
  let foundDemo: string | null = null;

  for (const loc of demoLocations) {
    const demoDir = path.join(repoRoot, loc);
    if (fs.existsSync(demoDir)) {
      const files = fs.readdirSync(demoDir, { recursive: true }) as string[];
      const taskPattern = new RegExp(`task[_-]?0*${taskId}`, "i");
      const demoFile = files.find((f) => taskPattern.test(f));
      if (demoFile) {
        foundDemo = path.join(loc, demoFile);
        break;
      }
    }
  }

  return {
    id: checkId,
    name: "Demo file exists",
    category: "visual",
    severity: "WARNING",
    passed: foundDemo !== null,
    message: foundDemo ? `Found: ${foundDemo}` : "No demo file found",
    details: `Searched patterns: ${patterns.join(", ")}`,
    fix: foundDemo ? undefined : `Create demo file for task ${taskId}`,
  };
}

/**
 * P11: Check demo has meaningful content
 */
function checkDemoHasContent(
  taskId: number,
  repoRoot: string,
  checkId: string
): PreSignalCheckResult {
  // Look for demo file
  const demoLocations = ["example", "examples", "demo", "demos"];
  let demoContent: string | null = null;
  let demoPath: string | null = null;

  for (const loc of demoLocations) {
    const demoDir = path.join(repoRoot, loc);
    if (fs.existsSync(demoDir)) {
      const files = fs.readdirSync(demoDir, { recursive: true }) as string[];
      const taskPattern = new RegExp(`task[_-]?0*${taskId}`, "i");
      const demoFile = files.find((f) => taskPattern.test(f));
      if (demoFile) {
        demoPath = path.join(demoDir, demoFile);
        demoContent = fs.readFileSync(demoPath, "utf-8");
        break;
      }
    }
  }

  if (!demoContent) {
    return {
      id: checkId,
      name: "Demo has content",
      category: "visual",
      severity: "WARNING",
      passed: false,
      message: "No demo file found to check",
    };
  }

  // Check for meaningful content (exports, functions, classes)
  const hasMeaningfulContent =
    /export|function|class|const\s+\w+\s*=/.test(demoContent) &&
    demoContent.length > 100;

  return {
    id: checkId,
    name: "Demo has content",
    category: "visual",
    severity: "WARNING",
    passed: hasMeaningfulContent,
    message: hasMeaningfulContent
      ? "Demo has meaningful content"
      : "Demo appears empty or minimal",
    fix: hasMeaningfulContent ? undefined : "Add runnable demo content",
    file: demoPath || undefined,
  };
}

/**
 * P12: Check git has changes
 */
function checkGitHasChanges(
  repoRoot: string,
  checkId: string
): PreSignalCheckResult {
  try {
    const stagedOutput = execSync("git diff --staged --name-only", {
      cwd: repoRoot,
      encoding: "utf-8",
    }).trim();

    const unstagedOutput = execSync("git diff --name-only", {
      cwd: repoRoot,
      encoding: "utf-8",
    }).trim();

    const hasChanges = stagedOutput.length > 0 || unstagedOutput.length > 0;
    const stagedCount = stagedOutput ? stagedOutput.split("\n").length : 0;
    const unstagedCount = unstagedOutput ? unstagedOutput.split("\n").length : 0;

    return {
      id: checkId,
      name: "Git has changes",
      category: "git",
      severity: "WARNING",
      passed: hasChanges,
      message: hasChanges
        ? `${stagedCount} staged, ${unstagedCount} unstaged`
        : "No changes detected",
      fix: hasChanges ? undefined : "Verify you made the required changes",
    };
  } catch {
    return {
      id: checkId,
      name: "Git has changes",
      category: "git",
      severity: "WARNING",
      passed: false,
      message: "Could not check git status",
      fix: "Ensure you are in a git repository",
    };
  }
}

// =============================================================================
// Summary and Artifact
// =============================================================================

function calculateSummary(checks: PreSignalCheckResult[]): {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
} {
  const blockingChecks = checks.filter((c) => c.severity === "BLOCKING");
  const warningChecks = checks.filter((c) => c.severity === "WARNING");

  return {
    total: checks.length,
    passed: blockingChecks.filter((c) => c.passed).length,
    failed: blockingChecks.filter((c) => !c.passed).length,
    warnings: warningChecks.filter((c) => !c.passed).length,
  };
}

function createForceReport(taskId: number): PreSignalReport {
  return {
    taskId,
    timestamp: new Date().toISOString(),
    status: "PASSED",
    checks: [],
    summary: { total: 0, passed: 0, failed: 0, warnings: 0 },
  };
}

async function writeArtifact(
  orchestraRoot: string,
  report: PreSignalReport
): Promise<string> {
  // Ensure directory exists
  const artifactDir = path.join(
    orchestraRoot,
    ".orchestra",
    "handover",
    "verification"
  );
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  // Create artifact
  const artifact: PreSignalArtifact = {
    task_id: report.taskId,
    timestamp: report.timestamp,
    status: report.status,
    checks: groupChecksByCategory(report.checks),
    summary: report.summary,
  };

  const artifactPath = path.join(artifactDir, "pre-signal.yaml");
  writeYaml(artifactPath, artifact);

  // Also write to audit trail
  const auditDir = path.join(
    orchestraRoot,
    ".orchestra",
    "implementor",
    "artifacts",
    "pre-signal"
  );
  if (!fs.existsSync(auditDir)) {
    fs.mkdirSync(auditDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const auditPath = path.join(
    auditDir,
    `task-${report.taskId}-${timestamp}.yaml`
  );
  writeYaml(auditPath, artifact);

  report.artifact = artifact;

  return artifactPath;
}

function groupChecksByCategory(
  checks: PreSignalCheckResult[]
): Record<string, { status: "PASSED" | "FAILED" | "SKIPPED"; count?: number; details?: string }> {
  const categories = ["deliverables", "testing", "quality", "visual", "git"];
  const result: Record<string, { status: "PASSED" | "FAILED" | "SKIPPED"; count?: number; details?: string }> = {};

  for (const category of categories) {
    const categoryChecks = checks.filter((c) => c.category === category);
    if (categoryChecks.length === 0) {
      result[category] = { status: "SKIPPED" };
    } else {
      const allPassed = categoryChecks.every((c) => c.passed || c.severity !== "BLOCKING");
      result[category] = {
        status: allPassed ? "PASSED" : "FAILED",
        count: categoryChecks.length,
      };
    }
  }

  return result;
}
