/**
 * Accept-Signal Validation Tests
 *
 * TDD tests for the accept-signal validation that runs
 * before verification checks can proceed.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateAcceptSignal } from "../../src/core/accept-signal-validator.js";
import { getDb } from "../../src/db/index.js";
import {
  phases,
  signals,
  sprints,
  tasks,
  verificationChecks,
} from "../../src/db/schema.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

describe("Accept Signal Validator", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("accept-signal-");
    const db = getDb();

    // Create test sprint
    await db.insert(sprints).values({
      id: "sprint-accept-1",
      name: "Accept Signal Sprint",
      workflow_step: "IMPLEMENT",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Create test phase
    await db.insert(phases).values({
      id: 1,
      sprint_id: "sprint-accept-1",
      phase_id: "phase-1",
      phase_name: "Test Phase",
      speckit_tasks: "[]",
      order: 1,
    });

    // Create test task
    await db.insert(tasks).values({
      id: 1,
      sprint_id: "sprint-accept-1",
      phase_id: 1,
      task_id: 1,
      title: "Test Task",
      description: "A test task",
      category: "INFRASTRUCTURE",
      dependencies: "[]",
      status: "GATE_CHECK",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  describe("ASV-1: Signal exists", () => {
    it("should reject when no signal exists", async () => {
      const result = await validateAcceptSignal(1);

      expect(result.status).toBe("REJECTED");
      expect(result.checks.find((c) => c.check_id === "ASV-1")?.passed).toBe(
        false
      );
    });

    it("should pass when signal exists", async () => {
      const db = getDb();
      await db.insert(signals).values({
        id: 1,
        task_id: 1,
        signal_id: "signal-1",
        attempt: 1,
        summary: "Test completion",
        artifacts_created: "[]",
        tests: "[]",
        build_status: "PASS",
        test_status: "PASS",
        pre_signal_checks: JSON.stringify({ build: true, test: true }),
        signaled_at: new Date().toISOString(),
      });

      // Also add verification checks for the task
      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "check-1",
        check_type: "structural",
        description: "Test check",
        severity: "BLOCKING",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      const result = await validateAcceptSignal(1);

      expect(result.checks.find((c) => c.check_id === "ASV-1")?.passed).toBe(
        true
      );
    });
  });

  describe("ASV-2: Pre-signal checks passed", () => {
    it("should reject when pre-signal checks failed", async () => {
      const db = getDb();
      await db.insert(signals).values({
        id: 1,
        task_id: 1,
        signal_id: "signal-1",
        attempt: 1,
        summary: "Test completion",
        artifacts_created: "[]",
        tests: "[]",
        build_status: "FAIL",
        test_status: "PASS",
        pre_signal_checks: JSON.stringify({ build: false, test: true }),
        signaled_at: new Date().toISOString(),
      });

      const result = await validateAcceptSignal(1);

      expect(result.status).toBe("REJECTED");
      expect(result.checks.find((c) => c.check_id === "ASV-2")?.passed).toBe(
        false
      );
    });

    it("should pass when pre-signal checks passed", async () => {
      const db = getDb();
      await db.insert(signals).values({
        id: 1,
        task_id: 1,
        signal_id: "signal-1",
        attempt: 1,
        summary: "Test completion",
        artifacts_created: "[]",
        tests: "[]",
        build_status: "PASS",
        test_status: "PASS",
        pre_signal_checks: JSON.stringify({ build: true, test: true }),
        signaled_at: new Date().toISOString(),
      });

      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "check-1",
        check_type: "structural",
        description: "Test check",
        severity: "BLOCKING",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      const result = await validateAcceptSignal(1);

      expect(result.checks.find((c) => c.check_id === "ASV-2")?.passed).toBe(
        true
      );
    });
  });

  describe("ASV-3: Signal staleness", () => {
    it("should reject stale signals", async () => {
      const db = getDb();

      // Create signal that's 2 hours old
      const twoHoursAgo = new Date(
        Date.now() - 2 * 60 * 60 * 1000
      ).toISOString();
      await db.insert(signals).values({
        id: 1,
        task_id: 1,
        signal_id: "signal-1",
        attempt: 1,
        summary: "Test completion",
        artifacts_created: "[]",
        tests: "[]",
        build_status: "PASS",
        test_status: "PASS",
        pre_signal_checks: JSON.stringify({ build: true, test: true }),
        signaled_at: twoHoursAgo,
      });

      const result = await validateAcceptSignal(1, { maxAgeMinutes: 60 });

      expect(result.status).toBe("REJECTED");
      expect(result.checks.find((c) => c.check_id === "ASV-3")?.passed).toBe(
        false
      );
    });

    it("should pass fresh signals", async () => {
      const db = getDb();
      await db.insert(signals).values({
        id: 1,
        task_id: 1,
        signal_id: "signal-1",
        attempt: 1,
        summary: "Test completion",
        artifacts_created: "[]",
        tests: "[]",
        build_status: "PASS",
        test_status: "PASS",
        pre_signal_checks: JSON.stringify({ build: true, test: true }),
        signaled_at: new Date().toISOString(),
      });

      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "check-1",
        check_type: "structural",
        description: "Test check",
        severity: "BLOCKING",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      const result = await validateAcceptSignal(1, { maxAgeMinutes: 60 });

      expect(result.checks.find((c) => c.check_id === "ASV-3")?.passed).toBe(
        true
      );
    });
  });

  describe("ASV-4: Task status", () => {
    it("should reject when task not in GATE_CHECK", async () => {
      const db = getDb();
      await db.update(tasks).set({ status: "IMPLEMENT" });

      const result = await validateAcceptSignal(1);

      expect(result.status).toBe("REJECTED");
      expect(result.checks.find((c) => c.check_id === "ASV-4")?.passed).toBe(
        false
      );
    });

    it("should pass when task in GATE_CHECK", async () => {
      const db = getDb();
      await db.insert(signals).values({
        id: 1,
        task_id: 1,
        signal_id: "signal-1",
        attempt: 1,
        summary: "Test completion",
        artifacts_created: "[]",
        tests: "[]",
        build_status: "PASS",
        test_status: "PASS",
        pre_signal_checks: JSON.stringify({ build: true, test: true }),
        signaled_at: new Date().toISOString(),
      });

      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "check-1",
        check_type: "structural",
        description: "Test check",
        severity: "BLOCKING",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      const result = await validateAcceptSignal(1);

      expect(result.checks.find((c) => c.check_id === "ASV-4")?.passed).toBe(
        true
      );
    });
  });

  describe("ASV-5: Verification checks exist", () => {
    it("should reject when no verification checks defined", async () => {
      const db = getDb();
      await db.insert(signals).values({
        id: 1,
        task_id: 1,
        signal_id: "signal-1",
        attempt: 1,
        summary: "Test completion",
        artifacts_created: "[]",
        tests: "[]",
        build_status: "PASS",
        test_status: "PASS",
        pre_signal_checks: JSON.stringify({ build: true, test: true }),
        signaled_at: new Date().toISOString(),
      });

      // No verification checks added

      const result = await validateAcceptSignal(1);

      expect(result.status).toBe("REJECTED");
      expect(result.checks.find((c) => c.check_id === "ASV-5")?.passed).toBe(
        false
      );
    });

    it("should pass when verification checks exist", async () => {
      const db = getDb();
      await db.insert(signals).values({
        id: 1,
        task_id: 1,
        signal_id: "signal-1",
        attempt: 1,
        summary: "Test completion",
        artifacts_created: "[]",
        tests: "[]",
        build_status: "PASS",
        test_status: "PASS",
        pre_signal_checks: JSON.stringify({ build: true, test: true }),
        signaled_at: new Date().toISOString(),
      });

      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "check-1",
        check_type: "structural",
        description: "Test check",
        severity: "BLOCKING",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      const result = await validateAcceptSignal(1);

      expect(result.checks.find((c) => c.check_id === "ASV-5")?.passed).toBe(
        true
      );
    });
  });

  describe("Overall result", () => {
    it("should return ACCEPTED when all checks pass", async () => {
      const db = getDb();
      await db.insert(signals).values({
        id: 1,
        task_id: 1,
        signal_id: "signal-1",
        attempt: 1,
        summary: "Test completion",
        artifacts_created: "[]",
        tests: "[]",
        build_status: "PASS",
        test_status: "PASS",
        pre_signal_checks: JSON.stringify({ build: true, test: true }),
        signaled_at: new Date().toISOString(),
      });

      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "check-1",
        check_type: "structural",
        description: "Test check",
        severity: "BLOCKING",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      const result = await validateAcceptSignal(1);

      expect(result.status).toBe("ACCEPTED");
      expect(result.checks.every((c) => c.passed)).toBe(true);
    });

    it("should return REJECTED when any check fails", async () => {
      // No signal = ASV-1 fails
      const result = await validateAcceptSignal(1);

      expect(result.status).toBe("REJECTED");
      expect(result.checks.some((c) => !c.passed)).toBe(true);
    });
  });
});
