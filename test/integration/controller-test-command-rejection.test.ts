/**
 * Controller Test Command Rejection Integration Tests
 *
 * SC-012: Verifies that the Controller's approve_handover handler
 * rejects handovers containing direct test commands in behavioral_checks.
 *
 * The approve_handover handler must scan verification_checks for behavioral
 * checks whose command contains shell test commands (FR-041, FR-042).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../src/db/index.js";
import {
  handovers,
  phases,
  sprints,
  tasks,
  verificationChecks,
} from "../../src/db/schema.js";
import { handleApproveHandover } from "../../src/mcp-server/handlers/approve-handover.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

describe("Controller enforcement for test command rejection", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("ctrl-test-cmd-");
    const db = getDb();

    // Create sprint with IMPLEMENT workflow (Controller needs active sprint)
    await db.insert(sprints).values({
      id: "sprint-ctrl-test-1",
      name: "Controller Test Sprint",
      status: "ACTIVE",
      workflow_step: "IMPLEMENT",
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Create phase
    await db.insert(phases).values({
      id: 1,
      sprint_id: "sprint-ctrl-test-1",
      phase_id: "phase-1",
      phase_name: "Test Phase",
      speckit_tasks: "[]",
      order: 1,
    });

    // Create task in PENDING_HANDOVER_REVIEW status
    await db.insert(tasks).values({
      id: 1,
      sprint_id: "sprint-ctrl-test-1",
      phase_id: 1,
      task_id: 1,
      title: "Test Task",
      description: "A task for testing controller enforcement",
      category: "INFRASTRUCTURE",
      dependencies: "[]",
      status: "PENDING_HANDOVER_REVIEW",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Create handover entry (required for approve_handover to proceed)
    await db.insert(handovers).values({
      id: 1,
      task_id: 1,
      priority: "P1",
      context: "Test context",
      acceptance_criteria: JSON.stringify([
        { criterion: "Test criterion", verification: "Manual" },
      ]),
      file_operations: JSON.stringify([]),
      deliverables: JSON.stringify(["test-file.ts"]),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  it("should reject handover when behavioral_checks contain test commands", async () => {
    const db = getDb();

    // Insert a behavioral check with a test command
    await db.insert(verificationChecks).values({
      id: 1,
      task_id: 1,
      check_id: "behavior-test-run",
      check_type: "behavioral",
      description: "Run unit tests",
      severity: "BLOCKING",
      check_config: JSON.stringify({
        type: "behavioral",
        command: 'npm test -- -t "feature"',
      }),
      created_at: new Date().toISOString(),
    });

    // Call approve_handover — should reject
    const response = await handleApproveHandover({
      task_id: 1,
      conformance: "PASS",
    });

    const output = JSON.parse((response.content[0] as { text: string }).text);

    expect(output.success).toBe(false);
    expect(output.error.message).toBe(
      "Use test_verification format instead of behavioral_checks for test execution",
    );
  });

  it("should approve handover when behavioral_checks contain non-test commands", async () => {
    const db = getDb();

    // Insert a behavioral check with a non-test command (typecheck)
    await db.insert(verificationChecks).values({
      id: 1,
      task_id: 1,
      check_id: "behavior-typecheck",
      check_type: "behavioral",
      description: "Run typecheck",
      severity: "BLOCKING",
      check_config: JSON.stringify({
        type: "behavioral",
        command: "npm run typecheck",
      }),
      created_at: new Date().toISOString(),
    });

    // Call approve_handover — should succeed
    const response = await handleApproveHandover({
      task_id: 1,
      conformance: "PASS",
    });

    const output = JSON.parse((response.content[0] as { text: string }).text);

    expect(output.success).toBe(true);
    expect(output.task_id).toBe(1);
    expect(output.new_status).toBe("IMPLEMENT");
  });

  it("should approve handover when task has no behavioral checks", async () => {
    const db = getDb();

    // Insert only a structural check (not behavioral)
    await db.insert(verificationChecks).values({
      id: 1,
      task_id: 1,
      check_id: "struct-file-exists",
      check_type: "structural",
      description: "File must exist",
      severity: "BLOCKING",
      check_config: JSON.stringify({
        type: "structural",
        subtype: "file_exists",
        path: "src/feature.ts",
      }),
      created_at: new Date().toISOString(),
    });

    // Call approve_handover — should succeed
    const response = await handleApproveHandover({
      task_id: 1,
      conformance: "PASS",
    });

    const output = JSON.parse((response.content[0] as { text: string }).text);

    expect(output.success).toBe(true);
    expect(output.task_id).toBe(1);
    expect(output.new_status).toBe("IMPLEMENT");
  });

  it("should approve handover when TDD auto-injected test_verification checks are present", async () => {
    const db = getDb();

    // Insert a TDD auto-injected test_verification check.
    // These are generated by generateTddRedPhaseChecks() and use the
    // test_verification format (declarative — executed via runTestsCore).
    // They should NOT be scanned as behavioral checks.
    await db.insert(verificationChecks).values({
      id: 1,
      task_id: 1,
      check_id: "test-verification-tdd-red-0",
      check_type: "test_verification",
      description: "Red-phase tests must fail",
      severity: "BLOCKING",
      check_config: JSON.stringify({
        tier: "red",
        expect: "any_fail",
        success_message: "Red-phase tests failed as expected",
        failure_message: "Red-phase tests must fail",
      }),
      created_at: new Date().toISOString(),
    });

    // Also insert a structural TDD check
    await db.insert(verificationChecks).values({
      id: 2,
      task_id: 1,
      check_id: "struct-tdd-red-0",
      check_type: "structural",
      description: "Red-phase test files present",
      severity: "BLOCKING",
      check_config: JSON.stringify({
        path: "test/red/**/*_test.dart",
        pattern: "(?:test|group)\\s*\\(",
        min_matches: 1,
      }),
      created_at: new Date().toISOString(),
    });

    // Call approve_handover — should succeed (test_verification checks aren't behavioral)
    const response = await handleApproveHandover({
      task_id: 1,
      conformance: "PASS",
    });

    const output = JSON.parse((response.content[0] as { text: string }).text);

    expect(output.success).toBe(true);
    expect(output.task_id).toBe(1);
    expect(output.new_status).toBe("IMPLEMENT");
  });

  it("should reject handover when non-TDD behavioral checks contain test commands alongside TDD checks", async () => {
    const db = getDb();

    // Insert a TDD auto-injected test_verification check (not behavioral — should be ignored by scanner)
    await db.insert(verificationChecks).values({
      id: 1,
      task_id: 1,
      check_id: "test-verification-tdd-red-0",
      check_type: "test_verification",
      description: "Red-phase tests must fail",
      severity: "BLOCKING",
      check_config: JSON.stringify({
        tier: "red",
        expect: "any_fail",
      }),
      created_at: new Date().toISOString(),
    });

    // Insert a user-submitted behavioral check with a test command (should be caught)
    await db.insert(verificationChecks).values({
      id: 2,
      task_id: 1,
      check_id: "behav-input-0",
      check_type: "behavioral",
      description: "Run all tests",
      severity: "BLOCKING",
      check_config: JSON.stringify({
        command: "npm test",
      }),
      created_at: new Date().toISOString(),
    });

    // Call approve_handover — should reject due to the non-TDD behavioral check
    const response = await handleApproveHandover({
      task_id: 1,
      conformance: "PASS",
    });

    const output = JSON.parse((response.content[0] as { text: string }).text);

    expect(output.success).toBe(false);
    expect(output.error.message).toBe(
      "Use test_verification format instead of behavioral_checks for test execution",
    );
  });
});
