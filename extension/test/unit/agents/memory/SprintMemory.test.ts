/**
 * Unit tests for SprintMemory
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SprintMemory } from "../../../../src/agents/memory/SprintMemory.js";
import {
  ArchitectureDecisionSchema,
  SprintMemorySchema,
  TaskSummarySchema,
  type SprintMemory as SprintMemoryRecord,
} from "../../../../src/agents/memory/types.js";

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
    vi.restoreAllMocks();
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

  test("addImplementorPattern() appends patterns", async () => {
    await memoryStore.getOrCreate("sprint-007", "Sprint Seven");

    const updated = await memoryStore.addImplementorPattern("sprint-007", {
      pattern: "positive",
      description: "Clear acceptance criteria",
      taskId: 7,
      example: "List criteria up front",
    });

    expect(updated.implementorPatterns).toHaveLength(1);
    expect(updated.implementorPatterns[0]?.pattern).toBe("positive");

    const loaded = await memoryStore.load("sprint-007");
    expect(loaded?.implementorPatterns).toHaveLength(1);
  });

  test("addTaskSummary() throws when sprint memory missing", async () => {
    const summary = TaskSummarySchema.parse({
      taskId: 21,
      title: "Missing sprint",
      outcome: "failed",
      attemptCount: 1,
      description: "Sprint does not exist",
      lessonsLearned: [],
      issuesEncountered: [],
      filesCreated: [],
      filesModified: [],
      filesDeleted: [],
      completedAt: new Date().toISOString(),
    });

    await expect(
      memoryStore.addTaskSummary("missing-sprint", summary),
    ).rejects.toThrow(/Sprint memory not found/);
  });

  test("addArchitectureDecision() throws when sprint memory missing", async () => {
    const decision = ArchitectureDecisionSchema.parse({
      id: crypto.randomUUID(),
      title: "Missing sprint",
      decision: "No sprint record",
      rationale: "Not created",
      taskId: 51,
      createdAt: new Date().toISOString(),
    });

    await expect(
      memoryStore.addArchitectureDecision("missing-sprint", decision),
    ).rejects.toThrow(/Sprint memory not found/);
  });

  test("addImplementorPattern() throws when sprint memory missing", async () => {
    await expect(
      memoryStore.addImplementorPattern("missing-sprint", {
        pattern: "negative",
        description: "Missing sprint",
        taskId: 8,
      }),
    ).rejects.toThrow(/Sprint memory not found/);
  });

  test("load() throws on invalid sprint memory data", async () => {
    const memoryPath = memoryStore.getMemoryPath("invalid-sprint");
    await fs.promises.mkdir(path.dirname(memoryPath), { recursive: true });
    await fs.promises.writeFile(
      memoryPath,
      "sprintId: invalid-sprint",
      "utf-8",
    );

    await expect(memoryStore.load("invalid-sprint")).rejects.toThrow(
      /Invalid sprint memory data/,
    );
  });

  test("save() throws when write fails", async () => {
    const memory = createMemoryRecord("sprint-009", "Sprint Nine");
    vi.spyOn(fs.promises, "writeFile").mockRejectedValueOnce(
      new Error("disk full"),
    );

    await expect(memoryStore.save(memory)).rejects.toThrow(
      /Failed to save sprint memory/,
    );
  });

  test("compact() summarizes after five task summaries", async () => {
    await memoryStore.getOrCreate("sprint-008", "Sprint Eight");

    for (let index = 1; index <= 5; index += 1) {
      const summary = TaskSummarySchema.parse({
        taskId: index,
        title: `Task ${index}`,
        outcome: "success",
        attemptCount: 1,
        description: `Completed task ${index}`,
        lessonsLearned: [],
        issuesEncountered: [],
        filesCreated: [],
        filesModified: [],
        filesDeleted: [],
        completedAt: new Date().toISOString(),
      });

      await memoryStore.addTaskSummary("sprint-008", summary);
    }

    const loaded = await memoryStore.load("sprint-008");
    expect(loaded?.taskSummaries).toHaveLength(1);
    expect(loaded?.compactionCount).toBe(1);
    expect(loaded?.lastCompactedAt).not.toBeNull();

    const compactedSummary = loaded?.taskSummaries[0];
    if (compactedSummary) {
      expect(compactedSummary.title).toMatch(/Summary of 5 tasks/);
    }
  });
});
