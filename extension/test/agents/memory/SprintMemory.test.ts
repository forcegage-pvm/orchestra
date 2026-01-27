/**
 * Unit tests for SprintMemory
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { SprintMemory } from "../../../src/agents/memory/SprintMemory.js";
import {
  ArchitectureDecisionSchema,
  SprintMemorySchema,
  TaskSummarySchema,
  type SprintMemory as SprintMemoryRecord,
} from "../../../src/agents/memory/types.js";

const createMemoryRecord = (
  sprintId: string,
  sprintName: string,
): SprintMemoryRecord => {
  const now = new Date().toISOString();
  return SprintMemorySchema.parse({
    version: "1.0",
    sprintId,
    sprintName,
    goals: [],
    architectureDecisions: [],
    taskSummaries: [],
    implementorPatterns: [],
    compactionCount: 0,
    lastCompactedAt: null,
    createdAt: now,
    updatedAt: now,
  });
};

describe("SprintMemory", () => {
  let tempDir: string;
  let memoryStore: SprintMemory;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-memory-"));
    memoryStore = SprintMemory.getInstance(tempDir);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("save() writes YAML to correct path", async () => {
    const memory = createMemoryRecord("sprint-001", "Sprint One");

    await memoryStore.save(memory);

    const memoryPath = memoryStore.getMemoryPath("sprint-001");
    expect(fs.existsSync(memoryPath)).toBe(true);
    const yaml = fs.readFileSync(memoryPath, "utf-8");
    expect(yaml).toMatch(/sprintId: sprint-001/);
  });

  test("load() reads and parses YAML", async () => {
    const memory = createMemoryRecord("sprint-002", "Sprint Two");
    await memoryStore.save(memory);

    const loaded = await memoryStore.load("sprint-002");

    expect(loaded).not.toBeNull();
    if (loaded) {
      expect(loaded.sprintId).toBe("sprint-002");
      expect(loaded.sprintName).toBe("Sprint Two");
    }
  });

  test("load() returns null for non-existent sprint", async () => {
    const loaded = await memoryStore.load("missing-sprint");
    expect(loaded).toBeNull();
  });

  test("getOrCreate() creates new memory with defaults", async () => {
    const memory = await memoryStore.getOrCreate("sprint-003", "Sprint Three");

    expect(memory.sprintId).toBe("sprint-003");
    expect(memory.goals).toEqual([]);
    expect(memory.architectureDecisions).toEqual([]);
    expect(memory.taskSummaries).toEqual([]);
    expect(memory.implementorPatterns).toEqual([]);
    expect(memory.compactionCount).toBe(0);
  });

  test("addTaskSummary() appends to taskSummaries and saves", async () => {
    await memoryStore.getOrCreate("sprint-004", "Sprint Four");

    const summary = TaskSummarySchema.parse({
      taskId: 12,
      title: "Implement feature",
      outcome: "success",
      attemptCount: 1,
      description: "Implemented feature",
      lessonsLearned: ["Stay organized"],
      issuesEncountered: [],
      filesCreated: ["src/new.ts"],
      filesModified: [],
      filesDeleted: [],
      completedAt: new Date().toISOString(),
    });

    const updated = await memoryStore.addTaskSummary("sprint-004", summary);

    expect(updated.taskSummaries).toHaveLength(1);
    expect(updated.taskSummaries[0]?.taskId).toBe(12);

    const loaded = await memoryStore.load("sprint-004");
    expect(loaded?.taskSummaries).toHaveLength(1);
  });

  test("addArchitectureDecision() appends to architectureDecisions and saves", async () => {
    await memoryStore.getOrCreate("sprint-005", "Sprint Five");

    const decision = ArchitectureDecisionSchema.parse({
      id: crypto.randomUUID(),
      title: "Adopt new API",
      decision: "Use new storage API",
      rationale: "Improves stability",
      taskId: 33,
      createdAt: new Date().toISOString(),
    });

    const updated = await memoryStore.addArchitectureDecision(
      "sprint-005",
      decision,
    );

    expect(updated.architectureDecisions).toHaveLength(1);
    expect(updated.architectureDecisions[0]?.title).toBe("Adopt new API");

    const loaded = await memoryStore.load("sprint-005");
    expect(loaded?.architectureDecisions).toHaveLength(1);
  });

  test("SprintMemorySchema rejects invalid data", () => {
    const result = SprintMemorySchema.safeParse({
      sprintId: "sprint-006",
      sprintName: "Sprint Six",
    });

    expect(result.success).toBe(false);
  });
});
