import { describe, expect, it } from "vitest";
import path from "path";
import fs from "fs";

function setupTemplates(): string {
  const workspaceRoot = path.join(process.cwd(), "extension");
  const src = path.join(workspaceRoot, "templates", "prompts");
  const dest = path.join(workspaceRoot, ".orchestra", "templates", "prompts");

  function copyRecursiveSync(srcPath: string, destPath: string): void {
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
      const entries = fs.readdirSync(srcPath);
      for (const entry of entries) {
        copyRecursiveSync(path.join(srcPath, entry), path.join(destPath, entry));
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const items = fs.readdirSync(src);
  for (const item of items) {
    copyRecursiveSync(path.join(src, item), path.join(dest, item));
  }
  return workspaceRoot;
}

// Dynamic import test to surface module resolution errors
describe("Dynamic code review template verification", () => {
  it("should import PromptBuilder and verify template-based code review prompts", async () => {
    const workspaceRoot = setupTemplates();

    // Dynamic imports
    const { PromptBuilder } = await import(
      "../../extension/src/prompts/PromptBuilder.js"
    );
    const { TemplateLoader } = await import(
      "../../extension/src/prompts/TemplateLoader.js"
    );

    const builder = new PromptBuilder({
      templateLoader: new TemplateLoader({ workspaceRoot, devMode: true }),
    });

    // PromptBuilder.buildCodeReviewPrompt with taskInfo dispatches to single-task template
    const singleResult = builder.buildCodeReviewPrompt(
      1,
      "s1",
      "Sprint One",
      { taskId: 42, title: "Implement feature X", dbId: 101 },
    );
    expect(singleResult).toContain("Task 42");
    expect(singleResult).toContain("Implement feature X");
    expect(singleResult).toContain("s1");

    // PromptBuilder.buildCodeReviewPrompt without taskInfo dispatches to bulk template
    const bulkResult = builder.buildCodeReviewPrompt(
      5,
      "s1",
      "Sprint One",
    );
    expect(bulkResult).toContain("5 pending task(s)");
    expect(bulkResult).toContain("s1");

    // Re-review builder
    const reResult = builder.buildCodeReviewReReviewPrompt(
      "s1",
      "Sprint One",
      { taskId: 42, title: "Implement feature X", dbId: 101 },
      7,
    );
    expect(reResult).toContain("re-review");
    expect(reResult).toContain("Task 42");
    expect(reResult).toContain("Review ID");
  });
});
