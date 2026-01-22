import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigurationError, ValidationError } from "../../src/core/errors.js";
import {
  loadValidationConfig,
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

    expect(() => loadValidationConfig(dir)).toThrow(ConfigurationError);
  });

  it("throws ValidationError when config is invalid", () => {
    const dir = createTempDir();
    cleanupDirs.push(dir);

    writeConfig(dir, ['version: "1.0"', "validations: []"].join("\n"));

    expect(() => loadValidationConfig(dir)).toThrow(ValidationError);

    try {
      loadValidationConfig(dir);
    } catch (error) {
      if (error instanceof ValidationError) {
        expect(error.errors.length).toBeGreaterThan(0);
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
  });
});
