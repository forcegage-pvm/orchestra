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
const acceptanceHeaderRegex = /^#{3,6}\s*Acceptance\b/i;
const headingRegex = /^#{1,6}\s+/;
const checklistItemRegex = /^\s*-\s*\[\s*[xX ]?\s*\]\s*(.+?)\s*$/;

export async function parseSpecTaskDefinitions(
  specPath: string,
  taskIds: string[],
): Promise<SpecTaskDefinition[]> {
  if (taskIds.length === 0) {
    return [];
  }

  const workspacePath = resolveWorkspacePath();
  if (!workspacePath) {
    throw new Error("Workspace path not resolved");
  }

  const fullPath = path.resolve(workspacePath, specPath);

  let content: string;
  try {
    content = await readFile(fullPath, "utf-8");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read spec file";
    throw new Error(`Spec file not found: ${specPath}. ${message}`);
  }

  const lines = content.split("\n");
  const definitions = new Map<string, SpecTaskDefinition>();

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
    throw new Error(
      `Spec task ID(s) not found in ${specPath}: ${missing.join(", ")}`,
    );
  }

  return result;
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
