/**
 * Tests for get_sprint_status handler
 *
 * Tests verify:
 * 1. Basic sprint status output structure
 * 2. TDD summary computation with status breakdown
 * 3. blocking_closeout flag logic
 * 4. Orphaned green_task_id detection
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, getRawDb } from "../../../src/db/index.js";
import {
  phases,
  sprints,
  tasks,
  tddTaskRelationships,
} from "../../../src/db/schema.js";
import { handleGetSprintStatus } from "../../../src/mcp-server/handlers/get-sprint-status.js";
import { cleanupTestDb, setupTestDb } from "../../setup/db-cache.js";

describe("get_sprint_status handler", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("get-sprint-status-test-");
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  describe("basic sprint status", () => {
    it("should return sprint status without TDD summary when no registry entries", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create sprint
      const [sprint] = await db
        .insert(sprints)
        .values({
          id: "sprint-001",
          name: "Test Sprint",
          spec_path: "specs/004-controller-agent/overview.md",
          spec_version: "v0.7.0",
          spec_hash: "abc123",
          workflow_step: "IMPLEMENT",
          is_active: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create phase
      const [phase] = await db
        .insert(phases)
        .values({
          sprint_id: sprint.id,
          phase_id: "phase-1",
          phase_name: "Phase 1",
          speckit_tasks: "[]",
          order: 1,
        })
        .returning();

      // Create task
      await db.insert(tasks).values({
        sprint_id: sprint.id,
        phase_id: phase.id,
        task_id: 1,
        title: "Task 1",
        description: "Description",
        category: "FEATURE",
        dependencies: "[]",
        status: "PENDING",
        created_at: now,
        updated_at: now,
      });

      // Call handler
      const result = await handleGetSprintStatus({});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const output = JSON.parse(result.content[0].text);

      expect(output).toMatchObject({
        sprint_id: "sprint-001",
        name: "Test Sprint",
        spec_path: "specs/004-controller-agent/overview.md",
        spec_version: "v0.7.0",
        spec_hash: "abc123",
        status: "ACTIVE",
        summary: {
          total_tasks: 1,
          completed: 0,
          in_progress: 0,
          pending: 1,
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
            status: "PENDING",
            task_count: 1,
            completed_count: 0,
          },
        ],
      });

      // tdd_summary should be undefined when no registry entries
      expect(output.tdd_summary).toBeUndefined();
    });
  });

  describe("TDD summary", () => {
    it("should include TDD summary with status breakdown when relationships exist", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create sprint
      const [sprint] = await db
        .insert(sprints)
        .values({
          id: "sprint-001",
          name: "Test Sprint",
          workflow_step: "IMPLEMENT",
          is_active: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create phase
      const [phase] = await db
        .insert(phases)
        .values({
          sprint_id: sprint.id,
          phase_id: "phase-1",
          phase_name: "Phase 1",
          speckit_tasks: "[]",
          order: 1,
        })
        .returning();

      // Create red tasks
      const [redTask1] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 1,
          title: "Red Task 1",
          description: "TDD red task",
          category: "FEATURE",
          dependencies: "[]",
          status: "COMPLETE",
          tdd_red_phase: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      const [redTask2] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 2,
          title: "Red Task 2",
          description: "TDD red task",
          category: "FEATURE",
          dependencies: "[]",
          status: "COMPLETE",
          tdd_red_phase: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      const [greenTask1] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 3,
          title: "Green Task 1",
          description: "TDD green task",
          category: "FEATURE",
          dependencies: "[]",
          status: "COMPLETE",
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        })
        .returning();

      const [greenTask2] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 4,
          title: "Green Task 2",
          description: "TDD green task",
          category: "FEATURE",
          dependencies: "[]",
          status: "IMPLEMENT",
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create TDD task relationships:
      // - 2 completed (green)
      // - 1 pending (pending_green)
      await db.insert(tddTaskRelationships).values([
        {
          sprint_id: sprint.id,
          red_task_id: redTask1.id,
          green_task_id: greenTask1.id,
          declared_at: "configure_sprint",
          created_at: now,
          completed_at: now, // Completed - GREEN
        },
        {
          sprint_id: sprint.id,
          red_task_id: redTask1.id,
          green_task_id: greenTask2.id,
          declared_at: "configure_sprint",
          created_at: now,
          completed_at: null, // Not completed - PENDING_GREEN
        },
        {
          sprint_id: sprint.id,
          red_task_id: redTask2.id,
          green_task_id: greenTask1.id,
          declared_at: "configure_sprint",
          created_at: now,
          completed_at: now, // Completed - GREEN
        },
      ]);

      // Call handler
      const result = await handleGetSprintStatus({});

      expect(result.content).toHaveLength(1);
      const output = JSON.parse(result.content[0].text);

      expect(output.tdd_summary).toMatchObject({
        total: 3,
        by_status: {
          registered: 0,
          validated: 0,
          pending_green: 1,
          green: 2,
        },
        blocking_closeout: true, // Should be true because 1 relationship is pending
        orphaned_count: 0,
      });
    });

    it("should set blocking_closeout to false when all relationships are completed", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create sprint
      const [sprint] = await db
        .insert(sprints)
        .values({
          id: "sprint-001",
          name: "Test Sprint",
          workflow_step: "IMPLEMENT",
          is_active: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create phase
      const [phase] = await db
        .insert(phases)
        .values({
          sprint_id: sprint.id,
          phase_id: "phase-1",
          phase_name: "Phase 1",
          speckit_tasks: "[]",
          order: 1,
        })
        .returning();

      // Create tasks
      const [redTask] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 1,
          title: "Red Task",
          description: "TDD red task",
          category: "FEATURE",
          dependencies: "[]",
          status: "COMPLETE",
          tdd_red_phase: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      const [greenTask1] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 2,
          title: "Green Task 1",
          description: "TDD green task 1",
          category: "FEATURE",
          dependencies: "[]",
          status: "COMPLETE",
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        })
        .returning();

      const [greenTask2] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 3,
          title: "Green Task 2",
          description: "TDD green task 2",
          category: "FEATURE",
          dependencies: "[]",
          status: "COMPLETE",
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create relationships - all completed (completed_at set)
      await db.insert(tddTaskRelationships).values([
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          green_task_id: greenTask1.id,
          declared_at: "configure_sprint",
          created_at: now,
          completed_at: now, // Completed
        },
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          green_task_id: greenTask2.id,
          declared_at: "complete_task",
          created_at: now,
          completed_at: now, // Completed
        },
      ]);

      // Call handler
      const result = await handleGetSprintStatus({});

      expect(result.content).toHaveLength(1);
      const output = JSON.parse(result.content[0].text);

      expect(output.tdd_summary).toMatchObject({
        total: 2,
        by_status: {
          registered: 0,
          validated: 0,
          pending_green: 0,
          green: 2,
        },
        blocking_closeout: false, // All relationships are completed
        orphaned_count: 0,
      });
    });

    it("should detect orphaned green_task_id entries", async () => {
      const db = getDb();
      const rawDb = getRawDb();
      const now = new Date().toISOString();

      // Create sprint
      const [sprint] = await db
        .insert(sprints)
        .values({
          id: "sprint-001",
          name: "Test Sprint",
          workflow_step: "IMPLEMENT",
          is_active: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create phase
      const [phase] = await db
        .insert(phases)
        .values({
          sprint_id: sprint.id,
          phase_id: "phase-1",
          phase_name: "Phase 1",
          speckit_tasks: "[]",
          order: 1,
        })
        .returning();

      // Create red task
      const [redTask] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 1,
          title: "Red Task",
          description: "TDD red task",
          category: "FEATURE",
          dependencies: "[]",
          status: "COMPLETE",
          tdd_red_phase: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Temporarily disable foreign key constraints
      rawDb?.pragma("foreign_keys = OFF");

      // Insert relationship with non-existent green_task_id to simulate orphan
      await db.insert(tddTaskRelationships).values({
        sprint_id: sprint.id,
        red_task_id: redTask.id,
        green_task_id: 9999, // Non-existent task ID
        declared_at: "configure_sprint",
        created_at: now,
        completed_at: null, // Not completed
      });

      // Re-enable foreign key constraints
      rawDb?.pragma("foreign_keys = ON");

      // Call handler
      const result = await handleGetSprintStatus({});

      expect(result.content).toHaveLength(1);
      const output = JSON.parse(result.content[0].text);

      expect(output.tdd_summary).toMatchObject({
        total: 1,
        by_status: {
          registered: 0,
          validated: 0,
          pending_green: 1,
          green: 0,
        },
        blocking_closeout: true, // Should block due to orphaned entry
        orphaned_count: 1, // One orphaned entry detected
      });
    });

    it("should only detect orphaned entries when green_task_id references non-existent task", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create sprint
      const [sprint] = await db
        .insert(sprints)
        .values({
          id: "sprint-001",
          name: "Test Sprint",
          workflow_step: "IMPLEMENT",
          is_active: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create phase
      const [phase] = await db
        .insert(phases)
        .values({
          sprint_id: sprint.id,
          phase_id: "phase-1",
          phase_name: "Phase 1",
          speckit_tasks: "[]",
          order: 1,
        })
        .returning();

      // Create red task
      const [redTask] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 1,
          title: "Red Task",
          description: "TDD red task",
          category: "FEATURE",
          dependencies: "[]",
          status: "COMPLETE",
          tdd_red_phase: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create green tasks
      const [greenTask1] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 2,
          title: "Green Task 1",
          description: "TDD green task",
          category: "FEATURE",
          dependencies: "[]",
          status: "IMPLEMENT",
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        })
        .returning();

      const [greenTask2] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 3,
          title: "Green Task 2",
          description: "TDD green task",
          category: "FEATURE",
          dependencies: "[]",
          status: "IMPLEMENT",
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create relationships with valid green_task_id (not orphaned)
      await db.insert(tddTaskRelationships).values([
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          green_task_id: greenTask1.id,
          declared_at: "configure_sprint",
          created_at: now,
          completed_at: null, // Not completed but not orphaned
        },
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          green_task_id: greenTask2.id,
          declared_at: "complete_task",
          created_at: now,
          completed_at: null, // Not completed but not orphaned
        },
      ]);

      // Call handler
      const result = await handleGetSprintStatus({});

      expect(result.content).toHaveLength(1);
      const output = JSON.parse(result.content[0].text);

      expect(output.tdd_summary).toMatchObject({
        total: 2,
        by_status: {
          registered: 0,
          validated: 0,
          pending_green: 2,
          green: 0,
        },
        blocking_closeout: true, // Should block because not all completed
        orphaned_count: 0, // No orphaned entries (green_task_id references existing task)
      });
    });
  });
});
