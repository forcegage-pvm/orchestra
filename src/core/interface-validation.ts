/**
 * Interface validation core utilities
 */

import Ajv from "ajv";
import minimatch from "minimatch";
import * as path from "node:path";
import type { InterfaceValidationConfig } from "../schemas/interface-validation.js";
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
