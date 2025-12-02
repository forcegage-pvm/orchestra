/**
 * YAML File Utilities
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parse, stringify } from "yaml";
import type { z } from "zod";
import { FileError, ValidationError } from "./errors.js";

/**
 * Read and parse a YAML file with Zod validation
 * Returns the output type of the schema (after transforms/defaults are applied)
 */
export function readYaml<T extends z.ZodType>(
  filePath: string,
  schema: T
): z.output<T> {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new FileError(`File not found: ${filePath}`, { path: absolutePath });
  }

  let content: string;
  try {
    content = fs.readFileSync(absolutePath, "utf-8");
  } catch (error) {
    throw new FileError(`Failed to read file: ${filePath}`, {
      path: absolutePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  let parsed: unknown;
  try {
    parsed = parse(content);
  } catch (error) {
    throw new FileError(`Invalid YAML syntax in: ${filePath}`, {
      path: absolutePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    }));
    throw new ValidationError(`Validation failed for: ${filePath}`, errors, {
      path: absolutePath,
    });
  }

  return result.data;
}

/**
 * Write data to a YAML file
 */
export function writeYaml<T>(
  filePath: string,
  data: T,
  options?: { createDir?: boolean }
): void {
  const absolutePath = path.resolve(filePath);

  if (options?.createDir) {
    const dir = path.dirname(absolutePath);
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    const content = stringify(data, {
      indent: 2,
      lineWidth: 0, // Disable line wrapping
    });
    fs.writeFileSync(absolutePath, content, "utf-8");
  } catch (error) {
    throw new FileError(`Failed to write file: ${filePath}`, {
      path: absolutePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Check if a YAML file exists
 */
export function yamlExists(filePath: string): boolean {
  return fs.existsSync(path.resolve(filePath));
}
