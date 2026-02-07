import { describe, expect, it } from "vitest";
import { PromptBuilder } from "../../extension/src/prompts/PromptBuilder.js";
import { TemplateLoader } from "../../extension/src/prompts/TemplateLoader.js";
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

describe("Code review fix templates", () => {
  const workspaceRoot = setupTemplates();
  const builder = new PromptBuilder({
    templateLoader: new TemplateLoader({ workspaceRoot, devMode: true }),
  });

  it("renders code-review-fix prompt with openIssueCount and sprint info", () => {
    const output = builder.buildCodeReviewFixPrompt(3, "sprint-01", "Sprint One");
    expect(output).toContain("3 open code review issue(s)");
    expect(output).toContain("sprint-01");
    expect(output).toContain("Sprint One");
  });

  it("renders code-review-fix-prepare with formatted status and optional summary", () => {
    const context = { workspace: { id: "w1" }, other: "value" } as any;
const review = { status: "CHANGES_REQUESTED", summary: "Please fix the thing" } as any;
    const output = builder.buildCodeReviewFixPreparePrompt(context, review);
    console.log('DEBUG PREPARE OUTPUT:\n' + output);
    expect(output).toContain("Changes requested");
    expect(output).toContain("Please fix the thing");
  });

  it("renders code-review-fix-implement with formatted status and no summary", () => {    const context = { workspace: { id: "w1" }, other: "value" } as any;
    const review = { status: "APPROVED" } as any;
    const output = builder.buildCodeReviewFixImplementPrompt(context, review);
    expect(output).toContain("Approved");
    // When no summary provided, ensure the review summary section is not rendered
    expect(output).not.toContain("Review summary:");  });
});
