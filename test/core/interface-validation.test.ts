import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigurationError, ValidationError } from "../../src/core/errors.js";
import {
  checkArrayWithoutItems,
  INTERFACE_CONFIG_INVALID,
  INTERFACE_CONFIG_NOT_FOUND,
  INTERFACE_PATTERN_OVERLAP,
  INTERFACE_VALIDATION_FAILED,
  loadValidationConfig,
  runAllValidations,
  runValidation,
  validateJsonSchema,
  validatePatternExclusivity,
} from "../../src/core/interface-validation.js";
import type { InterfaceValidationConfig } from "../../src/schemas/interface-validation.js";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-"));
}

function writeConfig(dir: string, content: string): string {
  const configDir = path.join(dir, ".orchestra");
  fs.mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, "interface-validations.yaml");
  fs.writeFileSync(configPath, content, "utf-8");
  return configPath;
}

const cleanupDirs: string[] = [];

afterEach(() => {
  while (cleanupDirs.length > 0) {
    const dir = cleanupDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("loadValidationConfig", () => {
  it("loads and validates config successfully", () => {
    const dir = createTempDir();
    cleanupDirs.push(dir);

    writeConfig(
      dir,
      [
        'version: "1.0"',
        "validations:",
        "  - name: core",
        "    patterns:",
        '      - "src/**/*.ts"',
        '    command: "npm test"',
      ].join("\n"),
    );

    const config = loadValidationConfig(dir);

    expect(config.version).toBe("1.0");
    expect(config.validations).toHaveLength(1);
    expect(config.validations[0]?.name).toBe("core");
  });

  it("throws ConfigurationError when config file is missing", () => {
    const dir = createTempDir();
    cleanupDirs.push(dir);

    try {
      expect.assertions(2);
      loadValidationConfig(dir);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      if (error instanceof ConfigurationError) {
        expect(error.context?.code).toBe(INTERFACE_CONFIG_NOT_FOUND);
      }
    }
  });

  it("throws ValidationError when config is invalid", () => {
    const dir = createTempDir();
    cleanupDirs.push(dir);

    writeConfig(dir, ['version: "1.0"', "validations: []"].join("\n"));

    try {
      expect.assertions(2);
      loadValidationConfig(dir);
    } catch (error) {
      if (error instanceof ValidationError) {
        expect(error.errors.length).toBeGreaterThan(0);
        expect(error.context?.code).toBe(INTERFACE_CONFIG_INVALID);
      }
    }
  });
});

describe("validatePatternExclusivity", () => {
  const baseConfig: InterfaceValidationConfig = {
    version: "1.0",
    validations: [
      {
        name: "core",
        patterns: ["src/**/*.ts"],
        command: "npm test",
      },
      {
        name: "tests",
        patterns: ["test/**/*.test.ts"],
        command: "npm test",
      },
    ],
  };

  it("returns empty array when no overlaps exist", () => {
    const files = ["src/core/index.ts", "test/core/index.test.ts"];

    const overlaps = validatePatternExclusivity(baseConfig, files);

    expect(overlaps).toEqual([]);
  });

  it("returns overlap errors when file matches multiple patterns", () => {
    const config: InterfaceValidationConfig = {
      version: "1.0",
      validations: [
        {
          name: "all-ts",
          patterns: ["**/*.ts"],
          command: "npm test",
        },
        {
          name: "src-only",
          patterns: ["src/**/*.ts"],
          command: "npm test",
        },
      ],
    };

    const overlaps = validatePatternExclusivity(config, [
      "src/core/file.ts",
      "src/other.ts",
    ]);

    expect(overlaps).toHaveLength(2);
    expect(overlaps[0]?.file).toBe("src/core/file.ts");
    expect(overlaps[0]?.matchingValidations).toEqual(["all-ts", "src-only"]);
    expect(INTERFACE_PATTERN_OVERLAP).toBe("INTERFACE_PATTERN_OVERLAP");
  });
});

describe("validateJsonSchema", () => {
  it("returns empty array for a valid schema", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
    };

    const errors = validateJsonSchema(schema);

    expect(errors).toEqual([]);
  });

  it("returns empty array for an empty schema", () => {
    const errors = validateJsonSchema({});

    expect(errors).toEqual([]);
  });

  it("returns validation errors for invalid schema types", () => {
    const schema = {
      type: "Array",
    };

    const errors = validateJsonSchema(schema);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.message).toContain("/type");
  });

  it("returns validation errors for invalid required property", () => {
    const schema = {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: "id",
    };

    const errors = validateJsonSchema(schema);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.message).toContain("should be array");
  });

  it("includes schemaName in error messages when provided", () => {
    const schema = {
      type: "Array",
    };

    const errors = validateJsonSchema(schema, "submit_code_review.inputSchema");

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.message).toContain("submit_code_review.inputSchema/type");
  });

  it("returns error when schema is not an object", () => {
    const errors = validateJsonSchema(null as unknown as object, "tool.schema");

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe("tool.schema: Schema must be an object");
  });
});

describe("runValidation", () => {
  it("executes a validation command and returns passing result", async () => {
    const validation = {
      name: "echo",
      patterns: ["**/*"],
      command: "node -e \"console.log('ok')\"",
      successCriteria: {
        outputContains: "ok",
      },
    } satisfies InterfaceValidationConfig["validations"][number];

    const results = await runValidation(validation, process.cwd());

    expect(results).toHaveLength(1);
    expect(results[0]?.passed).toBe(true);
    expect(results[0]?.errors).toEqual([]);
  });

  it("executes a validation test entry when provided", async () => {
    const validation = {
      name: "test",
      patterns: ["**/*"],
      test: "node -e \"process.stdout.write('test-ok')\"",
      successCriteria: {
        outputContains: "test-ok",
      },
    } satisfies InterfaceValidationConfig["validations"][number];

    const results = await runValidation(validation, process.cwd());

    expect(results).toHaveLength(1);
    expect(results[0]?.passed).toBe(true);
  });

  it("throws ConfigurationError when validation tool is missing", async () => {
    const validation = {
      name: "missing-tool",
      patterns: ["**/*"],
      command: "nonexistent_command_xyz_123",
    } satisfies InterfaceValidationConfig["validations"][number];

    await expect(
      runValidation(validation, process.cwd()),
    ).rejects.toBeInstanceOf(ConfigurationError);
  });

  it("returns failure code when validation does not meet criteria", async () => {
    const validation = {
      name: "fail",
      patterns: ["**/*"],
      command: 'node -e "process.exit(1)"',
    } satisfies InterfaceValidationConfig["validations"][number];

    const results = await runValidation(validation, process.cwd());

    expect(results).toHaveLength(1);
    expect(results[0]?.passed).toBe(false);
    expect(results[0]?.code).toBe(INTERFACE_VALIDATION_FAILED);
  });
});

describe("runAllValidations", () => {
  it("runs all validations and aggregates results", async () => {
    const config: InterfaceValidationConfig = {
      version: "1.0",
      validations: [
        {
          name: "first",
          patterns: ["**/*"],
          command: "node -e \"console.log('first')\"",
          successCriteria: { outputContains: "first" },
        },
        {
          name: "second",
          patterns: ["**/*"],
          command: "node -e \"console.log('second')\"",
          successCriteria: { outputContains: "second" },
        },
      ],
    };

    const results = await runAllValidations(config, process.cwd());

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.validationName)).toEqual([
      "first",
      "second",
    ]);
    expect(results.every((result) => result.passed)).toBe(true);
  });
});

describe("checkArrayWithoutItems", () => {
  it("reports missing items for root array schema", () => {
    const errors = checkArrayWithoutItems({ type: "array" });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("/");
  });

  it("reports nested arrays without items", () => {
    const schema = {
      type: "object",
      properties: {
        items: {
          type: "array",
        },
      },
      definitions: {
        Example: {
          type: ["array", "null"],
        },
      },
    };

    const errors = checkArrayWithoutItems(schema);

    expect(errors).toHaveLength(2);
    expect(errors[0]?.message).toContain("/properties/items");
    expect(errors[1]?.message).toContain("/definitions/Example");
  });

  it("does not report arrays that define items", () => {
    const schema = {
      type: "array",
      items: {
        type: "string",
      },
    };

    const errors = checkArrayWithoutItems(schema);

    expect(errors).toEqual([]);
  });
});
