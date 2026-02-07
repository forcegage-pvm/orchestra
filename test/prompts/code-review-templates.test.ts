import { describe, expect, it } from "vitest";
import { PromptBuilder } from "../../extension/src/prompts/PromptBuilder.js";
import { TemplateLoader } from "../../extension/src/prompts/TemplateLoader.js";
import path from "path";
import fs from "fs";

// Copy templates to runtime location for TemplateLoader
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

describe("Code review template equivalence", () => {
  const workspaceRoot = setupTemplates();
  const builder = new PromptBuilder({
    templateLoader: new TemplateLoader({ workspaceRoot, devMode: true }),
  });

  it("renders single task code-review via PromptBuilder.buildCodeReviewPrompt with taskInfo", () => {
    const output = builder.buildCodeReviewPrompt(
      1,
      "s1",
      "Sprint One",
      { taskId: 42, title: "Implement feature X", dbId: 101 },
    );

    expect(output).toContain("Task 42");
    expect(output).toContain("Implement feature X");
    expect(output).toContain("s1");
    expect(output).toContain("Sprint One");
  });

  it("renders bulk code-review via PromptBuilder.buildCodeReviewPrompt without taskInfo", () => {
    const output = builder.buildCodeReviewPrompt(
      5,
      "s1",
      "Sprint One",
    );

    expect(output).toContain("5 pending task(s)");
    expect(output).toContain("s1");
    expect(output).toContain("Sprint One");
  });

  it("renders re-review template via PromptBuilder.buildCodeReviewReReviewPrompt", () => {
    const output = builder.buildCodeReviewReReviewPrompt(
      "s1",
      "Sprint One",
      { taskId: 42, title: "Implement feature X", dbId: 101 },
      7,
    );

    expect(output).toContain("re-review");
    expect(output).toContain("Task 42");
    expect(output).toContain("Review ID");
    expect(output).toContain("Sprint One");
  });
});
