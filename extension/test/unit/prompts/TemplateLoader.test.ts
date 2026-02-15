/**
 * Tests for TemplateLoader
 *
 * Verifies that TemplateLoader correctly loads, caches, and renders
 * Handlebars templates with custom helpers and partials support.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TemplateLoader } from "../../../src/prompts/TemplateLoader.js";

describe("TemplateLoader", () => {
  let tempDir: string;
  let templatesDir: string;
  let partialsDir: string;

  /**
   * Create a temporary workspace with template directories
   */
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "template-loader-test-"));
    templatesDir = path.join(tempDir, ".orchestra", "templates", "prompts");
    partialsDir = path.join(templatesDir, "_partials");
    fs.mkdirSync(templatesDir, { recursive: true });
  });

  /**
   * Clean up temporary workspace
   */
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to write a template file
   */
  function writeTemplate(name: string, content: string): void {
    fs.writeFileSync(path.join(templatesDir, `${name}.hbs`), content);
  }

  /**
   * Helper to write a partial file
   */
  function writePartial(name: string, content: string): void {
    fs.mkdirSync(partialsDir, { recursive: true });
    fs.writeFileSync(path.join(partialsDir, `${name}.hbs`), content);
  }

  describe("constructor", () => {
    it("should accept options with required workspaceRoot", () => {
      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      expect(loader).toBeDefined();
    });

    it("should accept options with optional devMode=true", () => {
      const loader = new TemplateLoader({
        workspaceRoot: tempDir,
        devMode: true,
      });
      expect(loader).toBeDefined();
    });

    it("should accept options with optional devMode=false", () => {
      const loader = new TemplateLoader({
        workspaceRoot: tempDir,
        devMode: false,
      });
      expect(loader).toBeDefined();
    });

    it("should default devMode to false when omitted", () => {
      writeTemplate("test", "Hello");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });

      // Render twice - second should use cache (tested via cache behavior)
      const result1 = loader.render("test");
      const result2 = loader.render("test");

      expect(result1).toBe("Hello");
      expect(result2).toBe("Hello");
    });
  });

  describe("render", () => {
    it("should render a simple template", () => {
      writeTemplate("simple", "Hello, World!");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("simple");

      expect(result).toBe("Hello, World!");
    });

    it("should render template with context variables", () => {
      writeTemplate("greeting", "Hello, {{name}}!");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("greeting", { name: "Alice" });

      expect(result).toBe("Hello, Alice!");
    });

    it("should render template with nested context", () => {
      writeTemplate("task-info", "Task {{task.id}}: {{task.title}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("task-info", {
        task: { id: 42, title: "Implement Feature" },
      });

      expect(result).toBe("Task 42: Implement Feature");
    });

    it("should render template with #if conditional", () => {
      writeTemplate(
        "conditional",
        "{{#if showMessage}}Message: {{message}}{{/if}}"
      );

      const loader = new TemplateLoader({ workspaceRoot: tempDir });

      const resultWithFlag = loader.render("conditional", {
        showMessage: true,
        message: "Hello",
      });
      expect(resultWithFlag).toBe("Message: Hello");

      const resultWithoutFlag = loader.render("conditional", {
        showMessage: false,
        message: "Hello",
      });
      expect(resultWithoutFlag).toBe("");
    });

    it("should render template with #each loop", () => {
      writeTemplate("list", "Items:{{#each items}} {{this}}{{/each}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("list", { items: ["a", "b", "c"] });

      expect(result).toBe("Items: a b c");
    });

    it("should render template with #unless block", () => {
      writeTemplate("unless-test", "{{#unless disabled}}Enabled{{/unless}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });

      const resultEnabled = loader.render("unless-test", { disabled: false });
      expect(resultEnabled).toBe("Enabled");

      const resultDisabled = loader.render("unless-test", { disabled: true });
      expect(resultDisabled).toBe("");
    });

    it("should resolve templates from correct path using path.join", () => {
      // Create template with absolute path verification
      const expectedPath = path.join(
        tempDir,
        ".orchestra",
        "templates",
        "prompts",
        "path-test.hbs"
      );
      fs.writeFileSync(expectedPath, "Path test passed");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("path-test");

      expect(result).toBe("Path test passed");
    });

    it("should render template with empty context", () => {
      writeTemplate("no-vars", "Static content only");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("no-vars", {});

      expect(result).toBe("Static content only");
    });

    it("should render template without context parameter", () => {
      writeTemplate("default-context", "No context needed");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("default-context");

      expect(result).toBe("No context needed");
    });
  });

  describe("caching behavior", () => {
    it("should cache compiled templates when devMode is false", () => {
      writeTemplate("cached", "Original content");

      const loader = new TemplateLoader({
        workspaceRoot: tempDir,
        devMode: false,
      });

      // First render
      const result1 = loader.render("cached");
      expect(result1).toBe("Original content");

      // Modify template file
      writeTemplate("cached", "Modified content");

      // Second render should use cached version
      const result2 = loader.render("cached");
      expect(result2).toBe("Original content");
    });

    it("should reuse cached template on subsequent renders", () => {
      writeTemplate("reused", "Cached template");

      const loader = new TemplateLoader({
        workspaceRoot: tempDir,
        devMode: false,
      });

      // Multiple renders
      const result1 = loader.render("reused");
      const result2 = loader.render("reused");
      const result3 = loader.render("reused");

      expect(result1).toBe("Cached template");
      expect(result2).toBe("Cached template");
      expect(result3).toBe("Cached template");
    });
  });

  describe("devMode behavior", () => {
    it("should bypass cache and reload template on each render when devMode is true", () => {
      writeTemplate("dev-mode", "Version 1");

      const loader = new TemplateLoader({
        workspaceRoot: tempDir,
        devMode: true,
      });

      // First render
      const result1 = loader.render("dev-mode");
      expect(result1).toBe("Version 1");

      // Modify template file
      writeTemplate("dev-mode", "Version 2");

      // Second render should see the change
      const result2 = loader.render("dev-mode");
      expect(result2).toBe("Version 2");
    });

    it("should reload template changes without clearCache in devMode", () => {
      writeTemplate("hot-reload", "Initial");

      const loader = new TemplateLoader({
        workspaceRoot: tempDir,
        devMode: true,
      });

      expect(loader.render("hot-reload")).toBe("Initial");

      writeTemplate("hot-reload", "Updated");

      // No clearCache() call needed
      expect(loader.render("hot-reload")).toBe("Updated");
    });
  });

  describe("clearCache", () => {
    it("should cause template to be reloaded on next render", () => {
      writeTemplate("clear-test", "Before clear");

      const loader = new TemplateLoader({
        workspaceRoot: tempDir,
        devMode: false,
      });

      // First render (caches template)
      expect(loader.render("clear-test")).toBe("Before clear");

      // Modify template
      writeTemplate("clear-test", "After clear");

      // Still cached
      expect(loader.render("clear-test")).toBe("Before clear");

      // Clear cache
      loader.clearCache();

      // Now should reload
      expect(loader.render("clear-test")).toBe("After clear");
    });

    it("should clear all cached templates", () => {
      writeTemplate("template-a", "A original");
      writeTemplate("template-b", "B original");

      const loader = new TemplateLoader({
        workspaceRoot: tempDir,
        devMode: false,
      });

      // Cache both templates
      expect(loader.render("template-a")).toBe("A original");
      expect(loader.render("template-b")).toBe("B original");

      // Modify both
      writeTemplate("template-a", "A modified");
      writeTemplate("template-b", "B modified");

      // Still cached
      expect(loader.render("template-a")).toBe("A original");
      expect(loader.render("template-b")).toBe("B original");

      // Clear all
      loader.clearCache();

      // Both should reload
      expect(loader.render("template-a")).toBe("A modified");
      expect(loader.render("template-b")).toBe("B modified");
    });

    it("should allow multiple clear and reload cycles", () => {
      writeTemplate("cycle-test", "Cycle 1");

      const loader = new TemplateLoader({
        workspaceRoot: tempDir,
        devMode: false,
      });

      expect(loader.render("cycle-test")).toBe("Cycle 1");

      writeTemplate("cycle-test", "Cycle 2");
      loader.clearCache();
      expect(loader.render("cycle-test")).toBe("Cycle 2");

      writeTemplate("cycle-test", "Cycle 3");
      loader.clearCache();
      expect(loader.render("cycle-test")).toBe("Cycle 3");
    });
  });

  describe("partials", () => {
    it("should register partials from _partials directory", () => {
      writePartial("header", "<header>{{title}}</header>");
      writeTemplate("with-partial", "{{> header}}Content");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("with-partial", { title: "My Page" });

      expect(result).toBe("<header>My Page</header>Content");
    });

    it("should register partial by filename without extension", () => {
      writePartial("my-partial", "Partial content");
      writeTemplate("use-partial", "Before {{> my-partial}} After");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("use-partial");

      expect(result).toBe("Before Partial content After");
    });

    it("should handle missing _partials directory without error", () => {
      // Don't create _partials directory
      writeTemplate("no-partials", "No partials needed");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("no-partials");

      expect(result).toBe("No partials needed");
    });

    it("should only register .hbs files as partials", () => {
      fs.mkdirSync(partialsDir, { recursive: true });
      writePartial("valid", "Valid partial");
      fs.writeFileSync(path.join(partialsDir, "readme.txt"), "Not a partial");
      fs.writeFileSync(path.join(partialsDir, "notes.md"), "Also not a partial");

      writeTemplate("test-partials", "{{> valid}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("test-partials");

      expect(result).toBe("Valid partial");
    });

    it("should register multiple partials", () => {
      writePartial("header", "HEADER");
      writePartial("footer", "FOOTER");
      writePartial("sidebar", "SIDEBAR");
      writeTemplate(
        "multi-partial",
        "{{> header}} - {{> sidebar}} - {{> footer}}"
      );
      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("multi-partial");

      expect(result).toBe("HEADER - SIDEBAR - FOOTER");
    });

    it("should support nested partial context", () => {
      writePartial("item", "<li>{{name}}: {{value}}</li>");
      writeTemplate(
        "list-items",
        "<ul>{{#each items}}{{> item}}{{/each}}</ul>"
      );

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("list-items", {
        items: [
          { name: "a", value: 1 },
          { name: "b", value: 2 },
        ],
      });

      expect(result).toBe("<ul><li>a: 1</li><li>b: 2</li></ul>");
    });

    it("should re-register partials after clearCache() is called", () => {
      // Initially register a partial
      writePartial("dynamic", "OLD");
      writeTemplate("uses-dynamic", "Start-{{> dynamic}}-End");

      const loader = new TemplateLoader({ workspaceRoot: tempDir, devMode: false });

      // First render picks up initial partial
      expect(loader.render("uses-dynamic")).toBe("Start-OLD-End");

      // Modify partial on disk
      writePartial("dynamic", "NEW");

      // Without clearing cache, partial should still be the old one because partials are cached
      expect(loader.render("uses-dynamic")).toBe("Start-OLD-End");

      // Clear cache which resets partialsRegistered flag
      loader.clearCache();

      // After clearing cache, partials should be re-scanned and pick up the new content
      expect(loader.render("uses-dynamic")).toBe("Start-NEW-End");
    });
  });
  describe("json helper", () => {
    it("should serialize object as JSON with 2-space indent", () => {
      writeTemplate("json-test", "{{{json data}}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("json-test", {
        data: { name: "test", value: 42 },
      });

      expect(result).toBe('{\n  "name": "test",\n  "value": 42\n}');
    });

    it("should serialize array as JSON with 2-space indent", () => {
      writeTemplate("json-array", "{{{json items}}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("json-array", {
        items: ["a", "b", "c"],
      });

      expect(result).toBe('[\n  "a",\n  "b",\n  "c"\n]');
    });

    it("should serialize nested objects", () => {
      writeTemplate("json-nested", "{{{json config}}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("json-nested", {
        config: {
          settings: {
            enabled: true,
            count: 5,
          },
        },
      });

      const expected = JSON.stringify(
        { settings: { enabled: true, count: 5 } },
        null,
        2
      );
      expect(result).toBe(expected);
    });

    it("should handle primitives", () => {
      writeTemplate("json-primitive", "{{{json value}}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });

      expect(loader.render("json-primitive", { value: "string" })).toBe(
        '"string"'
      );
      expect(loader.render("json-primitive", { value: 42 })).toBe("42");
      expect(loader.render("json-primitive", { value: true })).toBe("true");
      expect(loader.render("json-primitive", { value: null })).toBe("null");
    });

    it("should handle undefined as undefined (JSON.stringify behavior)", () => {
      writeTemplate("json-undefined", "{{{json missing}}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("json-undefined", {});

      // JSON.stringify returns undefined for undefined values
      expect(result).toBe("");
    });
  });

  describe("if_eq helper", () => {
    it("should render fn block when values are strictly equal", () => {
      writeTemplate(
        "if-eq-test",
        "{{#if_eq status \"active\"}}Active!{{/if_eq}}"
      );

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("if-eq-test", { status: "active" });

      expect(result).toBe("Active!");
    });

    it("should render inverse block when values are not equal", () => {
      writeTemplate(
        "if-eq-inverse",
        "{{#if_eq status \"active\"}}Active{{else}}Inactive{{/if_eq}}"
      );

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("if-eq-inverse", { status: "pending" });

      expect(result).toBe("Inactive");
    });

    it("should use strict equality (===)", () => {
      writeTemplate("if-eq-strict", "{{#if_eq value 0}}Zero{{/if_eq}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });

      // String "0" should not equal number 0
      expect(loader.render("if-eq-strict", { value: 0 })).toBe("Zero");
      expect(loader.render("if-eq-strict", { value: "0" })).toBe("");
    });

    it("should compare numbers correctly", () => {
      writeTemplate("if-eq-num", "{{#if_eq count 3}}Three{{/if_eq}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });

      expect(loader.render("if-eq-num", { count: 3 })).toBe("Three");
      expect(loader.render("if-eq-num", { count: 2 })).toBe("");
    });

    it("should compare booleans correctly", () => {
      writeTemplate(
        "if-eq-bool",
        "{{#if_eq enabled true}}On{{else}}Off{{/if_eq}}"
      );

      const loader = new TemplateLoader({ workspaceRoot: tempDir });

      expect(loader.render("if-eq-bool", { enabled: true })).toBe("On");
      expect(loader.render("if-eq-bool", { enabled: false })).toBe("Off");
    });

    it("should render empty string when not equal and no else block", () => {
      writeTemplate(
        "if-eq-no-else",
        "{{#if_eq type \"special\"}}Special!{{/if_eq}}"
      );

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("if-eq-no-else", { type: "normal" });

      expect(result).toBe("");
    });
  });

  describe("default helper", () => {
    it("should return value when not null or undefined", () => {
      writeTemplate("default-test", "{{default name \"Unknown\"}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("default-test", { name: "Alice" });

      expect(result).toBe("Alice");
    });

    it("should return default value when value is undefined", () => {
      writeTemplate("default-undefined", "{{default missing \"Default\"}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("default-undefined", {});

      expect(result).toBe("Default");
    });

    it("should return default value when value is null", () => {
      writeTemplate("default-null", "{{default value \"Fallback\"}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("default-null", { value: null });

      expect(result).toBe("Fallback");
    });

    it("should return empty string when value is empty string (not null)", () => {
      writeTemplate("default-empty", "{{default value \"Fallback\"}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("default-empty", { value: "" });

      // Empty string is not nullish, so it should be returned
      expect(result).toBe("");
    });

    it("should return 0 when value is 0 (not null)", () => {
      writeTemplate("default-zero", "{{default count 99}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("default-zero", { count: 0 });

      expect(result).toBe("0");
    });

    it("should return false when value is false (not null)", () => {
      writeTemplate("default-false", "{{default enabled true}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("default-false", { enabled: false });

      expect(result).toBe("false");
    });

    it("should work with nested property access", () => {
      writeTemplate("default-nested", "{{default user.name \"Guest\"}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });

      expect(loader.render("default-nested", { user: { name: "Bob" } })).toBe(
        "Bob"
      );
      expect(loader.render("default-nested", { user: {} })).toBe("Guest");
      expect(loader.render("default-nested", {})).toBe("Guest");
    });
  });

  describe("add helper", () => {
    it("should add positive numbers", () => {
      writeTemplate("add-pos", "{{add 2 3}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      expect(loader.render("add-pos")).toBe("5");
    });

    it("should add negative numbers and zero", () => {
      writeTemplate("add-neg", "{{add -2 -3}}");
      writeTemplate("add-zero", "{{add 0 0}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      expect(loader.render("add-neg")).toBe("-5");
      expect(loader.render("add-zero")).toBe("0");
    });

    it("should coerce string numbers to numbers", () => {
      writeTemplate("add-str", "{{add '2' '3'}}");
      writeTemplate("add-vars", "{{add a b}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      expect(loader.render("add-str")).toBe("5");
      expect(loader.render("add-vars", { a: "4", b: "6" })).toBe("10");
    });
  });
  describe("missing template error", () => {
    it("should throw error when template file does not exist", () => {
      const loader = new TemplateLoader({ workspaceRoot: tempDir });

      expect(() => loader.render("nonexistent")).toThrow();
    });

    it("should include template name in error message", () => {
      const loader = new TemplateLoader({ workspaceRoot: tempDir });

      expect(() => loader.render("missing-template")).toThrow(/missing-template/);
    });

    it("should include expected path in error message", () => {
      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const expectedPathPart = path.join(
        ".orchestra",
        "templates",
        "prompts",
        "my-template.hbs"
      );

      expect(() => loader.render("my-template")).toThrow(
        new RegExp(expectedPathPart.replace(/\\/g, "\\\\"))
      );
    });

    it("should throw descriptive error with full path", () => {
      const loader = new TemplateLoader({ workspaceRoot: tempDir });

      try {
        loader.render("does-not-exist");
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message).toContain("Template not found");
        expect(message).toContain("does-not-exist");
        expect(message).toContain(tempDir);
      }
    });
  });

  describe("complex template scenarios", () => {
    it("should render template with multiple helpers combined", () => {
      writeTemplate(
        "complex",
        `Task: {{task.title}}
Status: {{#if_eq task.status "complete"}}Done{{else}}In Progress{{/if_eq}}
Priority: {{default task.priority "Normal"}}
Data: {{{json task.metadata}}}`
      );

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("complex", {
        task: {
          title: "Implement Feature",
          status: "complete",
          priority: null,
          metadata: { tags: ["urgent"] },
        },
      });

      expect(result).toContain("Task: Implement Feature");
      expect(result).toContain("Status: Done");
      expect(result).toContain("Priority: Normal");
      expect(result).toContain('"tags"');
      expect(result).toContain('"urgent"');
    });

    it("should render template with partials and helpers", () => {
      writePartial("badge", "[{{#if_eq type \"error\"}}!{{else}}i{{/if_eq}}]");
      writeTemplate("with-badge", "{{> badge}} {{message}}");

      const loader = new TemplateLoader({ workspaceRoot: tempDir });

      expect(
        loader.render("with-badge", { type: "error", message: "Failed" })
      ).toBe("[!] Failed");
      expect(
        loader.render("with-badge", { type: "info", message: "Success" })
      ).toBe("[i] Success");
    });

    it("should handle real-world handover template pattern", () => {
      writeTemplate(
        "handover",
        `# Task {{task.id}}: {{task.title}}

## Description
{{task.description}}

{{#if task.dependencies}}
## Dependencies
{{#each task.dependencies}}
- Task {{this}}
{{/each}}
{{/if}}

## Deliverables
{{#each deliverables}}
- {{this}}
{{/each}}

## Data
{{{json task.metadata}}}`
      );

      const loader = new TemplateLoader({ workspaceRoot: tempDir });
      const result = loader.render("handover", {
        task: {
          id: 42,
          title: "Implement Feature X",
          description: "Create the feature as specified",
          dependencies: [40, 41],
          metadata: { priority: "high" },
        },
        deliverables: ["feature.ts", "feature.test.ts"],
      });

      expect(result).toContain("# Task 42: Implement Feature X");
      expect(result).toContain("Create the feature as specified");
      expect(result).toContain("## Dependencies");
      expect(result).toContain("- Task 40");
      expect(result).toContain("- Task 41");
      expect(result).toContain("- feature.ts");
      expect(result).toContain("- feature.test.ts");
      expect(result).toContain('"priority": "high"');
    });
  });
});
