/**
 * Orchestra Template Converter
 *
 * Converts Handlebars templates to YAML templates and vice versa.
 * Enables single source of truth (HBS) with multiple output formats.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { findOrchestraRoot } from "./config.js";
import { FileError } from "./errors.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Represents an extracted field from a Handlebars template
 */
export interface TemplateField {
  name: string;
  type: "string" | "array" | "boolean" | "object";
  path: string[]; // For nested fields like "nested.field"
  required: boolean;
  defaultValue?: unknown;
}

/**
 * Result of parsing a Handlebars template
 */
export interface ParsedTemplate {
  fields: TemplateField[];
  raw: string;
}

/**
 * Options for YAML generation
 */
export interface YamlGenerationOptions {
  /** Pre-fill values from this context */
  context?: Record<string, unknown>;
  /** Include comments explaining each field */
  includeComments?: boolean;
  /** Mark TODO fields that need filling */
  markTodos?: boolean;
}

// =============================================================================
// Field Extraction
// =============================================================================

/**
 * Extract all fields from a Handlebars template
 */
export function extractFields(hbsContent: string): TemplateField[] {
  const fields: Map<string, TemplateField> = new Map();

  // Match simple variables: {{fieldName}}
  const simpleVarRegex =
    /\{\{([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = simpleVarRegex.exec(hbsContent)) !== null) {
    const fullPath = match[1];
    if (!fullPath) continue;

    // Skip helpers like "this", "else", etc.
    if (
      ["this", "else", "@index", "@first", "@last", "@key"].includes(fullPath)
    ) {
      continue;
    }

    const parts = fullPath.split(".");
    const name = parts[0];
    if (!name) continue;

    if (!fields.has(name)) {
      fields.set(name, {
        name,
        type: parts.length > 1 ? "object" : "string",
        path: parts,
        required: true,
      });
    }
  }

  // Match #each blocks: {{#each arrayName}}
  const eachRegex =
    /\{\{#each\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\}\}/g;
  while ((match = eachRegex.exec(hbsContent)) !== null) {
    const fullPath = match[1];
    if (!fullPath) continue;

    const parts = fullPath.split(".");
    const name = parts[0];
    if (!name) continue;

    fields.set(name, {
      name,
      type: "array",
      path: parts,
      required: true,
    });
  }

  // Match #if blocks: {{#if flagName}}
  const ifRegex =
    /\{\{#if\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\}\}/g;
  while ((match = ifRegex.exec(hbsContent)) !== null) {
    const fullPath = match[1];
    if (!fullPath) continue;

    const parts = fullPath.split(".");
    const name = parts[0];
    if (!name) continue;

    // Don't overwrite if already exists as array
    if (!fields.has(name)) {
      fields.set(name, {
        name,
        type: "boolean",
        path: parts,
        required: false, // Conditionals are typically optional
      });
    } else {
      // If it exists, mark as not required since it's in a conditional
      const existing = fields.get(name);
      if (existing) {
        existing.required = false;
      }
    }
  }

  // Match {{#unless blocks
  const unlessRegex =
    /\{\{#unless\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\}\}/g;
  while ((match = unlessRegex.exec(hbsContent)) !== null) {
    const fullPath = match[1];
    if (!fullPath) continue;

    const parts = fullPath.split(".");
    const name = parts[0];
    if (!name) continue;

    if (!fields.has(name)) {
      fields.set(name, {
        name,
        type: "boolean",
        path: parts,
        required: false,
      });
    }
  }

  return Array.from(fields.values());
}

/**
 * Parse a Handlebars template file
 */
export function parseTemplate(templatePath: string): ParsedTemplate {
  if (!fs.existsSync(templatePath)) {
    throw new FileError(`Template not found: ${templatePath}`);
  }

  const content = fs.readFileSync(templatePath, "utf-8");
  const fields = extractFields(content);

  return {
    fields,
    raw: content,
  };
}

// =============================================================================
// YAML Generation
// =============================================================================

/**
 * Generate a YAML template from extracted fields
 */
export function generateYamlTemplate(
  fields: TemplateField[],
  options: YamlGenerationOptions = {}
): string {
  const { context = {}, includeComments = true, markTodos = true } = options;

  const lines: string[] = [];

  if (includeComments) {
    lines.push("# Generated from Handlebars template");
    lines.push("# Fill in all fields, then run: orchestra render");
    lines.push("");
  }

  for (const field of fields) {
    const contextValue = context[field.name];

    // Add field comment
    if (includeComments) {
      const requiredTag = field.required ? "(required)" : "(optional)";
      lines.push(`# ${field.name} ${requiredTag}`);
    }

    // Generate field value
    switch (field.type) {
      case "string":
        if (contextValue !== undefined) {
          lines.push(
            `${field.name}: "${escapeYamlString(String(contextValue))}"`
          );
        } else if (markTodos) {
          lines.push(`${field.name}: "" # TODO: Fill this`);
        } else {
          lines.push(`${field.name}: ""`);
        }
        break;

      case "array":
        lines.push(`${field.name}:`);
        if (Array.isArray(contextValue) && contextValue.length > 0) {
          for (const item of contextValue) {
            if (typeof item === "object" && item !== null) {
              // Array of objects
              const objLines = objectToYaml(item, 2);
              lines.push(`  - ${objLines}`);
            } else {
              lines.push(`  - "${escapeYamlString(String(item))}"`);
            }
          }
        } else if (markTodos) {
          lines.push(`  - "" # TODO: Add items`);
        } else {
          lines.push(`  []`);
        }
        break;

      case "boolean":
        if (contextValue !== undefined) {
          lines.push(`${field.name}: ${Boolean(contextValue)}`);
        } else {
          lines.push(`${field.name}: false`);
        }
        break;

      case "object":
        lines.push(`${field.name}:`);
        if (typeof contextValue === "object" && contextValue !== null) {
          const objYaml = objectToYaml(contextValue, 2);
          lines.push(objYaml);
        } else if (markTodos) {
          lines.push(`  # TODO: Fill nested fields`);
        }
        break;
    }

    lines.push(""); // Blank line between fields
  }

  return lines.join("\n");
}

/**
 * Convert an object to YAML string with indentation
 */
function objectToYaml(obj: unknown, indent: number): string {
  const spaces = " ".repeat(indent);
  const lines: string[] = [];

  if (typeof obj !== "object" || obj === null) {
    return String(obj);
  }

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      lines.push(`${spaces}${key}:`);
      lines.push(objectToYaml(value, indent + 2));
    } else if (Array.isArray(value)) {
      lines.push(`${spaces}${key}:`);
      for (const item of value) {
        lines.push(`${spaces}  - "${escapeYamlString(String(item))}"`);
      }
    } else {
      lines.push(`${spaces}${key}: "${escapeYamlString(String(value))}"`);
    }
  }

  return lines.join("\n");
}

/**
 * Escape special characters in YAML strings
 */
function escapeYamlString(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

// =============================================================================
// Markdown Generation with TODOs
// =============================================================================

/**
 * Render Handlebars template with TODO markers for missing fields
 */
export function renderWithTodos(
  hbsContent: string,
  context: Record<string, unknown>
): string {
  let result = hbsContent;

  // Replace simple variables with values or TODOs
  result = result.replace(
    /\{\{([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\}\}/g,
    (_match, fieldPath) => {
      if (["this", "@index", "@first", "@last", "@key"].includes(fieldPath)) {
        return _match; // Keep special variables
      }

      const value = getNestedValue(context, fieldPath);
      if (value !== undefined && value !== null && value !== "") {
        return String(value);
      }
      return `🔴 **TODO**: Fill \`${fieldPath}\``;
    }
  );

  // Handle #each blocks
  result = result.replace(
    /\{\{#each\s+([a-zA-Z_][a-zA-Z0-9_]*)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_match, arrayName, blockContent) => {
      const arr = context[arrayName];
      if (Array.isArray(arr) && arr.length > 0) {
        return arr
          .map((item) => {
            let itemContent = blockContent;
            // Replace {{this}} with item value
            itemContent = itemContent.replace(/\{\{this\}\}/g, String(item));
            // Replace {{field}} with item.field for object arrays
            if (typeof item === "object" && item !== null) {
              for (const [key, value] of Object.entries(item)) {
                itemContent = itemContent.replace(
                  new RegExp(`\\{\\{${key}\\}\\}`, "g"),
                  String(value)
                );
              }
            }
            return itemContent;
          })
          .join("");
      }
      return `🔴 **TODO**: Add items to \`${arrayName}\`\n`;
    }
  );

  // Handle #if blocks
  result = result.replace(
    /\{\{#if\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, condition, blockContent) => {
      const value = getNestedValue(context, condition);
      if (value) {
        // Recursively process the block content
        return renderWithTodos(blockContent, context);
      }
      return ""; // Condition not met, omit block
    }
  );

  // Handle #unless blocks
  result = result.replace(
    /\{\{#unless\s+([a-zA-Z_][a-zA-Z0-9_]*)\}\}([\s\S]*?)\{\{\/unless\}\}/g,
    (_match, condition, blockContent) => {
      const value = context[condition];
      if (!value) {
        return renderWithTodos(blockContent, context);
      }
      return "";
    }
  );

  // Clean up any remaining Handlebars syntax
  result = result.replace(/\{\{else\}\}[\s\S]*?\{\{\/(if|unless)\}\}/g, "");

  return result;
}

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

// =============================================================================
// High-Level API
// =============================================================================

/**
 * Convert a Handlebars template to a YAML template
 */
export function hbsToYamlTemplate(
  templateName: string,
  context?: Record<string, unknown>,
  orchestraRoot?: string
): string {
  const root = orchestraRoot ?? findOrchestraRoot();
  if (!root) {
    throw new FileError("Orchestra not initialized");
  }

  const templatePath = path.join(
    root,
    ".orchestra",
    "common",
    "templates",
    `${templateName}.hbs`
  );

  const parsed = parseTemplate(templatePath);

  return generateYamlTemplate(parsed.fields, {
    context: context ?? {},
    includeComments: true,
    markTodos: true,
  });
}

/**
 * Convert a Handlebars template to Markdown with TODOs
 */
export function hbsToMarkdown(
  templateName: string,
  context: Record<string, unknown>,
  orchestraRoot?: string
): string {
  const root = orchestraRoot ?? findOrchestraRoot();
  if (!root) {
    throw new FileError("Orchestra not initialized");
  }

  const templatePath = path.join(
    root,
    ".orchestra",
    "common",
    "templates",
    `${templateName}.hbs`
  );

  if (!fs.existsSync(templatePath)) {
    throw new FileError(`Template not found: ${templateName}`, {
      path: templatePath,
    });
  }

  const hbsContent = fs.readFileSync(templatePath, "utf-8");
  return renderWithTodos(hbsContent, context);
}

// =============================================================================
// YAML Validation
// =============================================================================

/**
 * Validate a YAML file against expected fields
 */
export function validateYamlHandover(
  yamlContent: Record<string, unknown>,
  expectedFields: TemplateField[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const field of expectedFields) {
    if (!field.required) continue;

    const value = yamlContent[field.name];

    if (value === undefined || value === null) {
      errors.push(`Missing required field: ${field.name}`);
      continue;
    }

    switch (field.type) {
      case "string":
        if (typeof value !== "string" || value.trim() === "") {
          errors.push(`Field ${field.name} must be a non-empty string`);
        }
        if (typeof value === "string" && value.includes("TODO")) {
          errors.push(`Field ${field.name} still contains TODO marker`);
        }
        break;

      case "array":
        if (!Array.isArray(value) || value.length === 0) {
          errors.push(`Field ${field.name} must be a non-empty array`);
        }
        break;

      case "boolean":
        if (typeof value !== "boolean") {
          errors.push(`Field ${field.name} must be a boolean`);
        }
        break;

      case "object":
        if (typeof value !== "object" || value === null) {
          errors.push(`Field ${field.name} must be an object`);
        }
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
