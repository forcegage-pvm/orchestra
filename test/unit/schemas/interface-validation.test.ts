/**
 * Interface Validation Schema Tests
 *
 * Tests Zod schema validation for interface validation config types
 */

import { describe, expect, it } from "vitest";
import {
  InterfaceValidationConfigSchema,
  InterfaceValidationSchema,
} from "../../../src/schemas/interface-validation.js";

describe("Interface Validation Schemas", () => {
  describe("InterfaceValidationSchema", () => {
    it("should validate entry with command", () => {
      const entry = {
        name: "mcp-tools",
        description: "Validate MCP JSON schemas",
        patterns: ["src/mcp-server/**/*.json"],
        command: "npm run validate:mcp",
        successCriteria: {
          exitCode: 0,
          outputContains: "Validation passed",
        },
      };

      const result = InterfaceValidationSchema.safeParse(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("mcp-tools");
        expect(result.data.command).toBe("npm run validate:mcp");
        expect(result.data.test).toBeUndefined();
        expect(result.data.successCriteria?.exitCode).toBe(0);
      }
    });

    it("should validate entry with test", () => {
      const entry = {
        name: "schema-tests",
        patterns: ["src/schemas/**/*.ts"],
        test: "test/schemas/interface-validation.test.ts",
      };

      const result = InterfaceValidationSchema.safeParse(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.command).toBeUndefined();
        expect(result.data.test).toBe("test/schemas/interface-validation.test.ts");
      }
    });

    it("should reject entry with both command and test", () => {
      const entry = {
        name: "bad-entry",
        patterns: ["src/**/*.ts"],
        command: "npm run validate",
        test: "test/validate.test.ts",
      };

      const result = InterfaceValidationSchema.safeParse(entry);
      expect(result.success).toBe(false);
    });

    it("should reject entry with neither command nor test", () => {
      const entry = {
        name: "missing-handler",
        patterns: ["src/**/*.ts"],
      };

      const result = InterfaceValidationSchema.safeParse(entry);
      expect(result.success).toBe(false);
    });

    it("should reject empty patterns", () => {
      const entry = {
        name: "missing-patterns",
        patterns: [],
        command: "npm run validate",
      };

      const result = InterfaceValidationSchema.safeParse(entry);
      expect(result.success).toBe(false);
    });
  });

  describe("InterfaceValidationConfigSchema", () => {
    it("should validate config with version and validations", () => {
      const config = {
        version: "1.0",
        validations: [
          {
            name: "schema-tests",
            patterns: ["src/schemas/**/*.ts"],
            test: "test/schemas/interface-validation.test.ts",
          },
        ],
      };

      const result = InterfaceValidationConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe("1.0");
        expect(result.data.validations).toHaveLength(1);
      }
    });

    it("should reject invalid version format", () => {
      const config = {
        version: "1",
        validations: [
          {
            name: "schema-tests",
            patterns: ["src/schemas/**/*.ts"],
            test: "test/schemas/interface-validation.test.ts",
          },
        ],
      };

      const result = InterfaceValidationConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("should reject missing validations", () => {
      const config = {
        version: "1.0.0",
        validations: [],
      };

      const result = InterfaceValidationConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });
});
