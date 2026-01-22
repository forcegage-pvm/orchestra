/**
 * Interface validation core utilities
 */

import Ajv from "ajv";
import minimatch from "minimatch";
import { exec, type ExecOptions } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";
import type {
  InterfaceValidation,
  InterfaceValidationConfig,
} from "../schemas/interface-validation.js";
import { InterfaceValidationConfigSchema } from "../schemas/interface-validation.js";
import {
  ConfigurationError,
  FileError,
  OrchestraError,
  ValidationError,
} from "./errors.js";
import { readYaml, yamlExists } from "./yaml.js";

const INTERFACE_VALIDATION_CONFIG_RELATIVE_PATH =
  ".orchestra/interface-validations.yaml";

export interface PatternOverlapError {
  file: string;
  matchingValidations: string[];
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
}

export interface ValidationResult {
  validationName: string;
  file?: string;
  passed: boolean;
  errors: Array<{ path: string; message: string }>;
}

export function loadValidationConfig(
  rootDir: string = process.cwd(),
): InterfaceValidationConfig {
  const configPath = path.resolve(
    rootDir,
    INTERFACE_VALIDATION_CONFIG_RELATIVE_PATH,
  );

  if (!yamlExists(configPath)) {
    throw new ConfigurationError("Interface validation config not found", {
      path: configPath,
      expected: INTERFACE_VALIDATION_CONFIG_RELATIVE_PATH,
    });
  }

  try {
    return readYaml(configPath, InterfaceValidationConfigSchema);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new ValidationError(
        "Invalid interface validation config",
        error.errors,
        { path: configPath },
      );
    }

    if (error instanceof OrchestraError) {
      throw error;
    }

    throw new FileError("Failed to load interface validation config", {
      path: configPath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function validatePatternExclusivity(
  config: InterfaceValidationConfig,
  files: string[],
  rootDir: string = process.cwd(),
): PatternOverlapError[] {
  const results: PatternOverlapError[] = [];

  for (const file of files) {
    const normalizedFile = normalizeFilePath(file, rootDir);
    const matchingValidations: string[] = [];

    for (const validation of config.validations) {
      if (matchesAnyPattern(normalizedFile, validation.patterns)) {
        matchingValidations.push(validation.name);
      }
    }

    if (matchingValidations.length > 1) {
      results.push({
        file: normalizedFile,
        matchingValidations,
      });
    }
  }

  return results;
}

const schemaValidator = new Ajv({
  allErrors: true,
});

export function validateJsonSchema(
  schema: object,
  schemaName?: string,
): Array<{ path: string; message: string }> {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    const messagePath = schemaName ?? "/";
    return [
      {
        path: "/",
        message: `${messagePath}: Schema must be an object`,
      },
    ];
  }

  const valid = schemaValidator.validateSchema(schema);

  if (valid) {
    return [];
  }

  return (schemaValidator.errors ?? []).map((error) => {
    const rawPath =
      "instancePath" in error && typeof error.instancePath === "string"
        ? error.instancePath
        : "dataPath" in error && typeof error.dataPath === "string"
          ? error.dataPath
          : "";
    const normalizedPath = rawPath.length > 0 ? normalizeAjvPath(rawPath) : "/";
    const messagePath = schemaName
      ? normalizedPath === "/"
        ? schemaName
        : `${schemaName}${normalizedPath}`
      : normalizedPath;
    const message = `${messagePath}: ${error.message ?? "Schema validation error"}`;

    return {
      path: normalizedPath,
      message,
    };
  });
}

export function checkArrayWithoutItems(
  schema: object,
  schemaName?: string,
): Array<{ path: string; message: string }> {
  const errors: Array<{ path: string; message: string }> = [];

  const addError = (pathValue: string): void => {
    const normalizedPath = pathValue === "" ? "/" : pathValue;
    const messagePath = schemaName
      ? normalizedPath === "/"
        ? schemaName
        : `${schemaName}${normalizedPath}`
      : normalizedPath;
    errors.push({
      path: normalizedPath,
      message: `${messagePath}: Array type requires 'items' property`,
    });
  };

  const traverse = (node: unknown, currentPath: string): void => {
    if (node === null || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((entry, index) => {
        traverse(entry, `${currentPath}/${index}`);
      });
      return;
    }

    const record = node as Record<string, unknown>;
    const typeValue = record.type;
    const hasArrayType =
      typeValue === "array" ||
      (Array.isArray(typeValue) && typeValue.includes("array"));

    if (hasArrayType && record.items === undefined) {
      addError(currentPath);
    }

    for (const [key, value] of Object.entries(record)) {
      const nextPath = `${currentPath}/${encodePointerSegment(key)}`;
      traverse(value, nextPath);
    }
  };

  traverse(schema, "");

  return errors;
}

const execAsync = promisify(exec);

export async function runValidation(
  validation: InterfaceValidation,
  projectRoot: string,
): Promise<ValidationResult[]> {
  const command = validation.command ?? validation.test;

  if (!command) {
    const result: ValidationResult = {
      validationName: validation.name,
      passed: false,
      errors: [
        {
          path: "/",
          message: "Validation entry missing command or test",
        },
      ],
    };

    if (validation.test !== undefined) {
      result.file = validation.test;
    }

    return [result];
  }

  const wrappedCommand =
    process.platform === "win32"
      ? `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}`
      : command;

  const execOptions: ExecOptions = {
    cwd: projectRoot,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
    shell: process.platform === "win32" ? "powershell.exe" : "/bin/sh",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
  };

  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  try {
    const result = await execAsync(wrappedCommand, execOptions);
    stdout = String(result.stdout ?? "");
    stderr = String(result.stderr ?? "");
    exitCode = 0;
  } catch (error: unknown) {
    if (isExecError(error)) {
      if (isMissingToolError(error)) {
        throw new ConfigurationError("Validation tool not found", {
          code: "INTERFACE_TOOL_MISSING",
          command,
          validation: validation.name,
        });
      }

      stdout = String(error.stdout ?? "");
      stderr = String(error.stderr ?? error.message ?? "");
      exitCode = typeof error.code === "number" ? error.code : 1;
    } else {
      throw new FileError("Failed to run interface validation", {
        command,
        validation: validation.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const successCriteria = validation.successCriteria ?? {
    exitCode: 0,
  };
  const expectedExitCode = successCriteria.exitCode ?? 0;
  const combinedOutput = `${stdout}${stderr}`;
  const errors: Array<{ path: string; message: string }> = [];

  if (exitCode !== expectedExitCode) {
    errors.push({
      path: "/exitCode",
      message: `Expected exit code ${expectedExitCode} but got ${exitCode}`,
    });
  }

  if (
    successCriteria.outputContains &&
    !combinedOutput.includes(successCriteria.outputContains)
  ) {
    errors.push({
      path: "/output",
      message: `Output must contain "${successCriteria.outputContains}"`,
    });
  }

  if (
    successCriteria.outputNotContains &&
    combinedOutput.includes(successCriteria.outputNotContains)
  ) {
    errors.push({
      path: "/output",
      message: `Output must not contain "${successCriteria.outputNotContains}"`,
    });
  }

  const result: ValidationResult = {
    validationName: validation.name,
    passed: errors.length === 0,
    errors,
  };

  if (validation.test !== undefined) {
    result.file = validation.test;
  }

  return [result];
}

function normalizeAjvPath(pathValue: string): string {
  if (pathValue.startsWith("/")) {
    return pathValue;
  }

  if (pathValue.startsWith(".")) {
    const converted = pathValue
      .replace(/\[(\d+)\]/g, "/$1")
      .replace(/\./g, "/");
    return converted.startsWith("/") ? converted : `/${converted}`;
  }

  return `/${pathValue}`;
}

function encodePointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

interface ExecError extends Error {
  code?: number | string;
  errno?: number | string;
  stdout?: string;
  stderr?: string;
}

function isExecError(error: unknown): error is ExecError {
  return (
    error instanceof Error &&
    ("code" in error || "stdout" in error || "stderr" in error)
  );
}

function isMissingToolError(error: ExecError): boolean {
  if (error.code === "ENOENT" || error.errno === "ENOENT") {
    return true;
  }

  if (error.code === 127) {
    return true;
  }

  const combined = `${error.message ?? ""}\n${error.stderr ?? ""}`;
  return /not found|not recognized|ENOENT/i.test(combined);
}

function matchesAnyPattern(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) =>
    minimatch(filePath, pattern, {
      dot: true,
      nocase: false,
    }),
  );
}

function normalizeFilePath(filePath: string, rootDir: string): string {
  const relativePath = path.isAbsolute(filePath)
    ? path.relative(rootDir, filePath)
    : filePath;
  return relativePath.replace(/\\/g, "/");
}
