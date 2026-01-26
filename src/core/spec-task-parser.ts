/**
 * Spec task parser
 *
 * Parses spec files to resolve speckit task references into full definitions.
 */

import { readFile } from "fs/promises";
import path from "path";
import { resolveWorkspacePath } from "../db/index.js";

export interface SpecTaskDefinition {
  id: string;
  title: string;
  type: "test" | "implementation";
  acceptance_criteria: string[];
}

const headerTaskRegex = /^###\s+(T\d+)\s*[—-]\s*(.+)$/;
const checklistTaskRegex = /^\s*-\s*\[\s*[xX ]?\s*\]\s*(T\d+)\s+(.+)$/;
const colonTaskRegex = /^\s*(T\d+)\s*:\s*(.+)$/;
const simpleListTaskRegex = /^\s*-\s*(T\d+)\s+(.+)$/;
const tableTaskRegex = /^\s*\|\s*(T\d+)\s*\|\s*(.+?)\s*\|/;
const acceptanceHeaderRegex = /^#{3,6}\s*Acceptance\b/i;
const headingRegex = /^#{1,6}\s+/;
const checklistItemRegex = /^\s*-\s*\[\s*[xX ]?\s*\]\s*(.+?)\s*$/;

export async function parseSpecTaskDefinitions(
  specPath: string,
  taskIds: string[],
  additionalFiles: string[] = [],
): Promise<SpecTaskDefinition[]> {
  if (taskIds.length === 0) {
    return [];
  }

  const workspacePath = resolveWorkspacePath();
  if (!workspacePath) {
    throw new Error("Workspace path not resolved");
  }

  // Collect all files to search: primary spec + additional files
  const filesToSearch = [specPath, ...additionalFiles];
  const definitions = new Map<string, SpecTaskDefinition>();

  for (const filePath of filesToSearch) {
    const fullPath = path.resolve(workspacePath, filePath);

    let content: string;
    try {
      content = await readFile(fullPath, "utf-8");
    } catch (error) {
      // Skip files that don't exist (additionalFiles may not exist)
      if (filePath === specPath) {
        const message =
          error instanceof Error ? error.message : "Unable to read spec file";
        throw new Error(`Spec file not found: ${specPath}. ${message}`);
      }
      continue;
    }

    // Normalize line endings (handle Windows \r\n)
    const lines = content.replace(/\r\n/g, "\n").split("\n");
    parseFileForTasks(lines, definitions);
  }

  const missing: string[] = [];
  const result: SpecTaskDefinition[] = [];

  for (const taskId of taskIds) {
    const key = taskId.trim().toUpperCase();
    const definition = definitions.get(key);
    if (!definition) {
      missing.push(taskId.trim());
      continue;
    }
    result.push(definition);
  }

  if (missing.length > 0) {
    const searchedFiles = filesToSearch.join(", ");
    throw new Error(
      `Spec task ID(s) not found in [${searchedFiles}]: ${missing.join(", ")}`,
    );
  }

  return result;
}

/**
 * Parse a single file's lines for task definitions
 */
function parseFileForTasks(
  lines: string[],
  definitions: Map<string, SpecTaskDefinition>,
): void {
  // Pass 1: Header format blocks
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(headerTaskRegex);
    if (!match) {
      continue;
    }

    const rawId = match[1]?.trim();
    const rawTitle = match[2]?.trim();

    if (!rawId || !rawTitle) {
      continue;
    }

    const id = rawId;
    const title = rawTitle;

    const endIndex = findNextHeaderIndex(lines, index + 1);
    const acceptance = extractAcceptanceCriteria(lines, index + 1, endIndex);

    definitions.set(id.toUpperCase(), {
      id,
      title,
      type: inferTaskType(title),
      acceptance_criteria: acceptance,
    });

    if (endIndex > index) {
      index = endIndex - 1;
    }
  }

  // Pass 2: Checklist format
  for (const line of lines) {
    const match = line.match(checklistTaskRegex);
    if (!match) {
      continue;
    }

    const rawId = match[1]?.trim();
    const rawTitle = match[2]?.trim();

    if (!rawId || !rawTitle) {
      continue;
    }

    const id = rawId;
    if (definitions.has(id.toUpperCase())) {
      continue;
    }

    const title = rawTitle;
    definitions.set(id.toUpperCase(), {
      id,
      title,
      type: inferTaskType(title),
      acceptance_criteria: [],
    });
  }

  // Pass 3: Colon, simple list, and table formats
  for (const line of lines) {
    let match = line.match(colonTaskRegex);

    if (!match && !/^\s*-\s*\[/.test(line)) {
      match = line.match(simpleListTaskRegex);
    }

    if (!match) {
      match = line.match(tableTaskRegex);
    }

    if (!match) {
      continue;
    }

    const rawId = match[1]?.trim();
    const rawTitle = match[2]?.trim();

    if (!rawId || !rawTitle) {
      continue;
    }

    const id = rawId;
    if (definitions.has(id.toUpperCase())) {
      continue;
    }

    const title = rawTitle;
    definitions.set(id.toUpperCase(), {
      id,
      title,
      type: inferTaskType(title),
      acceptance_criteria: [],
    });
  }
}

function inferTaskType(title: string): "test" | "implementation" {
  return /test/i.test(title) ? "test" : "implementation";
}

function findNextHeaderIndex(lines: string[], startIndex: number): number {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (headerTaskRegex.test(lines[index] ?? "")) {
      return index;
    }
  }
  return lines.length;
}

function extractAcceptanceCriteria(
  lines: string[],
  startIndex: number,
  endIndex: number,
): string[] {
  let acceptanceIndex = -1;
  for (let index = startIndex; index < endIndex; index += 1) {
    if (acceptanceHeaderRegex.test(lines[index] ?? "")) {
      acceptanceIndex = index;
      break;
    }
  }

  if (acceptanceIndex === -1) {
    return [];
  }

  const criteria: string[] = [];

  for (let index = acceptanceIndex + 1; index < endIndex; index += 1) {
    const line = lines[index] ?? "";
    if (headingRegex.test(line)) {
      break;
    }

    const match = line.match(checklistItemRegex);
    if (match && match[1]) {
      criteria.push(match[1].trim());
    }
  }

  return criteria;
}

/**
 * Parse speckit task refs, expanding range notation like "T040-T043" to ["T040", "T041", "T042", "T043"]
 *
 * Supports:
 * - Single IDs: "T001" → ["T001"]
 * - Comma-separated: "T001, T002" → ["T001", "T002"]
 * - Ranges: "T040-T043" → ["T040", "T041", "T042", "T043"]
 * - Mixed: "T001, T040-T043, T050" → ["T001", "T040", "T041", "T042", "T043", "T050"]
 */
export function parseSpeckitTaskRefs(value: string | null): string[] {
  if (!value) {
    return [];
  }

  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const result: string[] = [];

  // Regex for range pattern: T###-T### (same prefix, numeric range)
  const rangePattern = /^([A-Z]+)(\d+)-\1(\d+)$/i;

  for (const item of items) {
    const rangeMatch = item.match(rangePattern);
    if (rangeMatch) {
      const prefix = rangeMatch[1];
      const start = parseInt(rangeMatch[2]!, 10);
      const end = parseInt(rangeMatch[3]!, 10);

      if (!isNaN(start) && !isNaN(end) && start <= end) {
        // Determine padding from original format
        const originalPadding = rangeMatch[2]!.length;
        for (let num = start; num <= end; num++) {
          result.push(`${prefix}${String(num).padStart(originalPadding, "0")}`);
        }
        continue;
      }
    }

    // Not a range, add as-is
    result.push(item);
  }

  return result;
}
