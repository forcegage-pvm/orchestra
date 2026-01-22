// @orchestra-task: 7

/**
 * MCP Tool Schema Validation Tests
 *
 * Validates that all MCP tool inputSchema definitions are valid JSON Schema.
 * This catches issues like:
 * - Arrays without 'items' property
 * - Objects without 'properties'
 * - Invalid type values
 * - Required fields not in properties
 *
 * This test exists because VS Code's MCP client validates schemas at runtime,
 * and we need to catch invalid schemas before they ship.
 */

import { describe, expect, it } from "vitest";
import {
  checkArrayWithoutItems,
  validateJsonSchema,
} from "../../src/core/interface-validation.js";
import { getToolsForRole } from "../../src/mcp-server/tools.js";

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: unknown[];
  additionalProperties?: boolean | JsonSchema;
  minLength?: number;
  minItems?: number;
  description?: string;
  [key: string]: unknown;
}

/**
 * Recursively validate a JSON Schema object
 */
function validateSchema(
  schema: JsonSchema,
  path: string,
  errors: string[],
): void {
  if (!schema || typeof schema !== "object") {
    return;
  }

  // Rule 1: Arrays MUST have 'items' property
  if (schema.type === "array" && !schema.items) {
    errors.push(`${path}: Array type must have 'items' property`);
  }

  // Rule 2: If items exists, validate it recursively
  if (schema.items) {
    validateSchema(schema.items, `${path}.items`, errors);
  }

  // Rule 3: Object properties should be validated recursively
  if (schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      validateSchema(propSchema as JsonSchema, `${path}.${propName}`, errors);
    }
  }

  // Rule 4: Required fields should exist in properties (if properties defined)
  if (schema.required && schema.properties) {
    for (const requiredField of schema.required) {
      if (!(requiredField in schema.properties)) {
        errors.push(
          `${path}: Required field '${requiredField}' not found in properties`,
        );
      }
    }
  }

  // Rule 5: Type should be a valid JSON Schema type
  const validTypes = [
    "string",
    "number",
    "integer",
    "boolean",
    "array",
    "object",
    "null",
  ];
  if (schema.type && !validTypes.includes(schema.type)) {
    errors.push(`${path}: Invalid type '${schema.type}'`);
  }

  // Rule 6: Enum should be an array if present
  if (schema.enum !== undefined && !Array.isArray(schema.enum)) {
    errors.push(`${path}: 'enum' must be an array`);
  }
}

describe("MCP Tool Schema Validation", () => {
  const allTools = getToolsForRole("full");

  it("should have at least one tool defined", () => {
    expect(allTools.length).toBeGreaterThan(0);
  });

  describe("[tdd-red] AJV schema validation integration", () => {
    it("[tdd-red] reports array schemas missing items in AJV validation", () => {
      const invalidSchema: JsonSchema = {
        type: "object",
        properties: {
          tags: {
            type: "array",
          },
        },
      };

      const errors = validateJsonSchema(invalidSchema, "inputSchema");

      expect(errors.length).toBeGreaterThan(0);
      expect(
        errors.some((error) =>
          error.message.includes("inputSchema/properties/tags"),
        ),
      ).toBe(true);
    });

    it("[tdd-red] detects arrays without items via core helper", () => {
      const invalidSchema: JsonSchema = {
        type: "object",
        properties: {
          tags: {
            type: "array",
          },
        },
      };

      const errors = checkArrayWithoutItems(invalidSchema, "inputSchema");

      expect(errors.length).toBeGreaterThan(0);
      expect(
        errors.some((error) =>
          error.message.includes("inputSchema/properties/tags"),
        ),
      ).toBe(true);
    });
  });

  describe("All tools have valid JSON Schema inputSchema", () => {
    for (const tool of allTools) {
      it(`${tool.name} has valid inputSchema`, () => {
        const errors: string[] = [];

        // Must have inputSchema
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.inputSchema).toBe("object");

        // Validate the schema
        validateSchema(tool.inputSchema as JsonSchema, "inputSchema", errors);

        // Report all errors at once for better debugging
        if (errors.length > 0) {
          throw new Error(
            `Schema validation errors for ${tool.name}:\n  - ${errors.join("\n  - ")}`,
          );
        }
      });
    }
  });

  describe("Specific schema requirements", () => {
    it("all array properties have items defined", () => {
      const arraysWithoutItems: string[] = [];

      for (const tool of allTools) {
        const schema = tool.inputSchema as JsonSchema;
        if (schema.properties) {
          for (const [propName, propSchema] of Object.entries(
            schema.properties,
          )) {
            const prop = propSchema as JsonSchema;
            if (prop.type === "array" && !prop.items) {
              arraysWithoutItems.push(`${tool.name}.${propName}`);
            }
            // Check nested objects too
            if (prop.properties) {
              for (const [nestedName, nestedSchema] of Object.entries(
                prop.properties,
              )) {
                const nested = nestedSchema as JsonSchema;
                if (nested.type === "array" && !nested.items) {
                  arraysWithoutItems.push(
                    `${tool.name}.${propName}.${nestedName}`,
                  );
                }
              }
            }
          }
        }
      }

      expect(arraysWithoutItems).toEqual([]);
    });
  });

  describe("AJV validation for MCP tool schemas", () => {
    it("validates tool inputSchemas via core helpers", () => {
      for (const tool of allTools) {
        const schema = tool.inputSchema as JsonSchema;
        const schemaName = `inputSchema(${tool.name})`;
        const errors = validateJsonSchema(schema, schemaName);
        const arrayErrors = checkArrayWithoutItems(schema, schemaName);

        if (errors.length > 0 || arrayErrors.length > 0) {
          const messages = [...errors, ...arrayErrors]
            .map((error) => error.message)
            .join("\n");
          throw new Error(
            `Schema validation errors for ${tool.name}:\n${messages}`,
          );
        }
      }
    });
  });
});
