import { describe, it, expect } from "vitest";
import * as path from "path";

// Dynamic import test to surface module resolution errors
describe("Dynamic code review template verification", () => {
  it("should import TemplateLoader and builders and compare outputs", async () => {
    const workspaceRoot = path.join(process.cwd(), "extension");

    // Ensure .orchestra templates exist
    const fs = require("fs");
    const templatesSrc = path.join(workspaceRoot, "templates", "prompts");
    const templatesDest = path.join(workspaceRoot, ".orchestra", "templates", "prompts");
    if (!fs.existsSync(templatesDest)) fs.mkdirSync(templatesDest, { recursive: true });
    const files = fs.readdirSync(templatesSrc);
    for (const file of files) {
      const src = path.join(templatesSrc, file);
      const dest = path.join(templatesDest, file);
      // Copy directories recursively (partials folder)
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(src);
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        for (const e of entries) fs.copyFileSync(path.join(src, e), path.join(dest, e));
      } else {
        fs.copyFileSync(src, dest);
      }
    }

    // Dynamic imports
    const loaderMod = await import("../../extension/src/prompts/TemplateLoader.ts");
    const builders = await import("../../extension/src/prompts/promptTextBuilders.ts");
    const TemplateLoader = loaderMod.TemplateLoader ?? loaderMod.default ?? loaderMod;

    const loader = new TemplateLoader({ workspaceRoot, devMode: true });

    const sprint = { sprint_id: "s1", title: "Sprint One" } as any;
    const task = { task_id: 42, title: "Implement feature X" } as any;

    const templSingle = loader.render("code-review", { sprint, task });
    const buildSingle = builders.buildSingleTaskCodeReviewPromptText(
      sprint.sprint_id,
      sprint.title,
      task.task_id,
      task.title,
    );

    expect(templSingle.replace(/\s+/g, " ").trim()).toBe(buildSingle.replace(/\s+/g, " ").trim());

    const pendingCount = 5;
    const sprintId = "s1";
    const sprintTitle = "Sprint One";

    const templBulk = loader.render("code-review-bulk", { pendingCount, sprint: { sprint_id: sprintId, title: sprintTitle } });
    const buildBulk = builders.buildBulkCodeReviewPromptText(pendingCount, sprintId, sprintTitle);
    expect(templBulk.replace(/\s+/g, " ").trim()).toBe(buildBulk.replace(/\s+/g, " ").trim());

    const templRe = loader.render("code-review-re-review", { sprint: { sprint_id: sprintId, title: sprintTitle }, task: { task_id: 42, title: task.title }, codeReview: { reviewId: 7 } });
    const buildRe = builders.buildCodeReviewReReviewPromptText(sprintId, sprintTitle, { taskId: 42, title: task.title, dbId: 101 }, 7);
    expect(templRe.replace(/\s+/g, " ").trim()).toBe(buildRe.replace(/\s+/g, " ").trim());
  });
});