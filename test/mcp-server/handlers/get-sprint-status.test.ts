/**
 * Tests for get_sprint_status handler
 *
 * Tests verify:
 * 1. Basic sprint status output structure
 * 2. TDD summary computation with status breakdown
 * 3. blocking_closeout flag logic
 * 4. Orphaned green_task_id detection
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, getRawDb, initializeDb, resetDb } from "../../../src/db/index.js";
import {
  phases,
  sprints,
  tasks,
  tddRedRegistry,
} from "../../../src/db/schema.js";
import { handleGetSprintStatus } from "../../../src/mcp-server/handlers/get-sprint-status.js";

describe("get_sprint_status handler", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "get-sprint-status-test-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
  });

  afterEach(() => {
    // Close database connection first
    try {
      resetDb();
    } catch (e) {
      // Ignore errors
    }

    // Try to clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore EPERM errors on Windows
      }
    }
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
    it("should include TDD summary with status breakdown when registry entries exist", async () => {
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

      const [greenTask] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 3,
          title: "Green Task",
          description: "TDD green task",
          category: "FEATURE",
          dependencies: "[]",
          status: "COMPLETE",
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create registry entries with different statuses
      await db.insert(tddRedRegistry).values([
        {
          sprint_id: sprint.id,
          red_task_id: redTask1.id,
          test_identifier: "test1.ts::suite1::test1",
          status: "REGISTERED",
          created_at: now,
        },
        {
          sprint_id: sprint.id,
          red_task_id: redTask1.id,
          test_identifier: "test1.ts::suite1::test2",
          status: "VALIDATED",
          created_at: now,
          validated_at: now,
        },
        {
          sprint_id: sprint.id,
          red_task_id: redTask2.id,
          test_identifier: "test2.ts::suite2::test1",
          status: "PENDING_GREEN",
          green_task_id: greenTask.id,
          created_at: now,
          validated_at: now,
          assigned_at: now,
        },
        {
          sprint_id: sprint.id,
          red_task_id: redTask2.id,
          test_identifier: "test2.ts::suite2::test2",
          status: "GREEN",
          green_task_id: greenTask.id,
          created_at: now,
          validated_at: now,
          assigned_at: now,
          greened_at: now,
        },
      ]);

      // Call handler
      const result = await handleGetSprintStatus({});

      expect(result.content).toHaveLength(1);
      const output = JSON.parse(result.content[0].text);

      expect(output.tdd_summary).toMatchObject({
        total: 4,
        by_status: {
          registered: 1,
          validated: 1,
          pending_green: 1,
          green: 1,
        },
        blocking_closeout: true, // Should be true because not all entries are GREEN
        orphaned_count: 0,
      });
    });

    it("should set blocking_closeout to false when all entries are GREEN", async () => {
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

      const [greenTask] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 2,
          title: "Green Task",
          description: "TDD green task",
          category: "FEATURE",
          dependencies: "[]",
          status: "COMPLETE",
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create registry entries - all GREEN
      await db.insert(tddRedRegistry).values([
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          test_identifier: "test1.ts::suite1::test1",
          status: "GREEN",
          green_task_id: greenTask.id,
          created_at: now,
          validated_at: now,
          assigned_at: now,
          greened_at: now,
        },
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          test_identifier: "test1.ts::suite1::test2",
          status: "GREEN",
          green_task_id: greenTask.id,
          created_at: now,
          validated_at: now,
          assigned_at: now,
          greened_at: now,
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
        blocking_closeout: false, // All entries are GREEN
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

      // Insert registry entry with non-existent green_task_id to simulate orphan
      await db.insert(tddRedRegistry).values({
        sprint_id: sprint.id,
        red_task_id: redTask.id,
        test_identifier: "test1.ts::suite1::test1",
        status: "PENDING_GREEN",
        green_task_id: 9999, // Non-existent task ID
        created_at: now,
        validated_at: now,
        assigned_at: now,
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

    it("should count only orphaned entries (not entries with null green_task_id)", async () => {
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

      // Create registry entries with null green_task_id
      await db.insert(tddRedRegistry).values([
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          test_identifier: "test1.ts::suite1::test1",
          status: "REGISTERED",
          green_task_id: null, // No green task assigned yet
          created_at: now,
        },
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          test_identifier: "test1.ts::suite1::test2",
          status: "VALIDATED",
          green_task_id: null, // No green task assigned yet
          created_at: now,
          validated_at: now,
        },
      ]);

      // Call handler
      const result = await handleGetSprintStatus({});

      expect(result.content).toHaveLength(1);
      const output = JSON.parse(result.content[0].text);

      expect(output.tdd_summary).toMatchObject({
        total: 2,
        by_status: {
          registered: 1,
          validated: 1,
          pending_green: 0,
          green: 0,
        },
        blocking_closeout: true, // Should block because not all GREEN
        orphaned_count: 0, // No orphaned entries (null green_task_id is not orphaned)
      });
    });
  });
});
