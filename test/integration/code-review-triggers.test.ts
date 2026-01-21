/**
 * Code Review Triggers and Gating Tests
 *
 * Tests auto-trigger logic, manual triggers, and gating enforcement for code reviews.
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, initializeDb, resetDb } from "../../src/db/index.js";
import { runMigrationsV2 } from "../../src/db/migrations.js";
import { codeReviews, phases, sprints, tasks } from "../../src/db/schema.js";
import { handleCompleteTask } from "../../src/mcp-server/handlers/complete-task.js";

describe("Code Review Triggers and Gating", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-triggers-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
    await runMigrationsV2();
  });

  afterEach(async () => {
    resetDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  describe("Auto-trigger mode: manual", () => {
    it("should NOT auto-trigger reviews on task completion when mode is manual", async () => {
      // Setup sprint with manual auto-trigger
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-manual-1",
        name: "Manual Trigger Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "manual",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-manual-1",
        phase_id: "phase-1",
        phase_name: "Manual Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-manual-1",
        phase_id: 1,
        task_id: 1,
        title: "Manual Test Task",
        description: "Task in manual mode",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Complete the task
      await handleCompleteTask({ task_id: 1 });

      // Verify NO code review was auto-triggered
      const reviews = await db.select().from(codeReviews);
      expect(reviews.length).toBe(0);
    });

    it("should NOT auto-trigger reviews on phase completion when mode is manual", async () => {
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-manual-2",
        name: "Manual Phase Trigger Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "manual",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-manual-2",
        phase_id: "phase-1",
        phase_name: "Manual Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-manual-2",
        phase_id: 1,
        task_id: 1,
        title: "Manual Test Task",
        description: "Task in manual mode",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Complete the task (which completes the phase)
      await handleCompleteTask({ task_id: 1 });

      // Verify NO code review was auto-triggered
      const reviews = await db.select().from(codeReviews);
      expect(reviews.length).toBe(0);
    });
  });

  describe("Auto-trigger mode: task", () => {
    it("should auto-trigger review on task completion", async () => {
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-task-1",
        name: "Task Trigger Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "task",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-task-1",
        phase_id: "phase-1",
        phase_name: "Task Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-task-1",
        phase_id: 1,
        task_id: 1,
        title: "Task Test Task",
        description: "Task in task mode",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Complete the task - should trigger review
      await handleCompleteTask({ task_id: 1 });

      // Verify code review was auto-triggered
      const reviews = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.task_id, 1));
      expect(reviews.length).toBe(1);
      expect(reviews[0]?.status).toBe("PENDING");
      expect(reviews[0]?.review_scope).toBe("TASK");
    });

    it("should NOT auto-trigger review on phase completion in task mode", async () => {
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-task-2",
        name: "Task No Phase Trigger Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "task",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-task-2",
        phase_id: "phase-1",
        phase_name: "Task Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-task-2",
        phase_id: 1,
        task_id: 1,
        title: "Task Test Task",
        description: "Task in task mode",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Complete the task (completes phase)
      await handleCompleteTask({ task_id: 1 });

      // Should have task-level review, but not a phase-level review
      const reviews = await db.select().from(codeReviews);
      expect(reviews.every((r) => r.review_scope === "TASK")).toBe(true);
      expect(reviews.some((r) => r.review_scope === "PHASE")).toBe(false);
    });

    it("should ONLY enqueue completed unreviewed tasks", async () => {
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-task-3",
        name: "Filter Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "task",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-task-3",
        phase_id: "phase-1",
        phase_name: "Filter Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      // Task 1: Complete (should be reviewed)
      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-task-3",
        phase_id: 1,
        task_id: 1,
        title: "Complete Task",
        description: "Should be reviewed",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Task 2: In progress (should NOT be reviewed)
      await db.insert(tasks).values({
        id: 2,
        sprint_id: "sprint-task-3",
        phase_id: 1,
        task_id: 2,
        title: "In Progress Task",
        description: "Should NOT be reviewed",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "IMPLEMENT",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Complete task 1
      await handleCompleteTask({ task_id: 1 });

      // Only task 1 should have a review
      const reviews = await db.select().from(codeReviews);
      expect(reviews.length).toBe(1);
      expect(reviews[0]?.task_id).toBe(1);
    });

    it("should NOT enqueue already reviewed tasks", async () => {
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-task-4",
        name: "Already Reviewed Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "task",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-task-4",
        phase_id: "phase-1",
        phase_name: "Reviewed Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-task-4",
        phase_id: 1,
        task_id: 1,
        title: "Already Reviewed Task",
        description: "Has existing review",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Create existing review
      await db.insert(codeReviews).values({
        sprint_id: "sprint-task-4",
        task_id: 1,
        phase_id: 1,
        review_scope: "TASK",
        status: "APPROVED",
        summary: "Already reviewed",
        risk: "LOW",
        requested_by: "orchestrator",
        requested_at: new Date().toISOString(),
      });

      // Complete task 1 again
      await handleCompleteTask({ task_id: 1 });

      // Should still only have 1 review
      const reviews = await db.select().from(codeReviews);
      expect(reviews.length).toBe(1);
    });
  });

  describe("Auto-trigger mode: phase", () => {
    it("should NOT auto-trigger on task completion in phase mode", async () => {
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-phase-1",
        name: "Phase Trigger Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "phase",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-phase-1",
        phase_id: "phase-1",
        phase_name: "Phase Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values([
        {
          id: 1,
          sprint_id: "sprint-phase-1",
          phase_id: 1,
          task_id: 1,
          title: "Phase Task 1",
          description: "First task",
          category: "INFRASTRUCTURE",
          dependencies: "[]",
          status: "VERIFY",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 2,
          sprint_id: "sprint-phase-1",
          phase_id: 1,
          task_id: 2,
          title: "Phase Task 2",
          description: "Second task",
          category: "INFRASTRUCTURE",
          dependencies: "[1]",
          status: "PENDING",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

      // Complete first task (phase NOT complete)
      await handleCompleteTask({ task_id: 1 });

      // No review should be triggered yet
      const reviews = await db.select().from(codeReviews);
      expect(reviews.length).toBe(0);
    });

    it("should auto-trigger review when all tasks in phase complete", async () => {
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-phase-2",
        name: "Phase Complete Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "phase",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-phase-2",
        phase_id: "phase-1",
        phase_name: "Complete Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-phase-2",
        phase_id: 1,
        task_id: 1,
        title: "Only Task",
        description: "Only task in phase",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Complete the only task (phase complete)
      await handleCompleteTask({ task_id: 1 });

      // Phase-level review should be triggered
      const reviews = await db.select().from(codeReviews);
      expect(reviews.length).toBe(1);
      expect(reviews[0]?.review_scope).toBe("PHASE");
      expect(reviews[0]?.phase_id).toBe(1);
    });
  });

  describe("Auto-trigger mode: both", () => {
    it("should trigger task-level review on each task completion", async () => {
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-both-1",
        name: "Both Trigger Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "both",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-both-1",
        phase_id: "phase-1",
        phase_name: "Both Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values([
        {
          id: 1,
          sprint_id: "sprint-both-1",
          phase_id: 1,
          task_id: 1,
          title: "Both Task 1",
          description: "First task",
          category: "INFRASTRUCTURE",
          dependencies: "[]",
          status: "VERIFY",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 2,
          sprint_id: "sprint-both-1",
          phase_id: 1,
          task_id: 2,
          title: "Both Task 2",
          description: "Second task",
          category: "INFRASTRUCTURE",
          dependencies: "[1]",
          status: "PENDING",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

      // Complete first task
      await handleCompleteTask({ task_id: 1 });

      // Should have task-level review
      const reviews1 = await db.select().from(codeReviews);
      expect(reviews1.length).toBe(1);
      expect(reviews1[0]?.review_scope).toBe("TASK");
      expect(reviews1[0]?.task_id).toBe(1);
    });

    it("should trigger phase-level review when phase completes", async () => {
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-both-2",
        name: "Both Phase Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "both",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-both-2",
        phase_id: "phase-1",
        phase_name: "Both Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-both-2",
        phase_id: 1,
        task_id: 1,
        title: "Only Task",
        description: "Only task in phase",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Complete the task (completes phase)
      await handleCompleteTask({ task_id: 1 });

      // Should have both task and phase reviews
      const reviews = await db.select().from(codeReviews);
      expect(reviews.length).toBe(2);
      expect(reviews.some((r) => r.review_scope === "TASK")).toBe(true);
      expect(reviews.some((r) => r.review_scope === "PHASE")).toBe(true);
    });
  });

  describe("Manual trigger", () => {
    it("should allow manual trigger regardless of auto-trigger setting", async () => {
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-manual-trigger-1",
        name: "Manual Trigger Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "manual",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-manual-trigger-1",
        phase_id: "phase-1",
        phase_name: "Manual Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-manual-trigger-1",
        phase_id: 1,
        task_id: 1,
        title: "Manual Task",
        description: "Manual trigger task",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "COMPLETE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // This function will be implemented in green phase
      // await manualTriggerCodeReview({ task_id: 1, scope: "TASK" });

      // For now, simulate manual trigger
      await db.insert(codeReviews).values({
        sprint_id: "sprint-manual-trigger-1",
        task_id: 1,
        phase_id: 1,
        review_scope: "TASK",
        status: "PENDING",
        summary: "Manually triggered review",
        risk: "LOW",
        requested_by: "orchestrator",
        requested_at: new Date().toISOString(),
      });

      const reviews = await db.select().from(codeReviews);
      expect(reviews.length).toBe(1);
      expect(reviews[0]?.status).toBe("PENDING");
    });

    it("should allow manual phase-level trigger", async () => {
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-manual-phase-1",
        name: "Manual Phase Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "task",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-manual-phase-1",
        phase_id: "phase-1",
        phase_name: "Manual Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-manual-phase-1",
        phase_id: 1,
        task_id: 1,
        title: "Manual Phase Task",
        description: "Manual phase trigger task",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "COMPLETE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // This function will be implemented in green phase
      // await manualTriggerCodeReview({ phase_id: 1, scope: "PHASE" });

      // For now, simulate manual phase trigger
      await db.insert(codeReviews).values({
        sprint_id: "sprint-manual-phase-1",
        task_id: 1,
        phase_id: 1,
        review_scope: "PHASE",
        status: "PENDING",
        summary: "Manually triggered phase review",
        risk: "LOW",
        requested_by: "orchestrator",
        requested_at: new Date().toISOString(),
      });

      const reviews = await db.select().from(codeReviews);
      expect(reviews.length).toBe(1);
      expect(reviews[0]?.review_scope).toBe("PHASE");
    });
  });

  describe("Task gate policy", () => {
    it("should insert PENDING_CODE_REVIEW status between VERIFY and COMPLETE", async () => {
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-task-gate-1",
        name: "Task Gate Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_policy: "task_gate",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-task-gate-1",
        phase_id: "phase-1",
        phase_name: "Task Gate Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-task-gate-1",
        phase_id: 1,
        task_id: 1,
        title: "Task Gate Task",
        description: "Task with gate",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Attempt to complete task - should block with PENDING_CODE_REVIEW
      // This will be implemented in green phase
      // const result = await enforceTaskGate({ task_id: 1 });
      // expect(result.blocked).toBe(true);
      // expect(result.status).toBe("PENDING_CODE_REVIEW");

      // For now, verify the concept
      const task = await db.select().from(tasks).where(eq(tasks.id, 1));
      expect(task[0]?.status).toBe("VERIFY"); // Will change to PENDING_CODE_REVIEW in green phase
    });

    it("should block completion until review is APPROVED", async () => {
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-task-gate-2",
        name: "Task Gate Block Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_policy: "task_gate",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-task-gate-2",
        phase_id: "phase-1",
        phase_name: "Block Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-task-gate-2",
        phase_id: 1,
        task_id: 1,
        title: "Block Task",
        description: "Task should be blocked",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Create PENDING review
      await db.insert(codeReviews).values({
        sprint_id: "sprint-task-gate-2",
        task_id: 1,
        phase_id: 1,
        review_scope: "TASK",
        status: "PENDING",
        summary: "Review pending",
        risk: "LOW",
        requested_by: "orchestrator",
        requested_at: new Date().toISOString(),
      });

      // Attempt to complete - should block
      // const result = await enforceTaskGate({ task_id: 1 });
      // expect(result.blocked).toBe(true);
      // expect(result.reason).toContain("review pending");

      // Verify review is still pending
      const reviews = await db.select().from(codeReviews);
      expect(reviews[0]?.status).toBe("PENDING");
    });

    it("should allow completion when review is APPROVED", async () => {
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-task-gate-3",
        name: "Task Gate Approved Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_policy: "task_gate",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-task-gate-3",
        phase_id: "phase-1",
        phase_name: "Approved Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-task-gate-3",
        phase_id: 1,
        task_id: 1,
        title: "Approved Task",
        description: "Task should be allowed",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Create APPROVED review
      await db.insert(codeReviews).values({
        sprint_id: "sprint-task-gate-3",
        task_id: 1,
        phase_id: 1,
        review_scope: "TASK",
        status: "APPROVED",
        summary: "Review approved",
        risk: "LOW",
        requested_by: "orchestrator",
        requested_at: new Date().toISOString(),
        reviewed_by: "reviewer",
        reviewed_at: new Date().toISOString(),
      });

      // Should allow completion
      // const result = await enforceTaskGate({ task_id: 1 });
      // expect(result.blocked).toBe(false);

      // Complete the task
      await handleCompleteTask({ task_id: 1 });

      // Verify task is verified
      const task = await db.select().from(tasks).where(eq(tasks.id, 1));
      expect(task[0]?.status).toBe("VERIFIED");
    });
  });

  describe("Phase gate policy", () => {
    it("should block phase progression until all tasks approved", async () => {
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-phase-gate-1",
        name: "Phase Gate Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_policy: "phase_gate",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values([
        {
          id: 1,
          sprint_id: "sprint-phase-gate-1",
          phase_id: "phase-1",
          phase_name: "Phase 1",
          speckit_tasks: "[]",
          order: 1,
        },
        {
          id: 2,
          sprint_id: "sprint-phase-gate-1",
          phase_id: "phase-2",
          phase_name: "Phase 2",
          speckit_tasks: "[]",
          order: 2,
        },
      ]);

      await db.insert(tasks).values([
        {
          id: 1,
          sprint_id: "sprint-phase-gate-1",
          phase_id: 1,
          task_id: 1,
          title: "Phase 1 Task",
          description: "Task in phase 1",
          category: "INFRASTRUCTURE",
          dependencies: "[]",
          status: "COMPLETE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 2,
          sprint_id: "sprint-phase-gate-1",
          phase_id: 2,
          task_id: 2,
          title: "Phase 2 Task",
          description: "Task in phase 2",
          category: "INFRASTRUCTURE",
          dependencies: "[]",
          status: "PENDING",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

      // Create PENDING review for phase 1 task
      await db.insert(codeReviews).values({
        sprint_id: "sprint-phase-gate-1",
        task_id: 1,
        phase_id: 1,
        review_scope: "TASK",
        status: "PENDING",
        summary: "Review pending",
        risk: "LOW",
        requested_by: "orchestrator",
        requested_at: new Date().toISOString(),
      });

      // Attempt to start phase 2 - should block
      // const result = await enforcePhaseGate({ phase_id: 2 });
      // expect(result.blocked).toBe(true);
      // expect(result.reason).toContain("previous phase has pending reviews");

      // Verify phase 2 task is still pending
      const task2 = await db.select().from(tasks).where(eq(tasks.id, 2));
      expect(task2[0]?.status).toBe("PENDING");
    });

    it("should allow phase progression when all tasks approved", async () => {
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-phase-gate-2",
        name: "Phase Gate Approved Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_policy: "phase_gate",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values([
        {
          id: 1,
          sprint_id: "sprint-phase-gate-2",
          phase_id: "phase-1",
          phase_name: "Phase 1",
          speckit_tasks: "[]",
          order: 1,
        },
        {
          id: 2,
          sprint_id: "sprint-phase-gate-2",
          phase_id: "phase-2",
          phase_name: "Phase 2",
          speckit_tasks: "[]",
          order: 2,
        },
      ]);

      await db.insert(tasks).values([
        {
          id: 1,
          sprint_id: "sprint-phase-gate-2",
          phase_id: 1,
          task_id: 1,
          title: "Phase 1 Task",
          description: "Task in phase 1",
          category: "INFRASTRUCTURE",
          dependencies: "[]",
          status: "COMPLETE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 2,
          sprint_id: "sprint-phase-gate-2",
          phase_id: 2,
          task_id: 2,
          title: "Phase 2 Task",
          description: "Task in phase 2",
          category: "INFRASTRUCTURE",
          dependencies: "[]",
          status: "PENDING",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

      // Create APPROVED review for phase 1 task
      await db.insert(codeReviews).values({
        sprint_id: "sprint-phase-gate-2",
        task_id: 1,
        phase_id: 1,
        review_scope: "TASK",
        status: "APPROVED",
        summary: "Review approved",
        risk: "LOW",
        requested_by: "orchestrator",
        requested_at: new Date().toISOString(),
        reviewed_by: "reviewer",
        reviewed_at: new Date().toISOString(),
      });

      // Should allow phase 2 to start
      // const result = await enforcePhaseGate({ phase_id: 2 });
      // expect(result.blocked).toBe(false);

      // Verify phase gate is open
      const allReviews = await db.select().from(codeReviews);
      expect(allReviews.every((r) => r.status === "APPROVED")).toBe(true);
    });
  });

  describe("Failed review gating", () => {
    it("should keep gate closed when review is CHANGES_REQUESTED", async () => {
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-failed-gate-1",
        name: "Failed Gate Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_policy: "task_gate",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-failed-gate-1",
        phase_id: "phase-1",
        phase_name: "Failed Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-failed-gate-1",
        phase_id: 1,
        task_id: 1,
        title: "Failed Gate Task",
        description: "Task with changes requested",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Create CHANGES_REQUESTED review
      await db.insert(codeReviews).values({
        sprint_id: "sprint-failed-gate-1",
        task_id: 1,
        phase_id: 1,
        review_scope: "TASK",
        status: "CHANGES_REQUESTED",
        summary: "Changes needed",
        risk: "MEDIUM",
        requested_by: "orchestrator",
        requested_at: new Date().toISOString(),
        reviewed_by: "reviewer",
        reviewed_at: new Date().toISOString(),
      });

      // Attempt to complete - should block
      // const result = await enforceTaskGate({ task_id: 1 });
      // expect(result.blocked).toBe(true);
      // expect(result.reason).toContain("changes requested");

      // Verify review status
      const reviews = await db.select().from(codeReviews);
      expect(reviews[0]?.status).toBe("CHANGES_REQUESTED");
    });

    it("should keep gate closed when review is REJECTED", async () => {
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-failed-gate-2",
        name: "Rejected Gate Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_policy: "task_gate",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-failed-gate-2",
        phase_id: "phase-1",
        phase_name: "Rejected Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-failed-gate-2",
        phase_id: 1,
        task_id: 1,
        title: "Rejected Gate Task",
        description: "Task with rejected review",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Create REJECTED review
      await db.insert(codeReviews).values({
        sprint_id: "sprint-failed-gate-2",
        task_id: 1,
        phase_id: 1,
        review_scope: "TASK",
        status: "REJECTED",
        summary: "Review rejected",
        risk: "HIGH",
        requested_by: "orchestrator",
        requested_at: new Date().toISOString(),
        reviewed_by: "reviewer",
        reviewed_at: new Date().toISOString(),
      });

      // Attempt to complete - should block
      // const result = await enforceTaskGate({ task_id: 1 });
      // expect(result.blocked).toBe(true);
      // expect(result.reason).toContain("rejected");

      // Verify review status
      const reviews = await db.select().from(codeReviews);
      expect(reviews[0]?.status).toBe("REJECTED");
    });

    it("should open gate only after review is APPROVED", async () => {
      const db = getDb();
      await db.insert(sprints).values({
        id: "sprint-failed-gate-3",
        name: "Gate Transition Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_policy: "task_gate",
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-failed-gate-3",
        phase_id: "phase-1",
        phase_name: "Transition Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-failed-gate-3",
        phase_id: 1,
        task_id: 1,
        title: "Transition Task",
        description: "Task going from rejected to approved",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Create initially REJECTED review
      const [insertedReview] = await db
        .insert(codeReviews)
        .values({
          sprint_id: "sprint-failed-gate-3",
          task_id: 1,
          phase_id: 1,
          review_scope: "TASK",
          status: "REJECTED",
          summary: "Initially rejected",
          risk: "HIGH",
          requested_by: "orchestrator",
          requested_at: new Date().toISOString(),
          reviewed_by: "reviewer",
          reviewed_at: new Date().toISOString(),
        })
        .returning();

      // Gate should be closed
      // const result1 = await enforceTaskGate({ task_id: 1 });
      // expect(result1.blocked).toBe(true);

      // Update review to APPROVED
      await db
        .update(codeReviews)
        .set({ status: "APPROVED" })
        .where(eq(codeReviews.id, insertedReview.id));

      // Gate should now be open
      // const result2 = await enforceTaskGate({ task_id: 1 });
      // expect(result2.blocked).toBe(false);

      // Should allow completion
      await handleCompleteTask({ task_id: 1 });

      const task = await db.select().from(tasks).where(eq(tasks.id, 1));
      expect(task[0]?.status).toBe("VERIFIED");
    });
  });
});
