/**
 * Spec Traceability Workflow Integration Tests
 *
 * Covers configure_sprint → get_sprint_status → get_task_for_review → submit_code_review
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "../../src/db/index.js";
import { handleConfigureSprint } from "../../src/mcp-server/handlers/configure-sprint.js";
import { handleGetSprintStatus } from "../../src/mcp-server/handlers/get-sprint-status.js";
import { handleGetTaskForReview } from "../../src/mcp-server/handlers/get-task-for-review.js";
import { handleSubmitCodeReview } from "../../src/mcp-server/handlers/submit-code-review.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

const { codeReviewIssues, sprints, tasks } = schema;

const specPath = "specs/traceability-spec.md";

function findSpecPath(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSpecPath(item);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.spec_path === "string") {
    return record.spec_path;
  }

  for (const child of Object.values(record)) {
    const found = findSpecPath(child);
    if (found) return found;
  }

  return null;
}

describe("Spec traceability workflow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("spec-trace-");

    const fullSpecPath = path.join(tempDir, specPath);
    fs.mkdirSync(path.dirname(fullSpecPath), { recursive: true });
    fs.writeFileSync(
      fullSpecPath,
      [
        "### T001 — User authentication",
        "#### Acceptance",
        "- [ ] Users can sign in with email and password",
        "- [ ] Invalid credentials show an error",
        "",
        "### T002 — Audit logging",
        "#### Acceptance",
        "- [ ] Sign-in attempts are logged",
        "",
      ].join("\n"),
      "utf-8",
    );
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  it("should round-trip spec traceability data", async () => {
    const configureResult = await handleConfigureSprint({
      environment: {
        test_command: "npm test",
        test_file_pattern: "test/**/*.test.ts",
        source_base_dir: ".",
      },
      sprint: {
        id: "spec-trace-sprint-1",
        name: "Spec Traceability Sprint",
        spec_path: specPath,
      },
      phases: [
        {
          phase_id: "phase-1",
          phase_name: "Phase 1",
          speckit_tasks: ["T001", "T002"],
        },
      ],
      tasks: [
        {
          task_id: 1,
          phase_id: "phase-1",
          title: "Implement auth and logging",
          description: "Implements auth and logging per spec",
          category: "INFRASTRUCTURE",
          dependencies: [],
          speckit_task_ref: "T001, T002",
          verification: {
            structural_checks: [
              {
                description: "File exists",
                severity: "MAJOR",
                path: "src/feature.ts",
                pattern: ".*",
                min_matches: 1,
              },
            ],
          },
        },
      ],
    });

    const configureOutput = JSON.parse(
      (configureResult.content[0] as { text: string }).text,
    );
    expect(configureOutput.success).toBe(true);

    const db = getDb();
    const [sprintRow] = await db
      .select()
      .from(sprints)
      .where(eq(sprints.id, "spec-trace-sprint-1"));

    expect(sprintRow).toBeDefined();
    expect(sprintRow?.spec_path).toBe(specPath);

    const statusResult = await handleGetSprintStatus({});
    const statusOutput = JSON.parse(
      (statusResult.content[0] as { text: string }).text,
    );

    expect(findSpecPath(statusOutput)).toBe(specPath);

    const taskForReviewResult = await handleGetTaskForReview({ task_id: 1 });
    const taskForReviewOutput = JSON.parse(
      (taskForReviewResult.content[0] as { text: string }).text,
    );

    expect(taskForReviewOutput.success).toBe(true);
    expect(taskForReviewOutput.spec_path).toBe(specPath);
    expect(taskForReviewOutput.spec_task_definitions).toHaveLength(2);

    const definitionsById = new Map(
      taskForReviewOutput.spec_task_definitions.map(
        (definition: {
          id: string;
          title: string;
          type: string;
          acceptance_criteria: string[];
        }) => [definition.id, definition],
      ),
    );

    expect(definitionsById.get("T001")?.title).toBe("User authentication");
    expect(definitionsById.get("T001")?.type).toBe("implementation");
    expect(definitionsById.get("T001")?.acceptance_criteria).toEqual([
      "Users can sign in with email and password",
      "Invalid credentials show an error",
    ]);
    expect(definitionsById.get("T002")?.title).toBe("Audit logging");

    const [taskRow] = await db.select().from(tasks).where(eq(tasks.task_id, 1));

    expect(taskRow).toBeDefined();

    const reviewResult = await handleSubmitCodeReview({
      task: 1,
      decision: "CHANGES_REQUESTED",
      summary: "Spec traceability review found a gap",
      risk: "MEDIUM",
      files_reviewed: ["src/feature.ts"],
      tests_run: ["npm test"],
      issues: [
        {
          severity: "MAJOR",
          issue: "Missing audit logging for failed sign-ins",
          spec_ref: "T002",
          rationale: "Spec requires all sign-in attempts to be logged",
        },
      ],
    });

    const reviewOutput = JSON.parse(
      (reviewResult.content[0] as { text: string }).text,
    );
    expect(reviewOutput.success).toBe(true);
    expect(reviewOutput.status).toBe("CHANGES_REQUESTED");

    const storedIssues = await db
      .select()
      .from(codeReviewIssues)
      .where(eq(codeReviewIssues.task_id, taskRow.id));

    expect(storedIssues).toHaveLength(1);
    expect(storedIssues[0]?.spec_ref).toBe("T002");
  });
});
