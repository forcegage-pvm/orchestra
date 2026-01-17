/**
 * read_spec_file tool handler - CONTROLLER ONLY
 *
 * Reads a specification file for the Controller to compare against handovers/sprint configs.
 * Restricted to spec directories for security (prevents reading arbitrary files).
 *
 * Sprint 004: Controller Agent - T037
 */

import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { resolveWorkspacePath } from "../../db/index.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

/**
 * Input schema for read_spec_file
 */
const ReadSpecFileInputSchema = z.object({
  path: z
    .string()
    .describe(
      "Path to the specification file, relative to workspace root. Must be in spec/, specs/, or docs/ directory."
    ),
  start_line: z
    .number()
    .optional()
    .describe("Optional: Start line to read from (1-indexed)"),
  end_line: z
    .number()
    .optional()
    .describe("Optional: End line to read to (1-indexed, inclusive)"),
});

/**
 * Allowed directories for spec files
 * Controller can only read from these to prevent access to sensitive files
 */
const ALLOWED_SPEC_DIRS = ["spec", "specs", "docs"];

/**
 * Output schema for read_spec_file
 */
interface ReadSpecFileOutput {
  success: boolean;
  path: string;
  content: string;
  line_count: number;
  start_line?: number;
  end_line?: number;
  message?: string;
}

export async function handleReadSpecFile(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(ReadSpecFileInputSchema, input);
  if (!validation.success) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(validation.error, null, 2),
        },
      ],
    };
  }

  try {
    const output = await readSpecFile(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "read_spec_file",
        role: "controller",
        input: validation.data,
      },
      {
        success: true,
        output: { path: output.path, line_count: output.line_count },
      },
      durationMs
    );

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(output, null, 2) },
      ],
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    const err = error instanceof Error ? error : new Error(String(error));

    await logToolExecution(
      {
        toolName: "read_spec_file",
        role: "controller",
        input: validation.data,
      },
      { success: false, errorMessage: err.message },
      durationMs
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: {
                code: "SYSTEM_ERROR",
                message: err.message,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }
}

async function readSpecFile(
  input: z.output<typeof ReadSpecFileInputSchema>
): Promise<ReadSpecFileOutput> {
  // 1. Get workspace root
  const workspacePath = resolveWorkspacePath();
  if (!workspacePath) {
    throw new Error("Workspace path not resolved");
  }

  // 2. Normalize and validate path
  const normalizedPath = input.path.replace(/\\/g, "/");
  const pathParts = normalizedPath.split("/");
  const topDir = pathParts[0]?.toLowerCase();

  if (!topDir || !ALLOWED_SPEC_DIRS.includes(topDir)) {
    throw new Error(
      `Access denied: read_spec_file can only read from ${ALLOWED_SPEC_DIRS.join(
        ", "
      )} directories. ` + `Requested path: ${input.path}`
    );
  }

  // 3. Build full path and check for directory traversal
  const fullPath = path.resolve(workspacePath, normalizedPath);
  const workspaceNormalized = path.resolve(workspacePath);

  if (!fullPath.startsWith(workspaceNormalized)) {
    throw new Error("Access denied: Path traversal detected");
  }

  // 4. Check file exists
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${input.path}`);
  }

  const stats = fs.statSync(fullPath);
  if (stats.isDirectory()) {
    throw new Error(
      `Cannot read directory: ${input.path}. Please specify a file.`
    );
  }

  // 5. Read file content
  const content = fs.readFileSync(fullPath, "utf-8");
  const lines = content.split("\n");

  // 6. Apply line range if specified
  let resultLines = lines;
  let startLine = 1;
  let endLine = lines.length;

  if (input.start_line || input.end_line) {
    startLine = input.start_line ?? 1;
    endLine = input.end_line ?? lines.length;

    // Validate range
    if (startLine < 1) startLine = 1;
    if (endLine > lines.length) endLine = lines.length;
    if (startLine > endLine) {
      throw new Error(
        `Invalid line range: start_line (${startLine}) > end_line (${endLine})`
      );
    }

    resultLines = lines.slice(startLine - 1, endLine);
  }

  // Build result with exactOptionalPropertyTypes compliance
  const result: ReadSpecFileOutput = {
    success: true,
    path: input.path,
    content: resultLines.join("\n"),
    line_count: resultLines.length,
  };

  // Only add line properties if they were specified
  if (input.start_line !== undefined) {
    result.start_line = startLine;
  }
  if (input.end_line !== undefined) {
    result.end_line = endLine;
  }

  return result;
}
