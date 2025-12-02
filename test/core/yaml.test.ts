/**
 * YAML Utilities Tests
 *
 * Tests for YAML file I/O with validation.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { FileError, ValidationError } from "../../src/core/errors.js";
import {
  readYaml,
  readYamlOptional,
  readYamlRaw,
  updateYaml,
  writeYaml,
  yamlExists,
} from "../../src/core/yaml.js";

// Test schema
const TestSchema = z.object({
  name: z.string(),
  value: z.number(),
  optional: z.string().optional(),
  nested: z
    .object({
      key: z.string(),
    })
    .optional(),
});

describe("YAML Utilities", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yaml-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("readYaml", () => {
    it("should read and validate YAML file", () => {
      const filePath = path.join(tempDir, "test.yaml");
      fs.writeFileSync(
        filePath,
        `name: "test"\nvalue: 42\nnested:\n  key: "nested-value"`,
        "utf-8"
      );

      const result = readYaml(filePath, TestSchema);

      expect(result.name).toBe("test");
      expect(result.value).toBe(42);
      expect(result.nested?.key).toBe("nested-value");
    });

    it("should throw FileError for non-existent file", () => {
      const filePath = path.join(tempDir, "nonexistent.yaml");

      expect(() => readYaml(filePath, TestSchema)).toThrow(FileError);
    });

    it("should throw FileError for invalid YAML syntax", () => {
      const filePath = path.join(tempDir, "invalid.yaml");
      fs.writeFileSync(filePath, "invalid: [unclosed", "utf-8");

      expect(() => readYaml(filePath, TestSchema)).toThrow(FileError);
    });

    it("should throw ValidationError for schema mismatch", () => {
      const filePath = path.join(tempDir, "wrong.yaml");
      fs.writeFileSync(filePath, "name: 123\nvalue: not-a-number", "utf-8");

      expect(() => readYaml(filePath, TestSchema)).toThrow(ValidationError);
    });

    it("should provide detailed validation errors", () => {
      const filePath = path.join(tempDir, "wrong.yaml");
      fs.writeFileSync(filePath, "name: 123\nvalue: not-a-number", "utf-8");

      try {
        readYaml(filePath, TestSchema);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        expect(validationError.errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe("writeYaml", () => {
    it("should write data to YAML file", () => {
      const filePath = path.join(tempDir, "output.yaml");
      const data = { name: "test", value: 42 };

      writeYaml(filePath, data);

      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("name:");
      expect(content).toContain("test");
      expect(content).toContain("value:");
      expect(content).toContain("42");
    });

    it("should create directory if createDir option is set", () => {
      const filePath = path.join(tempDir, "nested", "deep", "output.yaml");
      const data = { name: "test", value: 1 };

      writeYaml(filePath, data, { createDir: true });

      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("should throw FileError when directory does not exist and createDir is false", () => {
      const filePath = path.join(tempDir, "nonexistent", "output.yaml");
      const data = { name: "test", value: 1 };

      expect(() => writeYaml(filePath, data)).toThrow(FileError);
    });

    it("should handle nested objects", () => {
      const filePath = path.join(tempDir, "nested.yaml");
      const data = {
        name: "test",
        value: 42,
        nested: {
          key: "value",
          deep: {
            another: "level",
          },
        },
      };

      writeYaml(filePath, data);
      const read = readYamlRaw(filePath) as typeof data;

      expect(read.nested.key).toBe("value");
      expect(read.nested.deep.another).toBe("level");
    });
  });

  describe("yamlExists", () => {
    it("should return true for existing file", () => {
      const filePath = path.join(tempDir, "exists.yaml");
      fs.writeFileSync(filePath, "test: true", "utf-8");

      expect(yamlExists(filePath)).toBe(true);
    });

    it("should return false for non-existent file", () => {
      const filePath = path.join(tempDir, "nonexistent.yaml");

      expect(yamlExists(filePath)).toBe(false);
    });
  });

  describe("readYamlRaw", () => {
    it("should read YAML without validation", () => {
      const filePath = path.join(tempDir, "raw.yaml");
      fs.writeFileSync(
        filePath,
        "arbitrary:\n  data: 123\n  list:\n    - a\n    - b",
        "utf-8"
      );

      const result = readYamlRaw(filePath) as {
        arbitrary: { data: number; list: string[] };
      };

      expect(result.arbitrary.data).toBe(123);
      expect(result.arbitrary.list).toEqual(["a", "b"]);
    });

    it("should throw FileError for non-existent file", () => {
      const filePath = path.join(tempDir, "nonexistent.yaml");

      expect(() => readYamlRaw(filePath)).toThrow(FileError);
    });
  });

  describe("readYamlOptional", () => {
    it("should return undefined for non-existent file", () => {
      const filePath = path.join(tempDir, "nonexistent.yaml");

      const result = readYamlOptional(filePath, TestSchema);

      expect(result).toBeUndefined();
    });

    it("should return data for existing valid file", () => {
      const filePath = path.join(tempDir, "exists.yaml");
      fs.writeFileSync(filePath, "name: test\nvalue: 1", "utf-8");

      const result = readYamlOptional(filePath, TestSchema);

      expect(result?.name).toBe("test");
    });
  });

  describe("updateYaml", () => {
    it("should read, modify, and write YAML file", () => {
      const filePath = path.join(tempDir, "update.yaml");
      fs.writeFileSync(filePath, "name: original\nvalue: 1", "utf-8");

      const result = updateYaml(filePath, TestSchema, (data) => ({
        ...data,
        name: "updated",
        value: data.value + 1,
      }));

      expect(result.name).toBe("updated");
      expect(result.value).toBe(2);

      // Verify file was updated
      const reread = readYaml(filePath, TestSchema);
      expect(reread.name).toBe("updated");
      expect(reread.value).toBe(2);
    });
  });
});
