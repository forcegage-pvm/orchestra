/**
 * YAML Utilities Tests
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { FileError, ValidationError } from "../../src/core/errors.js";
import { readYaml, writeYaml, yamlExists } from "../../src/core/yaml.js";

// Test schema
const TestSchema = z.object({
  name: z.string(),
  value: z.number(),
  nested: z
    .object({
      items: z.array(z.string()),
    })
    .optional(),
});

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-yaml-test-"));
});

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function createTempFile(filename: string, content: string): string {
  const filePath = path.join(tempDir, filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

describe("readYaml", () => {
  it("should read and validate a valid YAML file", () => {
    const content = `
name: test
value: 42
nested:
  items:
    - one
    - two
`;
    const filePath = createTempFile("valid.yaml", content);
    const result = readYaml(filePath, TestSchema);

    expect(result.name).toBe("test");
    expect(result.value).toBe(42);
    expect(result.nested?.items).toEqual(["one", "two"]);
  });

  it("should throw FileError for missing file", () => {
    const filePath = path.join(tempDir, "missing.yaml");

    expect(() => readYaml(filePath, TestSchema)).toThrow(FileError);
  });

  it("should throw FileError for invalid YAML syntax", () => {
    const content = "invalid: [unclosed bracket";
    const filePath = createTempFile("invalid-syntax.yaml", content);

    expect(() => readYaml(filePath, TestSchema)).toThrow(FileError);
  });

  it("should throw ValidationError when schema validation fails", () => {
    const content = `
name: test
value: "not a number"
`;
    const filePath = createTempFile("invalid-schema.yaml", content);

    expect(() => readYaml(filePath, TestSchema)).toThrow(ValidationError);
  });

  it("should handle empty optional fields", () => {
    const content = `
name: minimal
value: 1
`;
    const filePath = createTempFile("minimal.yaml", content);
    const result = readYaml(filePath, TestSchema);

    expect(result.name).toBe("minimal");
    expect(result.nested).toBeUndefined();
  });
});

describe("writeYaml", () => {
  it("should write data to a YAML file", () => {
    const data = {
      name: "written",
      value: 100,
    };
    const filePath = path.join(tempDir, "output.yaml");

    writeYaml(filePath, data);

    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("name: written");
    expect(content).toContain("value: 100");
  });

  it("should create directory when createDir option is true", () => {
    const data = { name: "nested", value: 1 };
    const filePath = path.join(tempDir, "nested", "dir", "output.yaml");

    writeYaml(filePath, data, { createDir: true });

    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("should throw when directory does not exist and createDir is false", () => {
    const data = { name: "fail", value: 1 };
    const filePath = path.join(tempDir, "nonexistent", "output.yaml");

    expect(() => writeYaml(filePath, data)).toThrow(FileError);
  });

  it("should write nested objects correctly", () => {
    const data = {
      name: "nested",
      value: 50,
      nested: {
        items: ["a", "b", "c"],
      },
    };
    const filePath = path.join(tempDir, "nested-output.yaml");

    writeYaml(filePath, data);

    const result = readYaml(filePath, TestSchema);
    expect(result.nested?.items).toEqual(["a", "b", "c"]);
  });
});

describe("yamlExists", () => {
  it("should return true for existing file", () => {
    const filePath = createTempFile("exists.yaml", "test: true");

    expect(yamlExists(filePath)).toBe(true);
  });

  it("should return false for non-existing file", () => {
    const filePath = path.join(tempDir, "does-not-exist.yaml");

    expect(yamlExists(filePath)).toBe(false);
  });
});
