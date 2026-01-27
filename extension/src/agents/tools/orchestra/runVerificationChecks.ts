/**
 * runVerificationChecks tool - Execute verification checks for a task
 */

import { exec } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";
import {
  getCurrentSprint,
  getTaskById,
  getTasksForSprint,
  getVerificationChecks,
} from "../../../database/queries.js";

const execAsync = promisify(exec);

type CheckResult = {
  check_id: string;
  passed: boolean;
  output: string;
  duration_ms: number;
};

type CheckConfig = Record<string, unknown>;

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function isGlobPattern(input: string): boolean {
  return /[*?\[]/.test(input);
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|\\]/g, "\\$&");
  const regex = escaped
    .replace(/\*\*\//g, "(?:.*/)?")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");

  return new RegExp(`^${regex}$`);
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFiles(fullPath);
      files.push(...nested);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

async function resolveFiles(
  workspaceRoot: string,
  patterns: string[],
  baseDir?: string,
): Promise<string[]> {
  const root = baseDir
    ? path.resolve(workspaceRoot, baseDir)
    : workspaceRoot;

  const existingFiles: string[] = [];
  const allFiles = await listFiles(root);
  const allFilesNormalized = allFiles.map((file) => ({
    absolute: file,
    relative: normalizePath(path.relative(root, file)),
  }));

  for (const pattern of patterns) {
    const normalized = normalizePath(pattern);
    if (isGlobPattern(normalized)) {
      const regex = globToRegExp(normalized);
      for (const file of allFilesNormalized) {
        if (regex.test(file.relative)) {
          existingFiles.push(file.absolute);
        }
      }
      continue;
    }

    const absolute = path.isAbsolute(normalized)
      ? normalized
      : path.resolve(root, normalized);

    try {
      const stats = await stat(absolute);
      if (stats.isFile()) {
        existingFiles.push(absolute);
      }
    } catch {
      // Ignore missing files
    }
  }

  return Array.from(new Set(existingFiles));
}

function createMatcher(config: CheckConfig) {
  const pattern =
    (config.pattern as string | undefined) ??
    (config.content_pattern as string | undefined) ??
    (config.contains as string | undefined);
  const isRegex =
    (config.regex as boolean | undefined) ??
    (config.pattern_is_regex as boolean | undefined) ??
    false;
  const flags = (config.regex_flags as string | undefined) ?? "";

  if (!pattern) {
    return null;
  }

  if (isRegex) {
    return new RegExp(pattern, flags);
  }

  return pattern;
}

function countMatches(content: string, matcher: RegExp | string): number {
  if (matcher instanceof RegExp) {
    const flags = matcher.flags.includes("g")
      ? matcher.flags
      : `${matcher.flags}g`;
    const matches = content.match(new RegExp(matcher.source, flags));
    return matches ? matches.length : 0;
  }

  if (!matcher) {
    return 0;
  }

  let count = 0;
  let index = content.indexOf(matcher);
  while (index !== -1) {
    count += 1;
    index = content.indexOf(matcher, index + matcher.length);
  }
  return count;
}

async function runStructuralCheck(
  workspaceRoot: string,
  config: CheckConfig,
): Promise<{ passed: boolean; output: string }> {
  const patterns = (config.paths as string[] | undefined) ??
    (config.path ? [String(config.path)] : []);
  const baseDir = config.base_dir as string | undefined;
  const matcher = createMatcher(config);
  const files = await resolveFiles(workspaceRoot, patterns, baseDir);

  if (files.length === 0) {
    return { passed: false, output: "No files matched." };
  }

  if (!matcher) {
    return { passed: true, output: `Found ${files.length} file(s).` };
  }

  for (const file of files) {
    const content = await readFile(file, "utf-8");
    if (matcher instanceof RegExp && matcher.test(content)) {
      return { passed: true, output: `Pattern matched in ${file}.` };
    }

    if (typeof matcher === "string" && content.includes(matcher)) {
      return { passed: true, output: `Pattern matched in ${file}.` };
    }
  }

  return { passed: false, output: "Pattern not found in matched files." };
}

async function runQualityCheck(
  workspaceRoot: string,
  config: CheckConfig,
): Promise<{ passed: boolean; output: string }> {
  const patterns = (config.paths as string[] | undefined) ??
    (config.path ? [String(config.path)] : []);
  const baseDir = config.base_dir as string | undefined;
  const matcher = createMatcher(config);

  if (!matcher) {
    return { passed: false, output: "No pattern provided." };
  }

  const files = await resolveFiles(workspaceRoot, patterns, baseDir);

  if (files.length === 0) {
    return { passed: false, output: "No files matched." };
  }

  let totalMatches = 0;
  for (const file of files) {
    const content = await readFile(file, "utf-8");
    totalMatches += countMatches(content, matcher);
  }

  const expected = config.expected_count as number | undefined;
  const minCount = config.min_count as number | undefined;
  const maxCount = config.max_count as number | undefined;

  const passed =
    expected !== undefined
      ? totalMatches === expected
      : (minCount === undefined || totalMatches >= minCount) &&
        (maxCount === undefined || totalMatches <= maxCount);

  return {
    passed,
    output: `Matched ${totalMatches} time(s).`,
  };
}

async function runBehavioralCheck(
  workspaceRoot: string,
  config: CheckConfig,
): Promise<{ passed: boolean; output: string }> {
  const command = config.command ? String(config.command) : "";
  if (!command) {
    return { passed: false, output: "No command provided." };
  }

  const expectedExitCode = (config.expected_exit_code as number | undefined) ?? 0;
  const outputContains = (config.output_contains as string | string[] | undefined) ?? [];
  const outputNotContains =
    (config.output_not_contains as string | string[] | undefined) ?? [];

  let exitCode = 0;
  let output = "";

  try {
    const result = await execAsync(command, {
      cwd: workspaceRoot,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
      timeout: (config.timeout_ms as number | undefined) ?? 30_000,
    });
    output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  } catch (error) {
    const execError = error as { code?: number; stdout?: string; stderr?: string };
    exitCode = typeof execError.code === "number" ? execError.code : 1;
    output = `${execError.stdout ?? ""}${execError.stderr ?? ""}`;
  }

  const containsList = Array.isArray(outputContains)
    ? outputContains
    : [outputContains];
  const notContainsList = Array.isArray(outputNotContains)
    ? outputNotContains
    : [outputNotContains];

  const containsOk = containsList.every((item) =>
    item ? output.includes(item) : true,
  );
  const notContainsOk = notContainsList.every((item) =>
    item ? !output.includes(item) : true,
  );

  const passed = exitCode === expectedExitCode && containsOk && notContainsOk;

  return { passed, output };
}

function resolveTaskId(
  workspaceRoot: string,
  taskId: number,
): { id: number; task_id: number } | null {
  const taskById = getTaskById(workspaceRoot, taskId);
  if (taskById) {
    return { id: taskById.id, task_id: taskById.task_id };
  }

  const sprint = getCurrentSprint(workspaceRoot);
  if (!sprint) {
    return null;
  }

  const tasks = getTasksForSprint(workspaceRoot, sprint.id);
  const match = tasks.find((task) => task.task_id === taskId);
  return match ? { id: match.id, task_id: match.task_id } : null;
}

export const runVerificationChecksTool: AgentTool = {
  name: "run_verification_checks",
  description: "Run verification checks for the specified task.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "number", description: "Task ID" },
    },
    required: ["task_id"],
  },
  execute: async (
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> => {
    try {
      const parsed = input as { task_id: number };
      const resolved = resolveTaskId(context.workspaceRoot, parsed.task_id);
      if (!resolved) {
        return {
          success: false,
          output: "",
          error: `Task ${parsed.task_id} not found.`,
        };
      }

      const checks = getVerificationChecks(context.workspaceRoot, resolved.id);
      const results: CheckResult[] = [];

      for (const check of checks) {
        const start = Date.now();
        let result: { passed: boolean; output: string };
        let config: CheckConfig = {};

        try {
          config = JSON.parse(check.check_config || "{}");
        } catch {
          config = {};
        }

        if (check.check_type === "structural") {
          result = await runStructuralCheck(context.workspaceRoot, config);
        } else if (check.check_type === "behavioral") {
          result = await runBehavioralCheck(context.workspaceRoot, config);
        } else if (check.check_type === "quality") {
          result = await runQualityCheck(context.workspaceRoot, config);
        } else {
          result = { passed: false, output: "Unknown check type." };
        }

        const duration = Date.now() - start;
        results.push({
          check_id: check.check_id,
          passed: result.passed,
          output: result.output,
          duration_ms: duration,
        });
      }

      return {
        success: true,
        output: JSON.stringify({
          task_id: resolved.task_id,
          task_internal_id: resolved.id,
          results,
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        output: "",
        error: `Failed to run verification checks: ${message}`,
      };
    }
  },
};
