/**
 * SprintMemory - persistent cross-task context for orchestrator sessions
 */

import * as fs from "fs";
import * as path from "path";
import { dump, load } from "js-yaml";
import { AgentError } from "../errors.js";
import {
  ArchitectureDecisionSchema,
  SprintMemorySchema,
  TaskSummarySchema,
  type ArchitectureDecision,
  type SprintMemory as SprintMemoryRecord,
  type TaskSummary,
} from "./types.js";

const MEMORY_VERSION = "1.0" as const;

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

    if (workspaceRoot && workspaceRoot !== SprintMemory.instance.workspaceRoot) {
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
      throw new AgentError("Sprint memory validation failed", "SPRINT_MEMORY_INVALID", {
        errors: parseResult.error.errors,
      });
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

      throw new AgentError("Failed to save sprint memory", "SPRINT_MEMORY_SAVE_FAILED", {
        sprintId: memory.sprintId,
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async load(sprintId: string): Promise<SprintMemoryRecord | null> {
    const memoryPath = this.getMemoryPath(sprintId);

    try {
      const yaml = await fs.promises.readFile(memoryPath, "utf-8");
      const data = load(yaml);

      const parseResult = SprintMemorySchema.safeParse(data);
      if (!parseResult.success) {
        throw new AgentError("Invalid sprint memory data", "SPRINT_MEMORY_INVALID", {
          sprintId,
          errors: parseResult.error.errors,
        });
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

      throw new AgentError("Failed to load sprint memory", "SPRINT_MEMORY_LOAD_FAILED", {
        sprintId,
        originalError: error instanceof Error ? error.message : String(error),
      });
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
      throw new AgentError("Task summary validation failed", "TASK_SUMMARY_INVALID", {
        errors: summaryResult.error.errors,
      });
    }

    const memory = await this.load(sprintId);
    if (!memory) {
      throw new AgentError("Sprint memory not found", "SPRINT_MEMORY_NOT_FOUND", {
        sprintId,
      });
    }

    const updated: SprintMemoryRecord = {
      ...memory,
      taskSummaries: [...memory.taskSummaries, summaryResult.data],
      updatedAt: new Date().toISOString(),
    };

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
      throw new AgentError("Sprint memory not found", "SPRINT_MEMORY_NOT_FOUND", {
        sprintId,
      });
    }

    const updated: SprintMemoryRecord = {
      ...memory,
      architectureDecisions: [...memory.architectureDecisions, decisionResult.data],
      updatedAt: new Date().toISOString(),
    };

    await this.save(updated);
    return updated;
  }

  async addGoal(sprintId: string, goal: string): Promise<SprintMemoryRecord> {
    const memory = await this.load(sprintId);
    if (!memory) {
      throw new AgentError("Sprint memory not found", "SPRINT_MEMORY_NOT_FOUND", {
        sprintId,
      });
    }

    const updated: SprintMemoryRecord = {
      ...memory,
      goals: [...memory.goals, goal],
      updatedAt: new Date().toISOString(),
    };

    await this.save(updated);
    return updated;
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
}
