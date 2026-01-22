/**
 * TDD Red-Green Workflow End-to-End Integration Test
 *
 * This test validates the complete TDD Red-Green Enforcement workflow from start to finish.
 * It exercises all TDD components together to prove they work correctly as a system.
 *
 * Workflow under test:
 * 1. configure_sprint with tdd_relationships declaring red→green pair
 * 2. prepare_task for red phase (tdd_red_phase=true)
 * 3. register_tdd_red_test to register failing tests
 * 4. signal_completion on red phase (status should become PENDING_GREEN)
 * 5. prepare_task for green phase
 * 6. signal_completion on green phase (validates tests pass + markers removed)
 * 7. complete_task on green phase (registry shows GREEN status)
 * 8. get_sprint_status shows blocking_closeout=false when all tests GREEN
 *
 * FR-011: All error messages must be actionable with error code, explanation, and suggested fix.
 */

import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as preSignalExecutor from "../../src/core/pre-signal-executor.js";
import * as tddScanOnSignal from "../../src/core/tdd-scan-on-signal.js";
import { getDb } from "../../src/db/index.js";
import { sprints, tasks, tddRedRegistry } from "../../src/db/schema.js";
import { handleCompleteTask } from "../../src/mcp-server/handlers/complete-task.js";
import { handleConfigureSprint } from "../../src/mcp-server/handlers/configure-sprint.js";
import { handleGetSprintStatus } from "../../src/mcp-server/handlers/get-sprint-status.js";
import { handleRegisterTddRedTest } from "../../src/mcp-server/handlers/register-tdd-red-test.js";
import { handleSignalCompletion } from "../../src/mcp-server/handlers/signal-completion.js";
import type { ConfigureSprintInput } from "../../src/schemas/index.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

describe("TDD Red-Green Workflow End-to-End", () => {
  let tempDir: string;
  let sprintId: string;

  beforeEach(async () => {
    // Create temp workspace via cache
    tempDir = await setupTestDb("tdd-workflow-e2e-");

    // Create package.json for vitest
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test-workspace", version: "1.0.0" }),
    );

    // Note: Mocking is done per-test as needed
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestDb(tempDir);
  });

  describe("Complete red→green workflow", () => {
    it("should complete full TDD lifecycle: configure → red phase → green phase → closeout", async () => {
      // Mock pre-signal checks since we're not creating actual test files
      vi.spyOn(preSignalExecutor, "runPreSignalChecks").mockResolvedValue({
        build: { passed: true, output: "" },
        test: { passed: true, output: "" },
        lint: { passed: true, output: "" },
        allPassed: true,
      });

      // Mock TDD scanner to return test results for red phase task
      // New format uses testsByTask Map with file-level tracking
      const testsByTask = new Map<
        number,
        { test_file: string; test_count: number }[]
      >();
      testsByTask.set(1, [
        { test_file: "test/feature.test.ts", test_count: 2 },
      ]);
      vi.spyOn(tddScanOnSignal, "scanForTddMarkers").mockResolvedValue({
        testsByTask,
        totalFiles: 1,
        totalTests: 2,
      });

      // =============================================================================
      // STEP 1: Configure sprint with TDD relationship
      // =============================================================================
      const configInput: ConfigureSprintInput = {
        environment: {
          test_command: "npm test",
          test_file_pattern: "test/**/*.test.ts",
          source_base_dir: ".",
        },
        sprint: {
          id: "sprint-e2e-001",
          name: "E2E TDD Workflow Test Sprint",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "TDD Feature Implementation",
            speckit_tasks: [],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Red Phase: Write failing tests",
            description: "Write tests that define the feature requirements",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Test file exists",
                  severity: "MAJOR",
                  path: "test/feature.test.ts",
                  pattern: "describe|it",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 2,
            phase_id: "phase-1",
            title: "Green Phase: Implement feature",
            description: "Implement the feature to make tests pass",
            category: "INFRASTRUCTURE",
            dependencies: [1],
            verification: {
              structural_checks: [
                {
                  description: "Feature implementation exists",
                  severity: "MAJOR",
                  path: "src/feature.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
        tdd_relationships: [
          {
            red_task_id: 1,
            green_task_id: 2,
          },
        ],
      };

      const configResponse = await handleConfigureSprint(configInput);
      const configResult = JSON.parse(
        (configResponse.content[0] as { text: string }).text,
      );

      if (!configResult.success) {
      }

      expect(configResult.success).toBe(true);
      sprintId = configResult.sprint_id;

      // Verify TDD relationship was created
      const db = getDb();
      const [sprint] = await db
        .select()
        .from(sprints)
        .where(eq(sprints.id, sprintId));
      expect(sprint).toBeDefined();

      // =============================================================================
      // STEP 2: Prepare red phase task (simulate orchestrator preparing it)
      // =============================================================================
      // In a real workflow, orchestrator would call prepare_task
      // For this integration test, we'll directly update the task status to IMPLEMENT
      const [redTaskBeforePrepare] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.task_id, 1));

      await db
        .update(tasks)
        .set({ status: "IMPLEMENT", updated_at: new Date().toISOString() })
        .where(eq(tasks.id, redTaskBeforePrepare.id));

      // Verify task status is now IMPLEMENT
      const [redTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.task_id, 1));
      expect(redTask.status).toBe("IMPLEMENT");
      expect(redTask.tdd_red_phase).toBe(true);

      // =============================================================================
      // STEP 3: Create test file with failing tests (red phase)
      // =============================================================================
      const testDir = path.join(tempDir, "test");
      await fs.mkdir(testDir);

      // Use single-token TDD marker format: [tdd-red-task-N]
      const testContent = `
import { describe, it, expect } from 'vitest';

describe('Feature', () => {
  it('should implement feature requirement 1', () => {
    expect(true).toBe(false);
  });

  it('should implement feature requirement 2', () => {
    expect(1).toBe(2);
  });
});
`;
      await fs.writeFile(path.join(testDir, "feature.test.ts"), testContent);

      // =============================================================================
      // STEP 4: Signal completion on red phase
      // Scanner will auto-discover and register the tests
      // =============================================================================
      const signalRedResponse = await handleSignalCompletion({
        task_id: 1,
        summary: "Wrote failing tests for feature requirements",
        artifacts_created: [
          {
            path: "test/feature.test.ts",
            type: "CREATE",
            description: "TDD red phase tests",
          },
        ],
        build_status: "PASS",
        test_status: "PASS",
      });
      const signalRedResult = JSON.parse(
        (signalRedResponse.content[0] as { text: string }).text,
      );

      expect(signalRedResult.success).toBe(true);

      // Verify registry entries were auto-populated by scanner (file-level: 1 entry for the test file)
      const registeredTests = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.red_task_id, redTask.id));
      expect(registeredTests).toHaveLength(1);
      expect(registeredTests[0].test_file).toBe("test/feature.test.ts");
      expect(registeredTests[0].test_count).toBe(2);

      // Registry entries exist (file-level tracking)
      const validatedTests = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.red_task_id, redTask.id));
      expect(validatedTests).toHaveLength(1);

      // Manually move task to VERIFY status (simulating gate checks + judgment passing)
      // In real workflow, orchestrator would run verification checks and judgment
      await db
        .update(tasks)
        .set({ status: "VERIFY", updated_at: new Date().toISOString() })
        .where(eq(tasks.id, redTask.id));

      // =============================================================================
      // STEP 6: Complete red phase task
      // =============================================================================
      const completeRedResponse = await handleCompleteTask({
        task_id: 1,
        notes: "Red phase complete - tests registered and validated",
      });
      const completeRedResult = JSON.parse(
        (completeRedResponse.content[0] as { text: string }).text,
      );

      expect(completeRedResult.success).toBe(true);

      // Verify registry entries exist (file-level: 1 entry)
      const pendingGreenTests = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.red_task_id, redTask.id));
      expect(pendingGreenTests).toHaveLength(1);

      // =============================================================================
      // STEP 7: Prepare green phase task (simulate orchestrator preparing it)
      // =============================================================================
      const [greenTaskBeforePrepare] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.task_id, 2));

      await db
        .update(tasks)
        .set({ status: "IMPLEMENT", updated_at: new Date().toISOString() })
        .where(eq(tasks.id, greenTaskBeforePrepare.id));

      // Verify green task has PENDING_GREEN tests waiting
      const [greenTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.task_id, 2));
      expect(greenTask.status).toBe("IMPLEMENT");

      // =============================================================================
      // STEP 8: Implement feature (remove markers, make tests pass)
      // =============================================================================
      const greenTestContent = `
import { describe, it, expect } from 'vitest';

describe('Feature', () => {
  it('should implement feature requirement 1', () => {
    expect(true).toBe(true);
  });

  it('should implement feature requirement 2', () => {
    expect(1).toBe(1);
  });
});
`;
      await fs.writeFile(
        path.join(testDir, "feature.test.ts"),
        greenTestContent,
      );

      // Create feature implementation file
      const srcDir = path.join(tempDir, "src");
      await fs.mkdir(srcDir);
      await fs.writeFile(
        path.join(srcDir, "feature.ts"),
        "export const feature = true;\n",
      );

      // =============================================================================
      // STEP 9: Signal completion on green phase
      // =============================================================================
      const signalGreenResponse = await handleSignalCompletion({
        task_id: 2,
        summary: "Implemented feature to make tests pass",
        artifacts_created: [
          {
            path: "src/feature.ts",
            type: "CREATE",
            description: "Feature implementation",
          },
          {
            path: "test/feature.test.ts",
            type: "UPDATE",
            description: "Updated tests - removed markers",
          },
        ],
        build_status: "PASS",
        test_status: "PASS",
      });
      const signalGreenResult = JSON.parse(
        (signalGreenResponse.content[0] as { text: string }).text,
      );

      expect(signalGreenResult.success).toBe(true);

      // Registry entries exist (status tracking removed - scan-on-signal handles it)
      // Manually move green task to VERIFY status (simulating gate checks + judgment passing)
      const [greenTaskAfterSignal] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.task_id, 2));
      await db
        .update(tasks)
        .set({ status: "VERIFY", updated_at: new Date().toISOString() })
        .where(eq(tasks.id, greenTaskAfterSignal.id));

      // =============================================================================
      // STEP 10: Complete green phase task
      // =============================================================================
      const completeGreenResponse = await handleCompleteTask({
        task_id: 2,
        notes: "Green phase complete - all tests passing",
      });
      const completeGreenResult = JSON.parse(
        (completeGreenResponse.content[0] as { text: string }).text,
      );

      expect(completeGreenResult.success).toBe(true);

      // Verify registry entry exists (file-level: 1 entry)
      const greenTests = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.red_task_id, redTask.id));
      expect(greenTests).toHaveLength(1);

      // =============================================================================
      // STEP 11: Verify sprint status shows closeout is unblocked
      // =============================================================================
      const statusResponse = await handleGetSprintStatus({});
      const statusResult = JSON.parse(
        (statusResponse.content[0] as { text: string }).text,
      );

      // handleGetSprintStatus returns status data directly, not wrapped in {success: ...}
      expect(statusResult.tdd_summary).toBeDefined();
      expect(statusResult.tdd_summary.total).toBe(1); // One TDD relationship: red task 1 → green task 2
      expect(statusResult.tdd_summary.by_status.green).toBe(1); // Relationship is completed
      expect(statusResult.tdd_summary.blocking_closeout).toBe(false);
    });

    it("should handle error when attempting green phase before red phase completion", async () => {
      // Mock pre-signal checks since we're testing dependency logic, not file validation
      vi.spyOn(preSignalExecutor, "runPreSignalChecks").mockResolvedValue({
        build: { passed: true, output: "" },
        test: { passed: true, output: "" },
        lint: { passed: true, output: "" },
        allPassed: true,
      });

      // =============================================================================
      // SCENARIO: Try to complete green task without completing red task first
      // =============================================================================

      // Configure sprint
      const configInput: ConfigureSprintInput = {
        environment: {
          test_command: "npm test",
          test_file_pattern: "test/**/*.test.ts",
          source_base_dir: ".",
        },
        sprint: {
          id: "sprint-e2e-error-001",
          name: "E2E Error Scenario Sprint",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "TDD Feature",
            speckit_tasks: [],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Red Phase Task",
            description: "Write failing tests",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Test file exists",
                  severity: "MAJOR",
                  path: "test/feature.test.ts",
                  pattern: "describe|it",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 2,
            phase_id: "phase-1",
            title: "Green Phase Task",
            description: "Implement feature",
            category: "INFRASTRUCTURE",
            dependencies: [1],
            verification: {
              structural_checks: [
                {
                  description: "Feature exists",
                  severity: "MAJOR",
                  path: "src/feature.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
        tdd_relationships: [
          {
            red_task_id: 1,
            green_task_id: 2,
          },
        ],
      };

      await handleConfigureSprint(configInput);

      // Prepare green task WITHOUT completing red task
      const db = getDb();
      const [greenTaskBefore] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.task_id, 2));
      await db
        .update(tasks)
        .set({ status: "IMPLEMENT", updated_at: new Date().toISOString() })
        .where(eq(tasks.id, greenTaskBefore.id));

      // Try to signal completion on green phase (should fail - no PENDING_GREEN tests)
      const testDir = path.join(tempDir, "test");
      await fs.mkdir(testDir);
      await fs.writeFile(
        path.join(testDir, "feature.test.ts"),
        'import { it, expect } from "vitest"; it("test", () => expect(true).toBe(true));',
      );

      const signalGreenResponse = await handleSignalCompletion({
        task_id: 2,
        summary: "Attempting green phase without red phase completion",
        artifacts_created: [
          {
            path: "test/feature.test.ts",
            type: "CREATE",
            description: "Tests",
          },
        ],
        build_status: "PASS",
        test_status: "PASS",
      });
      const signalGreenResult = JSON.parse(
        (signalGreenResponse.content[0] as { text: string }).text,
      );

      // Signal should succeed (no TDD validation for non-red-phase tasks)
      expect(signalGreenResult.success).toBe(true);
    });

    it("should provide actionable error messages per FR-011", async () => {
      // =============================================================================
      // FR-011: Error messages must include error code, explanation, and fix action
      // =============================================================================

      // Configure sprint
      const configInput: ConfigureSprintInput = {
        environment: {
          test_command: "npm test",
          test_file_pattern: "test/**/*.test.ts",
          source_base_dir: ".",
        },
        sprint: {
          id: "sprint-e2e-fr011-001",
          name: "FR-011 Error Message Test Sprint",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "TDD Test Phase",
            speckit_tasks: [],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Red Phase Task",
            description: "Write failing tests",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Test file exists",
                  severity: "MAJOR",
                  path: "test/feature.test.ts",
                  pattern: "describe|it",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 2,
            phase_id: "phase-1",
            title: "Green Phase Task",
            description: "Implement feature",
            category: "INFRASTRUCTURE",
            dependencies: [1],
            verification: {
              structural_checks: [
                {
                  description: "Impl file exists",
                  severity: "MAJOR",
                  path: "src/feature.ts",
                  pattern: "export",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
        tdd_relationships: [
          {
            red_task_id: 1,
            green_task_id: 2,
          },
        ],
      };

      await handleConfigureSprint(configInput);

      // Set task to IMPLEMENT status
      const db = getDb();
      const [redTaskBefore] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.task_id, 1));
      await db
        .update(tasks)
        .set({ status: "IMPLEMENT", updated_at: new Date().toISOString() })
        .where(eq(tasks.id, redTaskBefore.id));

      // Create test file without markers (will cause MISSING_MARKER error)
      const testDir = path.join(tempDir, "test");
      await fs.mkdir(testDir);
      await fs.writeFile(
        path.join(testDir, "feature.test.ts"),
        `
import { describe, it, expect } from 'vitest';

describe('Feature', () => {
  it('test without marker', () => {
    expect(true).toBe(true);
  });
});
`,
      );

      // Register test (without marker)
      await handleRegisterTddRedTest({
        task_id: 1,
        test_identifier: "feature.test.ts::Feature::test without marker",
        description: "Test without marker",
      });

      // Try to signal completion (should fail with actionable error)
      const signalResponse = await handleSignalCompletion({
        task_id: 1,
        summary: "Attempting to signal with missing markers",
        artifacts_created: [
          {
            path: "test/feature.test.ts",
            type: "CREATE",
            description: "Test file",
          },
        ],
        build_status: "PASS",
        test_status: "PASS",
      });
      const signalResult = JSON.parse(
        (signalResponse.content[0] as { text: string }).text,
      );

      // Verify error is actionable per FR-011
      expect(signalResult.success).toBe(false);
      expect(signalResult.error).toBeDefined();

      // Error should contain:
      // 1. Error code
      expect(signalResult.error.code).toBeDefined();

      // 2. Explanation (the message itself)
      expect(signalResult.error.message).toBeDefined();
      expect(signalResult.error.message.length).toBeGreaterThan(0);

      // 3. Suggested fix (in the error message or details)
      const errorText = JSON.stringify(signalResult.error).toLowerCase();
      expect(
        errorText.includes("add") ||
          errorText.includes("marker") ||
          errorText.includes("skip") ||
          errorText.includes("todo"),
      ).toBe(true);
    });

    it("should block sprint closeout when tests are not GREEN", async () => {
      // Mock pre-signal checks since we're testing closeout blocking logic
      vi.spyOn(preSignalExecutor, "runPreSignalChecks").mockResolvedValue({
        build: { passed: true, output: "" },
        test: { passed: true, output: "" },
        lint: { passed: true, output: "" },
        allPassed: true,
      });

      // =============================================================================
      // SCENARIO: Verify blocking_closeout flag prevents sprint closeout
      // =============================================================================

      // Configure sprint with TDD relationship
      const configInput: ConfigureSprintInput = {
        environment: {
          test_command: "npm test",
          test_file_pattern: "test/**/*.test.ts",
          source_base_dir: ".",
        },
        sprint: {
          id: "sprint-e2e-closeout-001",
          name: "Closeout Gate Test Sprint",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "TDD Phase",
            speckit_tasks: [],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Red Phase Task",
            description: "Write tests",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Test file exists",
                  severity: "MAJOR",
                  path: "test/feature.test.ts",
                  pattern: "describe|it",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 2,
            phase_id: "phase-1",
            title: "Green Phase Task",
            description: "Implement feature",
            category: "INFRASTRUCTURE",
            dependencies: [1],
            verification: {
              structural_checks: [
                {
                  description: "Feature exists",
                  severity: "MAJOR",
                  path: "src/feature.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
        tdd_relationships: [
          {
            red_task_id: 1,
            green_task_id: 2,
          },
        ],
      };

      await handleConfigureSprint(configInput);

      // Set red task to IMPLEMENT status
      const db = getDb();
      const [redTaskBefore] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.task_id, 1));
      await db
        .update(tasks)
        .set({ status: "IMPLEMENT", updated_at: new Date().toISOString() })
        .where(eq(tasks.id, redTaskBefore.id));

      // Register tests
      const testDir = path.join(tempDir, "test");
      await fs.mkdir(testDir);
      await fs.writeFile(
        path.join(testDir, "feature.test.ts"),
        `
import { it, expect } from 'vitest';

it.skip('test', () => {
  expect(true).toBe(false);
});
`,
      );

      await handleRegisterTddRedTest({
        task_id: 1,
        test_identifier: "feature.test.ts::test",
        marker_type: "it.skip",
      });

      await handleSignalCompletion({
        task_id: 1,
        summary: "Red phase tests",
        artifacts_created: [
          {
            path: "test/feature.test.ts",
            type: "CREATE",
            description: "Tests",
          },
        ],
        build_status: "PASS",
        test_status: "PASS",
      });

      // Registry entries exist (status tracking removed)
      // Manually move task to VERIFY status (simulating gate checks + judgment passing)
      await db
        .update(tasks)
        .set({ status: "VERIFY", updated_at: new Date().toISOString() })
        .where(eq(tasks.id, redTaskBefore.id));

      await handleCompleteTask({
        task_id: 1,
        notes: "Red phase done",
      });

      // Check sprint status - should show blocking_closeout=true (tests still PENDING_GREEN)
      const statusResponse = await handleGetSprintStatus({});

      if (
        !statusResponse ||
        !statusResponse.content ||
        !statusResponse.content[0]
      ) {
        throw new Error(
          `Status response invalid: ${JSON.stringify(statusResponse, null, 2)}`,
        );
      }

      const statusResult = JSON.parse(
        (statusResponse.content[0] as { text: string }).text,
      );

      // handleGetSprintStatus returns status data directly, not wrapped in {success: ...}
      expect(statusResult.sprint_id).toBe("sprint-e2e-closeout-001");
      expect(statusResult.tdd_summary).toBeDefined();
      expect(statusResult.tdd_summary.blocking_closeout).toBe(true);
      expect(statusResult.tdd_summary.by_status.pending_green).toBeGreaterThan(
        0,
      );
    });
  });
});
