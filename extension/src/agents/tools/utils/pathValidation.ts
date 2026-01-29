/**
 * Path validation utilities for tool file operations
 */

import { promises as fs } from "fs";
import path from "path";

import { createToolError, ToolErrorCode } from "../errors.js";
import type { ToolError } from "../types.js";

export type PathValidationResult =
  | { isValid: true; absolutePath: string }
  | { isValid: false; error: ToolError };

const traversalPattern = /(^|[\\/])\.\.([\\/]|$)/;

function containsTraversal(inputPath: string): boolean {
  return traversalPattern.test(inputPath);
}

const uncPattern = /^\\\\/;
async function resolveRealPathWithFallback(
  targetPath: string,
): Promise<string> {
  let current = targetPath;

  while (true) {
    try {
      const realCurrent = await fs.realpath(current);
      const suffix = path.relative(current, targetPath);
      return suffix ? path.resolve(realCurrent, suffix) : realCurrent;
    } catch (error) {
      const parent = path.dirname(current);
      if (parent === current) {
        throw error;
      }
      current = parent;
    }
  }
}

export async function isWithinWorkspace(
  targetPath: string,
  workspaceRoot: string,
): Promise<boolean> {
  if (process.platform === "win32") {
    const isUncTarget = uncPattern.test(targetPath);
    const isUncRoot = uncPattern.test(workspaceRoot);
    if (isUncTarget && !isUncRoot) {
      return false;
    }
  }
  try {
    const [realTarget, realRoot] = await Promise.all([
      resolveRealPathWithFallback(targetPath),
      fs.realpath(workspaceRoot),
    ]);

    const relative = path.relative(realRoot, realTarget);
    if (!relative || relative === "") {
      return true;
    }

    return !relative.startsWith("..") && !path.isAbsolute(relative);
  } catch {
    return false;
  }
}

export async function validatePath(
  inputPath: string,
  workspaceRoot: string,
): Promise<PathValidationResult> {
  if (!inputPath || inputPath.trim().length === 0) {
    return {
      isValid: false,
      error: createToolError(
        ToolErrorCode.INVALID_INPUT,
        "Path must be a non-empty string",
        "Provide a valid relative path inside the workspace.",
      ),
    };
  }

  if (containsTraversal(inputPath)) {
    return {
      isValid: false,
      error: createToolError(
        ToolErrorCode.PATH_TRAVERSAL,
        "Path traversal is not allowed",
        "Remove any '..' segments from the path.",
        { inputPath },
      ),
    };
  }

  const absolutePath = path.isAbsolute(inputPath)
    ? path.normalize(inputPath)
    : path.resolve(workspaceRoot, inputPath);

  const withinWorkspace = await isWithinWorkspace(absolutePath, workspaceRoot);
  if (!withinWorkspace) {
    return {
      isValid: false,
      error: createToolError(
        ToolErrorCode.PATH_TRAVERSAL,
        "Path must resolve within the workspace",
        "Use a workspace-relative path.",
        { inputPath, workspaceRoot },
      ),
    };
  }

  if (process.platform === "win32") {
    const isUncTarget = uncPattern.test(inputPath);
    const isUncRoot = uncPattern.test(workspaceRoot);
    if (isUncTarget && !isUncRoot) {
      return {
        isValid: false,
        error: createToolError(
          ToolErrorCode.PATH_TRAVERSAL,
          "UNC paths are not permitted outside the workspace",
          "Use a workspace-relative path.",
          { inputPath },
        ),
      };
    }
  }

  return { isValid: true, absolutePath };
}
