/**
 * Tests for sprint closeout TDD blocking behavior
 *
 * Tests verify:
 * 1. Closeout blocked with PENDING_GREEN entries
 * 2. Closeout blocked with orphaned green_task_id
 * 3. Closeout succeeds when all GREEN
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getDb,
  getRawDb,
  initializeDb,
  resetDb,
} from "../../../src/db/index.js";
import {
  phases,
  sprints,
  tasks,
  tddTaskRelationships,
} from "../../../src/db/schema.js";
import { handleGetSprintStatus } from "../../../src/mcp-server/handlers/get-sprint-status.js";

describe("sprint closeout TDD blocking", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "sprint-closeout-tdd-test-")
    );
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
        // Ignore cleanup errors
      }
    }
  });

  describe("closeout blocking scenarios", () => {
    it("should block closeout with PENDING_GREEN entries", async () => {
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
          description: "TDD green task 1",
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
          description: "TDD green task 2",
          category: "FEATURE",
          dependencies: "[]",
          status: "IMPLEMENT",
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create PENDING_GREEN relationships (completed_at is null)
      await db.insert(tddTaskRelationships).values([
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          green_task_id: greenTask1.id,
          declared_at: "configure_sprint",
          created_at: now,
          completed_at: null, // Not completed - PENDING_GREEN
        },
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          green_task_id: greenTask2.id,
          declared_at: "complete_task",
          created_at: now,
          completed_at: null, // Not completed - PENDING_GREEN
        },
      ]);

      // Call handler
      const result = await handleGetSprintStatus({});

      expect(result.content).toHaveLength(1);
      const output = JSON.parse(result.content[0].text);

      // Verify TDD summary indicates blocking
      expect(output.tdd_summary).toMatchObject({
        total: 2,
        by_status: {
          registered: 0,
          validated: 0,
          pending_green: 2,
          green: 0,
        },
        blocking_closeout: true, // Should block because entries are PENDING_GREEN
        orphaned_count: 0,
      });
    });

    it("should block closeout with orphaned green_task_id entries", async () => {
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

      // Verify TDD summary indicates blocking due to orphaned entry
      expect(output.tdd_summary).toMatchObject({
        total: 1,
        by_status: {
          registered: 0,
          validated: 0,
          pending_green: 1,
          green: 0,
        },
        blocking_closeout: true, // Should block because of orphaned entry
        orphaned_count: 1, // Should detect the orphaned entry
      });
    });

    it("should allow closeout when all entries are GREEN", async () => {
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

      // Create only GREEN relationships (completed_at is set)
      await db.insert(tddTaskRelationships).values([
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          green_task_id: greenTask1.id,
          declared_at: "configure_sprint",
          created_at: now,
          completed_at: now, // Completed - GREEN
        },
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          green_task_id: greenTask2.id,
          declared_at: "complete_task",
          created_at: now,
          completed_at: now, // Completed - GREEN
        },
      ]);

      // Call handler
      const result = await handleGetSprintStatus({});

      expect(result.content).toHaveLength(1);
      const output = JSON.parse(result.content[0].text);

      // Verify TDD summary allows closeout
      expect(output.tdd_summary).toMatchObject({
        total: 2,
        by_status: {
          registered: 0,
          validated: 0,
          pending_green: 0,
          green: 2,
        },
        blocking_closeout: false, // Should NOT block because all entries are GREEN
        orphaned_count: 0,
      });
    });
  });
});
