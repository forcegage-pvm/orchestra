/**
 * Orchestra Template Service
 *
 * Aligned with Orchestra Bible v0.7.0
 * Handles Handlebars template loading, rendering, and custom helpers.
 */

import Handlebars from "handlebars";
import * as fs from "node:fs";
import * as path from "node:path";
import { findOrchestraRoot } from "./config.js";
import { FileError } from "./errors.js";

/**
 * Load and compile a Handlebars template from the templates directory
 */
export function loadTemplate(
  templateName: string,
  orchestraRoot?: string
): HandlebarsTemplateDelegate {
  const root = orchestraRoot ?? findOrchestraRoot();

  if (!root) {
    throw new FileError("Orchestra not initialized", { templateName });
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

  const content = fs.readFileSync(templatePath, "utf-8");
  return Handlebars.compile(content);
}

/**
 * Render a template with context
 */
export function renderTemplate(
  templateName: string,
  context: Record<string, unknown>,
  orchestraRoot?: string
): string {
  const template = loadTemplate(templateName, orchestraRoot);
  return template(context);
}

/**
 * Render a template string directly (without loading from file)
 */
export function renderTemplateString(
  templateContent: string,
  context: Record<string, unknown>
): string {
  const template = Handlebars.compile(templateContent);
  return template(context);
}

/**
 * Register custom Handlebars helpers
 */
export function registerHelpers(): void {
  // Date formatting
  Handlebars.registerHelper("formatDate", (date: string) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString();
  });

  // ISO date formatting
  Handlebars.registerHelper("formatDateTime", (date: string) => {
    if (!date) return "";
    return new Date(date).toISOString();
  });

  // Status icon mapping
  Handlebars.registerHelper("statusIcon", (status: string) => {
    const icons: Record<string, string> = {
      PENDING: "○",
      PREPARE: "◐",
      IMPLEMENT: "◑",
      GATE_CHECK: "◒",
      VERIFY: "◓",
      COMPLETE: "●",
      RETRY: "↻",
      ESCALATED: "⚠",
      // Legacy lowercase support
      "not-started": "○",
      "in-progress": "◐",
      completed: "●",
      failed: "✗",
      blocked: "⊘",
    };
    return icons[status] ?? "?";
  });

  // Equality check
  Handlebars.registerHelper("eq", (a: unknown, b: unknown) => a === b);

  // Not equal check
  Handlebars.registerHelper("ne", (a: unknown, b: unknown) => a !== b);

  // Greater than
  Handlebars.registerHelper("gt", (a: number, b: number) => a > b);

  // Less than
  Handlebars.registerHelper("lt", (a: number, b: number) => a < b);

  // Conditional (if-then-else)
  Handlebars.registerHelper(
    "ifCond",
    function (
      this: unknown,
      v1: unknown,
      operator: string,
      v2: unknown,
      options: Handlebars.HelperOptions
    ) {
      switch (operator) {
        case "==":
          return v1 == v2 ? options.fn(this) : options.inverse(this);
        case "===":
          return v1 === v2 ? options.fn(this) : options.inverse(this);
        case "!=":
          return v1 != v2 ? options.fn(this) : options.inverse(this);
        case "!==":
          return v1 !== v2 ? options.fn(this) : options.inverse(this);
        case "<":
          return (v1 as number) < (v2 as number)
            ? options.fn(this)
            : options.inverse(this);
        case "<=":
          return (v1 as number) <= (v2 as number)
            ? options.fn(this)
            : options.inverse(this);
        case ">":
          return (v1 as number) > (v2 as number)
            ? options.fn(this)
            : options.inverse(this);
        case ">=":
          return (v1 as number) >= (v2 as number)
            ? options.fn(this)
            : options.inverse(this);
        case "&&":
          return v1 && v2 ? options.fn(this) : options.inverse(this);
        case "||":
          return v1 || v2 ? options.fn(this) : options.inverse(this);
        default:
          return options.inverse(this);
      }
    }
  );

  // JSON stringify
  Handlebars.registerHelper("json", (context: unknown) => {
    return JSON.stringify(context, null, 2);
  });

  // Array length
  Handlebars.registerHelper("length", (arr: unknown[]) => {
    return Array.isArray(arr) ? arr.length : 0;
  });

  // Math: add two numbers
  Handlebars.registerHelper("add", (a: number, b: number) => {
    return (a ?? 0) + (b ?? 0);
  });

  // Math: subtract two numbers
  Handlebars.registerHelper("subtract", (a: number, b: number) => {
    return (a ?? 0) - (b ?? 0);
  });

  // Pluralize
  Handlebars.registerHelper(
    "pluralize",
    (count: number, singular: string, plural?: string) => {
      const pluralForm = plural ?? `${singular}s`;
      return count === 1 ? singular : pluralForm;
    }
  );

  // Default value
  Handlebars.registerHelper(
    "default",
    (value: unknown, defaultValue: unknown) => {
      return value ?? defaultValue;
    }
  );
}

// Initialize helpers on module load
registerHelpers();
