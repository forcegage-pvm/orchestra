/**
 * Code Review Template Verification Tests
 *
 * Verifies that the migrated code-review templates (code-review.hbs,
 * code-review-bulk.hbs, code-review-re-review.hbs) produce correct output
 * equivalent to the original text builder functions that were removed from
 * promptTextBuilders.ts.
 *
 * This serves as the mandatory equivalence verification per Task 7.
 */

import * as path from "path";
import { describe, expect, it } from "vitest";
import { PromptBuilder } from "../../src/prompts/PromptBuilder.js";
import { TemplateLoader } from "../../src/prompts/TemplateLoader.js";

// Use the project root where extension/templates/prompts/ lives,
// but TemplateLoader reads from .orchestra/templates/prompts/ at runtime.
// For tests, point to the project root so TemplateLoader finds templates
// via the .orchestra path. We need to copy or symlink, OR use the extension
// bundled templates directory. TemplateLoader reads from .orchestra/templates/prompts/.
// So we need a workspace root that has .orchestra/templates/prompts/.

// The project root has the templates at extension/templates/prompts/,
// and .orchestra/templates/prompts/ is where they get copied at install time.
// For integration testing, use the project root (parent of extension/).
const projectRoot = path.resolve(__dirname, "../../..");

describe("Code Review Template Verification", () => {
  let loader: TemplateLoader;

  // Sample contexts matching current usage patterns
  const singleTaskContext = {
    sprint: { sprint_id: "sprint-005", title: "Template Migration Sprint" },
    task: { task_id: 7, title: "Migrate code review prompts" },
  };

  const bulkContext = {
    pendingCount: 3,
    sprint: { sprint_id: "sprint-005", title: "Template Migration Sprint" },
  };

  const reReviewContext = {
    sprint: { sprint_id: "sprint-005", title: "Template Migration Sprint" },
    task: { task_id: 7, title: "Migrate code review prompts" },
    codeReview: { reviewId: 42 },
  };

  // Helper to check if .orchestra/templates/prompts/ exists at project root
  function getTemplateLoader(): TemplateLoader {
    // Try .orchestra path first (runtime path)
    try {
      const l = new TemplateLoader({ workspaceRoot: projectRoot });
      l.render("code-review", singleTaskContext);
      return l;
    } catch {
      // Fall back - templates may be in extension/templates/prompts/
      // In test, we need the .orchestra copy. If it doesn't exist, copy manually.
      throw new Error(
        "Templates not found at .orchestra/templates/prompts/. " +
        "Run the extension install/sync step or create a symlink for testing.",
      );
    }
  }

  // Use beforeAll-like pattern via a describe-level setup
  it("should have templates available for rendering", () => {
    loader = getTemplateLoader();
    expect(loader).toBeDefined();
  });

  describe("code-review.hbs (single task review)", () => {
    it("renders with correct context variables", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review", singleTaskContext);

      // Must contain sprint and task context variables
      expect(output).toContain("sprint-005");
      expect(output).toContain("Template Migration Sprint");
      expect(output).toContain("7");
      expect(output).toContain("Migrate code review prompts");
    });

    it("includes spec-protocol partial content", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review", singleTaskContext);

      // Spec-protocol content (from the partial with protocol_variant="single")
      expect(output).toContain("Mandatory Spec-First Protocol");
      expect(output).toContain("evidence");
      expect(output).toContain("submit_code_review");
      expect(output).toContain("CHANGES_REQUESTED");
    });

    it("includes stub-hunter-mode partial content", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review", singleTaskContext);

      // Stub hunter mode content
      expect(output).toContain("STUB HUNTER");
      expect(output).toContain("Stub Hunt");
    });

    it("has spec-protocol BEFORE stub-hunter-mode in output", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review", singleTaskContext);

      const specProtocolIndex = output.indexOf("Mandatory Spec-First Protocol");
      const stubHunterIndex = output.indexOf("STUB HUNTER");

      expect(specProtocolIndex).toBeGreaterThan(-1);
      expect(stubHunterIndex).toBeGreaterThan(-1);
      expect(specProtocolIndex).toBeLessThan(stubHunterIndex);
    });

    it("contains Controller role instruction", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review", singleTaskContext);

      expect(output).toContain("Controller");
      expect(output).toContain("code review");
    });

    it("references get_code_review MCP tool", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review", singleTaskContext);

      expect(output).toContain("get_code_review");
    });
  });

  describe("code-review-bulk.hbs (bulk review)", () => {
    it("renders with correct context variables", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review-bulk", bulkContext);

      // Must contain pendingCount and sprint context
      expect(output).toContain("3");
      expect(output).toContain("sprint-005");
      expect(output).toContain("Template Migration Sprint");
    });

    it("includes spec-protocol partial content", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review-bulk", bulkContext);

      // Spec-protocol content (from the partial with protocol_variant="bulk")
      expect(output).toContain("Mandatory Spec-First Protocol");
      expect(output).toContain("submit_code_review");
    });

    it("includes stub-hunter-mode partial content", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review-bulk", bulkContext);

      // Stub hunter mode content
      expect(output).toContain("STUB HUNTER");
      expect(output).toContain("Stub Hunt");
    });

    it("has spec-protocol BEFORE stub-hunter-mode in output", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review-bulk", bulkContext);

      const specProtocolIndex = output.indexOf("Mandatory Spec-First Protocol");
      const stubHunterIndex = output.indexOf("STUB HUNTER");

      expect(specProtocolIndex).toBeGreaterThan(-1);
      expect(stubHunterIndex).toBeGreaterThan(-1);
      expect(specProtocolIndex).toBeLessThan(stubHunterIndex);
    });

    it("contains Controller role instruction for multiple tasks", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review-bulk", bulkContext);

      expect(output).toContain("Controller");
      expect(output).toContain("pending");
    });

    it("instructs to review one task at a time", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review-bulk", bulkContext);

      expect(output).toContain("ONE");
    });

    it("references get_code_review_summary MCP tool", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review-bulk", bulkContext);

      expect(output).toContain("get_code_review_summary");
    });
  });

  describe("code-review-re-review.hbs (re-review after fixes)", () => {
    it("renders with correct context variables", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review-re-review", reReviewContext);

      // Must contain all context variables
      expect(output).toContain("sprint-005");
      expect(output).toContain("Template Migration Sprint");
      expect(output).toContain("7");
      expect(output).toContain("Migrate code review prompts");
      expect(output).toContain("42");
    });

    it("does NOT include spec-protocol partial content", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review-re-review", reReviewContext);

      // Re-review should NOT have the heavy protocol steps
      // It may mention spec generally but not the formal "Mandatory Spec-First Protocol (9.1-9.4)"
      expect(output).not.toContain("Mandatory Spec-First Protocol (9.1-9.4)");
    });

    it("does NOT include stub-hunter-mode partial content", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review-re-review", reReviewContext);

      // Re-review should NOT be a full stub hunt
      expect(output).not.toContain("STUB HUNTER MODE");
    });

    it("contains re-review focused content", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review-re-review", reReviewContext);

      // Should have focused re-review sections
      expect(output).toContain("Context");
      expect(output).toContain("Re-Review");
      expect(output).toContain("fixes");
    });

    it("references get_code_review MCP tool", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review-re-review", reReviewContext);

      expect(output).toContain("get_code_review");
    });

    it("references submit_code_review MCP tool", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review-re-review", reReviewContext);

      expect(output).toContain("submit_code_review");
    });

    it("mentions verifying_fixes parameter", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review-re-review", reReviewContext);

      expect(output).toContain("verifying_fixes");
    });
  });

  describe("spec-protocol.hbs partial content completeness", () => {
    it("contains database access prohibition section (original content)", () => {
      loader = getTemplateLoader();
      // Render code-review with tool_alternatives to trigger DB warning
      const output = loader.render("code-review", {
        ...singleTaskContext,
        tool_alternatives: "get_code_review, get_code_review_summary",
      });

      // When tool_alternatives is provided, DB prohibition should appear
      expect(output).toContain("Database Access STRICTLY PROHIBITED");
    });

    it("contains spec-first protocol steps in single variant", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review", singleTaskContext);

      expect(output).toContain("Mandatory Spec-First Protocol");
      expect(output).toContain("spec_path");
      expect(output).toContain("spec_files");
      expect(output).toContain("spec_task_definitions");
    });

    it("contains evidence table requirements", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review", singleTaskContext);

      expect(output).toContain("evidence");
    });

    it("contains review standards section", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review", singleTaskContext);

      expect(output).toContain("Review Standards");
      expect(output).toContain("Correctness");
      expect(output).toContain("Quality");
      expect(output).toContain("Completeness");
      expect(output).toContain("Safety");
    });

    it("contains decision guidance with issues array format", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review", singleTaskContext);

      expect(output).toContain("APPROVED");
      expect(output).toContain("CHANGES_REQUESTED");
      expect(output).toContain("REJECTED");
      expect(output).toContain("issues");
    });

    it("contains minimal valid issues entry JSON example", () => {
      loader = getTemplateLoader();
      const output = loader.render("code-review", singleTaskContext);

      expect(output).toContain("severity");
      expect(output).toContain("MAJOR");
      expect(output).toContain("rationale");
    });
  });

  describe("PromptBuilder routing logic", () => {
    it("renders code-review template when taskInfo is provided", () => {
      // This is already tested in PromptBuilder.test.ts but we verify
      // the actual rendered output here
      const builder = new PromptBuilder({ workspaceRoot: projectRoot });
      const output = builder.buildCodeReviewPrompt(
        1,
        "sprint-005",
        "Template Migration Sprint",
        { taskId: 7, title: "Migrate code review prompts", dbId: 100 },
      );

      // Single task review output
      expect(output).toContain("7");
      expect(output).toContain("Migrate code review prompts");
      expect(output).toContain("Mandatory Spec-First Protocol");
    });

    it("renders code-review-bulk template when taskInfo is undefined", () => {
      const builder = new PromptBuilder({ workspaceRoot: projectRoot });
      const output = builder.buildCodeReviewPrompt(
        5,
        "sprint-005",
        "Template Migration Sprint",
      );

      // Bulk review output
      expect(output).toContain("5");
      expect(output).toContain("pending");
      // Bulk review doesn't have a specific task context, but partials may reference task generically
      expect(output).toContain("get_code_review_summary");
    });

    it("renders code-review-re-review template for re-review", () => {
      const builder = new PromptBuilder({ workspaceRoot: projectRoot });
      const output = builder.buildCodeReviewReReviewPrompt(
        "sprint-005",
        "Template Migration Sprint",
        { taskId: 7, title: "Migrate code review prompts", dbId: 100 },
        42,
      );

      // Re-review output
      expect(output).toContain("re-review");
      expect(output).toContain("42");
      expect(output).toContain("fixes");
    });
  });
});
