/**
 * Orchestra YAML Utilities
 *
 * Aligned with Orchestra Bible v0.7.0
 * Provides YAML file I/O utilities with validation.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parse, stringify } from "yaml";
import type { z } from "zod";
import { FileError, ValidationError } from "./errors.js";

/**
 * Read and parse a YAML file with Zod schema validation.
 * Returns the output type (with defaults applied).
 */
export function readYaml<T extends z.ZodTypeAny>(
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
      defaultStringType: "QUOTE_DOUBLE",
      defaultKeyType: "PLAIN",
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

/**
 * Read YAML file without validation (raw parse)
 */
export function readYamlRaw(filePath: string): unknown {
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

  try {
    return parse(content);
  } catch (error) {
    throw new FileError(`Invalid YAML syntax in: ${filePath}`, {
      path: absolutePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Safely read YAML file, returning undefined if not found
 */
export function readYamlOptional<T extends z.ZodTypeAny>(
  filePath: string,
  schema: T
): z.output<T> | undefined {
  if (!yamlExists(filePath)) {
    return undefined;
  }
  return readYaml(filePath, schema);
}

/**
 * Update a YAML file by reading, modifying, and writing
 */
export function updateYaml<T extends z.ZodTypeAny>(
  filePath: string,
  schema: T,
  updater: (data: z.output<T>) => z.output<T>
): z.output<T> {
  const data = readYaml(filePath, schema);
  const updated = updater(data);
  writeYaml(filePath, updated);
  return updated;
}
