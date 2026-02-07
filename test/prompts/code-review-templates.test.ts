import { describe, it, expect } from "vitest";
import { TemplateLoader } from "../../extension/src/prompts/TemplateLoader.ts";
import * as builders from "../../extension/src/prompts/promptTextBuilders.ts";import * as path from "path";
// These tests verify that the rendered templates match the original text builders

describe("Code review template equivalence", () => {
  const workspaceRoot = path.join(process.cwd(), "extension");
  const templatesSrc = path.join(workspaceRoot, "templates", "prompts");
  const templatesDest = path.join(workspaceRoot, ".orchestra", "templates", "prompts");

  // Ensure .orchestra templates exist for TemplateLoader
  beforeAll(() => {
    const fs = require("fs");
    const { mkdirSync, existsSync, copyFileSync, readdirSync } = fs;
    if (!existsSync(templatesDest)) {
      mkdirSync(templatesDest, { recursive: true });
    }

    const files = readdirSync(templatesSrc);
    for (const file of files) {
      const src = path.join(templatesSrc, file);
      const dest = path.join(templatesDest, file);
      copyFileSync(src, dest);
    }
  });

let loader: any;
  beforeAll(() => {
    loader = new TemplateLoader({ workspaceRoot, devMode: true });
  });  it("renders single task code-review template equal to builder", () => {
    const sprint = { sprint_id: "s1", title: "Sprint One" } as any;
    const task = { task_id: 42, title: "Implement feature X" } as any;

    const templateOutput = loader.render("code-review", { sprint, task });
    const builderOutput = builders.buildSingleTaskCodeReviewPromptText(
      sprint.sprint_id,
      sprint.title,
      task.task_id,
      task.title,
    );

    // Normalize whitespace for fair comparison
    expect(templateOutput.replace(/\s+/g, " ").trim()).toBe(
      builderOutput.replace(/\s+/g, " ").trim(),
    );
  });

  it("renders bulk code-review template equal to builder", () => {
    const pendingCount = 5;
    const sprintId = "s1";
    const sprintTitle = "Sprint One";

    const templateOutput = loader.render("code-review-bulk", {
      pendingCount,
      sprint: { sprint_id: sprintId, title: sprintTitle },
    });

    const builderOutput = builders.buildBulkCodeReviewPromptText(
      pendingCount,
      sprintId,
      sprintTitle,
    );

    expect(templateOutput.replace(/\s+/g, " ").trim()).toBe(
      builderOutput.replace(/\s+/g, " ").trim(),
    );
  });

  it("renders re-review template equal to builder", () => {
    const sprintId = "s1";
    const sprintTitle = "Sprint One";
    const taskInfo = { taskId: 42, title: "Implement feature X", dbId: 101 } as any;
    const reviewId = 7;

    const templateOutput = loader.render("code-review-re-review", {
      sprint: { sprint_id: sprintId, title: sprintTitle },
      task: { task_id: taskInfo.taskId, title: taskInfo.title },
      codeReview: { reviewId },
    });

    const builderOutput = builders.buildCodeReviewReReviewPromptText(
      sprintId,
      sprintTitle,
      taskInfo,
      reviewId,
    );

    expect(templateOutput.replace(/\s+/g, " ").trim()).toBe(
      builderOutput.replace(/\s+/g, " ").trim(),
    );
  });
});