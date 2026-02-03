/**
 * SprintMemory - persistent cross-task context for orchestrator sessions
 */

import * as crypto from "crypto";
import * as fs from "fs";
import { dump, load } from "js-yaml";
import * as path from "path";
import { AgentError } from "../errors.js";
import {
  ArchitectureDecisionSchema,
  ImplementorPatternSchema,
  SprintMemorySchema,
  TaskSummarySchema,
  type ArchitectureDecision,
  type ImplementorPattern,
  type SprintMemory as SprintMemoryRecord,
  type TaskOutcome,
  type TaskSummary,
} from "./types.js";

const MEMORY_VERSION = "1.0" as const;
export const COMPACTION_THRESHOLD = 5;

export class SprintMemory {
  private static instance: SprintMemory | null = null;

  private workspaceRoot: string;

  private constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  static getInstance(workspaceRoot?: string): SprintMemory {
    if (!SprintMemory.instance) {
      SprintMemory.instance = new SprintMemory(workspaceRoot ?? process.cwd());
      return SprintMemory.instance;
    }

    if (
      workspaceRoot &&
      workspaceRoot !== SprintMemory.instance.workspaceRoot
    ) {
      SprintMemory.instance.workspaceRoot = workspaceRoot;
    }

    return SprintMemory.instance;
  }

  getMemoryDir(): string {
    return path.join(this.workspaceRoot, ".orchestra", "sprint-memory");
  }

  getMemoryPath(sprintId: string): string {
    return path.join(this.getMemoryDir(), `${sprintId}.yaml`);
  }

  async save(memory: SprintMemoryRecord): Promise<void> {
    const parseResult = SprintMemorySchema.safeParse(memory);
    if (!parseResult.success) {
      throw new AgentError(
        "Sprint memory validation failed",
        "SPRINT_MEMORY_INVALID",
        {
          errors: parseResult.error.errors,
        },
      );
    }

    const memoryPath = this.getMemoryPath(parseResult.data.sprintId);
    const tempPath = `${memoryPath}.tmp.${Date.now()}`;

    try {
      await fs.promises.mkdir(this.getMemoryDir(), { recursive: true });
      const yaml = dump(parseResult.data, {
        noRefs: true,
        lineWidth: 120,
      });
      await fs.promises.writeFile(tempPath, yaml, "utf-8");
      await fs.promises.rename(tempPath, memoryPath);
    } catch (error) {
      try {
        await fs.promises.rm(tempPath, { force: true });
      } catch {
        // best-effort cleanup
      }

      throw new AgentError(
        "Failed to save sprint memory",
        "SPRINT_MEMORY_SAVE_FAILED",
        {
          sprintId: memory.sprintId,
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  async load(sprintId: string): Promise<SprintMemoryRecord | null> {
    const memoryPath = this.getMemoryPath(sprintId);

    try {
      const yaml = await fs.promises.readFile(memoryPath, "utf-8");
      const data = load(yaml);

      const parseResult = SprintMemorySchema.safeParse(data);
      if (!parseResult.success) {
        throw new AgentError(
          "Invalid sprint memory data",
          "SPRINT_MEMORY_INVALID",
          {
            sprintId,
            errors: parseResult.error.errors,
          },
        );
      }

      return parseResult.data;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") {
        return null;
      }

      if (error instanceof AgentError) {
        throw error;
      }

      throw new AgentError(
        "Failed to load sprint memory",
        "SPRINT_MEMORY_LOAD_FAILED",
        {
          sprintId,
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  async getOrCreate(
    sprintId: string,
    sprintName: string,
  ): Promise<SprintMemoryRecord> {
    const existing = await this.load(sprintId);
    if (existing) {
      return existing;
    }

    const memory = this.createDefaultMemory(sprintId, sprintName);
    await this.save(memory);
    return memory;
  }

  async addTaskSummary(
    sprintId: string,
    summary: TaskSummary,
  ): Promise<SprintMemoryRecord> {
    const summaryResult = TaskSummarySchema.safeParse(summary);
    if (!summaryResult.success) {
      throw new AgentError(
        "Task summary validation failed",
        "TASK_SUMMARY_INVALID",
        {
          errors: summaryResult.error.errors,
        },
      );
    }

    const memory = await this.load(sprintId);
    if (!memory) {
      throw new AgentError(
        "Sprint memory not found",
        "SPRINT_MEMORY_NOT_FOUND",
        {
          sprintId,
        },
      );
    }

    const updated: SprintMemoryRecord = {
      ...memory,
      taskSummaries: [...memory.taskSummaries, summaryResult.data],
      updatedAt: new Date().toISOString(),
    };

    if (updated.taskSummaries.length >= COMPACTION_THRESHOLD) {
      return this.compact(updated);
    }

    await this.save(updated);
    return updated;
  }

  async addArchitectureDecision(
    sprintId: string,
    decision: ArchitectureDecision,
  ): Promise<SprintMemoryRecord> {
    const decisionResult = ArchitectureDecisionSchema.safeParse(decision);
    if (!decisionResult.success) {
      throw new AgentError(
        "Architecture decision validation failed",
        "SPRINT_MEMORY_INVALID",
        {
          errors: decisionResult.error.errors,
        },
      );
    }

    const memory = await this.load(sprintId);
    if (!memory) {
      throw new AgentError(
        "Sprint memory not found",
        "SPRINT_MEMORY_NOT_FOUND",
        {
          sprintId,
        },
      );
    }

    const updated: SprintMemoryRecord = {
      ...memory,
      architectureDecisions: [
        ...memory.architectureDecisions,
        decisionResult.data,
      ],
      updatedAt: new Date().toISOString(),
    };

    await this.save(updated);
    return updated;
  }

  async addGoal(sprintId: string, goal: string): Promise<SprintMemoryRecord> {
    const memory = await this.load(sprintId);
    if (!memory) {
      throw new AgentError(
        "Sprint memory not found",
        "SPRINT_MEMORY_NOT_FOUND",
        {
          sprintId,
        },
      );
    }

    const updated: SprintMemoryRecord = {
      ...memory,
      goals: [...memory.goals, goal],
      updatedAt: new Date().toISOString(),
    };

    await this.save(updated);
    return updated;
  }

  async addImplementorPattern(
    sprintId: string,
    input: Omit<ImplementorPattern, "id" | "frequency"> & {
      frequency?: number;
    },
  ): Promise<SprintMemoryRecord> {
    const memory = await this.load(sprintId);
    if (!memory) {
      throw new AgentError(
        "Sprint memory not found",
        "SPRINT_MEMORY_NOT_FOUND",
        {
          sprintId,
        },
      );
    }

    const patternCandidate: ImplementorPattern = {
      id: crypto.randomUUID(),
      pattern: input.pattern,
      description: input.description,
      taskId: input.taskId,
      example: input.example,
      frequency: input.frequency ?? 1,
    };

    const patternResult = ImplementorPatternSchema.safeParse(patternCandidate);
    if (!patternResult.success) {
      throw new AgentError(
        "Implementor pattern validation failed",
        "SPRINT_MEMORY_INVALID",
        {
          errors: patternResult.error.errors,
        },
      );
    }

    const updated: SprintMemoryRecord = {
      ...memory,
      implementorPatterns: [...memory.implementorPatterns, patternResult.data],
      updatedAt: new Date().toISOString(),
    };

    await this.save(updated);
    return updated;
  }

  async compact(memory: SprintMemoryRecord): Promise<SprintMemoryRecord> {
    if (memory.taskSummaries.length < COMPACTION_THRESHOLD) {
      return memory;
    }

    const now = new Date().toISOString();
    const summary = this.summarizeTaskSummaries(memory.taskSummaries);

    const compacted: SprintMemoryRecord = {
      ...memory,
      taskSummaries: [summary],
      compactionCount: memory.compactionCount + 1,
      lastCompactedAt: now,
      updatedAt: now,
    };

    await this.save(compacted);
    return compacted;
  }

  private createDefaultMemory(
    sprintId: string,
    sprintName: string,
  ): SprintMemoryRecord {
    const now = new Date().toISOString();

    return {
      version: MEMORY_VERSION,
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
    };
  }

  private summarizeTaskSummaries(taskSummaries: TaskSummary[]): TaskSummary {
    const outcomes = taskSummaries.map((summary) => summary.outcome);
    const outcome: TaskOutcome = outcomes.includes("failed")
      ? "failed"
      : outcomes.includes("escalated")
        ? "failed"
        : outcomes.includes("partial")
          ? "partial"
          : "success";

    const attemptCount = taskSummaries.reduce(
      (total, summary) => total + summary.attemptCount,
      0,
    );

    const uniqueStrings = (values: string[]): string[] =>
      Array.from(new Set(values));

    const lessonsLearned = uniqueStrings(
      taskSummaries.flatMap((summary) => summary.lessonsLearned),
    );
    const issuesEncountered = uniqueStrings(
      taskSummaries.flatMap((summary) => summary.issuesEncountered),
    );
    const filesCreated = uniqueStrings(
      taskSummaries.flatMap((summary) => summary.filesCreated),
    );
    const filesModified = uniqueStrings(
      taskSummaries.flatMap((summary) => summary.filesModified),
    );
    const filesDeleted = uniqueStrings(
      taskSummaries.flatMap((summary) => summary.filesDeleted),
    );

    const lastCompletedAt = taskSummaries
      .map((summary) => summary.completedAt)
      .sort()
      .at(-1);

    const maxTaskId = Math.max(
      ...taskSummaries.map((summary) => summary.taskId),
    );

    return TaskSummarySchema.parse({
      taskId: maxTaskId,
      title: `Summary of ${taskSummaries.length} tasks`,
      outcome,
      attemptCount,
      description: taskSummaries
        .map((summary) => `#${summary.taskId}: ${summary.title}`)
        .join(" | "),
      lessonsLearned,
      issuesEncountered,
      filesCreated,
      filesModified,
      filesDeleted,
      completedAt: lastCompletedAt ?? new Date().toISOString(),
    });
  }
}
