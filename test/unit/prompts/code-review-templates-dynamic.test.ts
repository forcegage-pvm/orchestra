import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

async function setupTemplates(): Promise<string> {
  const workspaceRoot = path.join(process.cwd(), "extension");
  const src = path.join(workspaceRoot, "templates", "prompts");
  const dest = path.join(workspaceRoot, ".orchestra", "templates", "prompts");

  async function copyWithRetries(
    srcPath: string,
    destPath: string,
  ): Promise<void> {
    const maxAttempts = 6;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await fs.promises.copyFile(srcPath, destPath);
        return;
      } catch (err: any) {
        // Retry on typical transient file locks (EBUSY) or sharing violations
        if ((err && err.code === "EBUSY") || (err && err.code === "EACCES")) {
          // Wait a bit and retry
          await new Promise((r) => setTimeout(r, 50 * attempt));
          continue;
        }
        throw err;
      }
    }
    // Final attempt without catching to propagate error details
    await fs.promises.copyFile(srcPath, destPath);
  }

  async function copyRecursiveAsync(
    srcPath: string,
    destPath: string,
  ): Promise<void> {
    const stat = await fs.promises.stat(srcPath);
    if (stat.isDirectory()) {
      await fs.promises.mkdir(destPath, { recursive: true });
      const entries = await fs.promises.readdir(srcPath);
      for (const entry of entries) {
        await copyRecursiveAsync(
          path.join(srcPath, entry),
          path.join(destPath, entry),
        );
      }
    } else {
      await copyWithRetries(srcPath, destPath);
    }
  }

  await fs.promises.mkdir(dest, { recursive: true });
  const items = await fs.promises.readdir(src);
  for (const item of items) {
    await copyRecursiveAsync(path.join(src, item), path.join(dest, item));
  }
  return workspaceRoot;
}

// Dynamic import test to surface module resolution errors
describe("Dynamic code review template verification", () => {
  it("should import PromptBuilder and verify template-based code review prompts", async () => {
    const workspaceRoot = await setupTemplates();

    // Dynamic imports
    const { PromptBuilder } =
      await import("../../../extension/src/prompts/PromptBuilder.js");
    const { TemplateLoader } =
      await import("../../../extension/src/prompts/TemplateLoader.js");

    const builder = new PromptBuilder({
      templateLoader: new TemplateLoader({ workspaceRoot, devMode: true }),
    });

    // PromptBuilder.buildCodeReviewPrompt with taskInfo dispatches to single-task template
    const singleResult = builder.buildCodeReviewPrompt(1, "s1", "Sprint One", {
      taskId: 42,
      title: "Implement feature X",
      dbId: 101,
    });
    expect(singleResult).toContain("Task 42");
    expect(singleResult).toContain("Implement feature X");
    expect(singleResult).toContain("s1");

    // PromptBuilder.buildCodeReviewPrompt without taskInfo dispatches to bulk template
    const bulkResult = builder.buildCodeReviewPrompt(5, "s1", "Sprint One");
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
