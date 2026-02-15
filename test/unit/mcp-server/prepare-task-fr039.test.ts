/**
 * prepare_task FR-039 Rejection Tests
 *
 * Tests for FR-039: Shell test commands in behavioral_checks must be rejected.
 * Orchestrators must use declarative test_verification instead of shell
 * commands in behavioral checks.
 *
 * Also tests test_verification check storage in prepare_task.
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../../src/db/index.js";
import {
  config,
  phases,
  sprints,
  tasks,
  verificationChecks,
} from "../../../src/db/schema.js";
import { handlePrepareTask } from "../../../src/mcp-server/handlers/prepare-task.js";
import { cleanupTestDb, setupTestDb } from "../../setup/db-cache.js";

// Mock git operations to prevent real git commands
vi.mock("../../../src/core/git.js", () => ({
  autoCommitIfEnabled: vi.fn().mockResolvedValue({ committed: false }),
  generateCommitMessage: vi.fn().mockReturnValue("test commit"),
}));

// Mock audit logging
vi.mock("../../../src/mcp-server/handlers/audit-logging.js", () => ({
  logToolExecution: vi.fn(),
}));

// Default valid input fields (to satisfy schema validation)
const VALID_BASE_INPUT = {
  context:
    "This is a sufficiently long context string to satisfy the 50 character minimum requirement for prepare_task validation",
  acceptance_criteria: [
    { criterion: "Feature works", verification: "manual" },
  ],
  file_operations: [
    {
      operation: "CREATE" as const,
      path: "src/example.ts",
      description: "Create example file",
    },
  ],
  deliverables: ["src/example.ts"],
  priority: "P1" as const,
};

describe("prepare_task - FR-039 and test_verification", () => {
  let tempDir: string;
  const now = new Date().toISOString();

  beforeEach(async () => {
    vi.clearAllMocks();

    tempDir = await setupTestDb("prepare-fr039-");
    const db = getDb();

    // Create sprint
    await db.insert(sprints).values({
      id: "sprint-fr039",
      name: "FR-039 Test Sprint",
      workflow_step: "SELECT_TASK",
      created_at: now,
      updated_at: now,
    });

    // Create phase
    await db.insert(phases).values({
      id: 1,
      sprint_id: "sprint-fr039",
      phase_id: "phase-1",
      phase_name: "Test Phase",
      speckit_tasks: "[]",
      order: 1,
    });

    // Create task in PENDING status
    await db.insert(tasks).values({
      id: 1,
      sprint_id: "sprint-fr039",
      phase_id: 1,
      task_id: 1,
      title: "Test Task",
      description: "A test task for FR-039",
      category: "INFRASTRUCTURE",
      dependencies: "[]",
      status: "PENDING",
      priority: "P1",
      created_at: now,
      updated_at: now,
    });

    // Set workspace path
    await db.insert(config).values({
      key: "workspace_path",
      value: tempDir,
      description: "Workspace path",
      created_at: now,
      updated_at: now,
    });
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  describe("FR-039: reject shell test commands in behavioral_checks", () => {
    /**
     * Helper to call handlePrepareTask and extract the error message
     * from the response. The handler returns a JSON response rather
     * than throwing, so we parse the response and look for the error.
     */
    async function getResponseError(input: unknown): Promise<string> {
      const result = await handlePrepareTask(input);
      const text = result.content[0].text;
      const parsed = JSON.parse(text) as {
        success?: boolean;
        error?: { message?: string };
      };
      if (parsed.success === false && parsed.error?.message) {
        return parsed.error.message;
      }
      return "";
    }

    it("should reject behavioral_checks containing 'npm test'", async () => {
      const errorMsg = await getResponseError({
        task_id: 1,
        ...VALID_BASE_INPUT,
        verification: {
          behavioral_checks: [
            {
              command: "npm test",
              description: "Run tests",
              severity: "BLOCKING",
            },
          ],
        },
      });
      expect(errorMsg).toContain(
        "Use test_verification format instead of behavioral_checks for test execution",
      );
    });

    it("should reject behavioral_checks containing 'npx vitest'", async () => {
      const errorMsg = await getResponseError({
        task_id: 1,
        ...VALID_BASE_INPUT,
        verification: {
          behavioral_checks: [
            {
              command: "npx vitest run test/unit/",
              description: "Run unit tests",
              severity: "BLOCKING",
            },
          ],
        },
      });
      expect(errorMsg).toContain(
        "Use test_verification format instead of behavioral_checks for test execution",
      );
    });

    it("should reject behavioral_checks containing 'npx jest'", async () => {
      const errorMsg = await getResponseError({
        task_id: 1,
        ...VALID_BASE_INPUT,
        verification: {
          behavioral_checks: [
            {
              command: "npx jest --coverage",
              description: "Run jest tests",
              severity: "BLOCKING",
            },
          ],
        },
      });
      expect(errorMsg).toContain(
        "Use test_verification format instead of behavioral_checks for test execution",
      );
    });

    it("should reject behavioral_checks containing 'flutter test'", async () => {
      const errorMsg = await getResponseError({
        task_id: 1,
        ...VALID_BASE_INPUT,
        verification: {
          behavioral_checks: [
            {
              command: "flutter test --tags unit",
              description: "Run flutter tests",
              severity: "BLOCKING",
            },
          ],
        },
      });
      expect(errorMsg).toContain(
        "Use test_verification format instead of behavioral_checks for test execution",
      );
    });

    it("should reject behavioral_checks containing 'npm test' with filter flags", async () => {
      const errorMsg = await getResponseError({
        task_id: 1,
        ...VALID_BASE_INPUT,
        verification: {
          behavioral_checks: [
            {
              command: "npm test -- --filter unit",
              description: "Run test script",
              severity: "BLOCKING",
            },
          ],
        },
      });
      expect(errorMsg).toContain(
        "Use test_verification format instead of behavioral_checks for test execution",
      );
    });

    it("should allow non-test behavioral_checks to pass", async () => {
      // A legitimate command that is NOT a test command
      // This should NOT produce the FR-039 error
      const result = await handlePrepareTask({
        task_id: 1,
        ...VALID_BASE_INPUT,
        verification: {
          behavioral_checks: [
            {
              command: "echo 'hello world'",
              description: "Check output",
              severity: "BLOCKING",
            },
          ],
        },
      });
      const text = result.content[0].text;
      const parsed = JSON.parse(text) as {
        success?: boolean;
        error?: { message?: string };
      };
      // If it failed, make sure it's NOT the FR-039 error
      if (parsed.success === false && parsed.error?.message) {
        expect(parsed.error.message).not.toContain(
          "Use test_verification format instead of behavioral_checks for test execution",
        );
      }
    });

    it("should reject even if test command is mixed with other behavioral_checks", async () => {
      const errorMsg = await getResponseError({
        task_id: 1,
        ...VALID_BASE_INPUT,
        verification: {
          behavioral_checks: [
            {
              command: "echo 'legitimate check'",
              description: "Legitimate check",
              severity: "MAJOR",
            },
            {
              command: "npm test -- --filter unit",
              description: "Run tests sneaked in",
              severity: "BLOCKING",
            },
          ],
        },
      });
      expect(errorMsg).toContain(
        "Use test_verification format instead of behavioral_checks for test execution",
      );
    });
  });

  describe("test_verification check storage", () => {
    it("should store test_verification checks with correct check_type", async () => {
      const db = getDb();

      await handlePrepareTask({
        task_id: 1,
        ...VALID_BASE_INPUT,
        verification: {
          test_verification: [
            {
              tier: "unit",
              expect: "all_pass",
            },
          ],
        },
      });

      const checks = await db
        .select()
        .from(verificationChecks)
        .where(eq(verificationChecks.task_id, 1));

      const tvChecks = checks.filter(
        (check) => check.check_type === "test_verification",
      );

      expect(tvChecks.length).toBeGreaterThanOrEqual(1);

      const tvCheck = tvChecks.find((c) =>
        c.check_id.startsWith("test-verification-"),
      );
      expect(tvCheck).toBeDefined();
      expect(tvCheck!.check_type).toBe("test_verification");

      const parsedConfig = JSON.parse(tvCheck!.check_config);
      expect(parsedConfig.tier).toBe("unit");
      expect(parsedConfig.expect).toBe("all_pass");
    });

    it("should store multiple test_verification checks", async () => {
      const db = getDb();

      await handlePrepareTask({
        task_id: 1,
        ...VALID_BASE_INPUT,
        verification: {
          test_verification: [
            {
              tier: "unit",
              expect: "all_pass",
            },
            {
              tier: "smoke",
              expect: "all_pass",
            },
          ],
        },
      });

      const checks = await db
        .select()
        .from(verificationChecks)
        .where(eq(verificationChecks.task_id, 1));

      const tvChecks = checks.filter(
        (check) => check.check_type === "test_verification",
      );

      // Should have at least 2 test_verification checks
      expect(tvChecks.length).toBeGreaterThanOrEqual(2);
    });

    it("should store test_verification with min_pass_count in check_config", async () => {
      const db = getDb();

      await handlePrepareTask({
        task_id: 1,
        ...VALID_BASE_INPUT,
        verification: {
          test_verification: [
            {
              tier: "integration",
              expect: "min_pass_count",
              min_pass_count: 5,
            },
          ],
        },
      });

      const checks = await db
        .select()
        .from(verificationChecks)
        .where(eq(verificationChecks.task_id, 1));

      const tvCheck = checks.find(
        (check) =>
          check.check_type === "test_verification" &&
          check.check_id.startsWith("test-verification-"),
      );

      expect(tvCheck).toBeDefined();
      const parsedConfig = JSON.parse(tvCheck!.check_config);
      expect(parsedConfig.tier).toBe("integration");
      expect(parsedConfig.expect).toBe("min_pass_count");
      expect(parsedConfig.min_pass_count).toBe(5);
    });

    it("should replace existing generated checks on re-prepare", async () => {
      const db = getDb();

      // First prepare with unit tier
      await handlePrepareTask({
        task_id: 1,
        ...VALID_BASE_INPUT,
        verification: {
          test_verification: [
            {
              tier: "unit",
              expect: "all_pass",
            },
          ],
        },
      });

      // Reset task status for re-prepare
      await db
        .update(tasks)
        .set({ status: "PENDING" })
        .where(eq(tasks.id, 1));

      // Second prepare with smoke tier
      await handlePrepareTask({
        task_id: 1,
        ...VALID_BASE_INPUT,
        context:
          "Second prepare - different tier configuration with enough characters for validation",
        verification: {
          test_verification: [
            {
              tier: "smoke",
              expect: "all_pass",
            },
          ],
        },
      });

      const checks = await db
        .select()
        .from(verificationChecks)
        .where(eq(verificationChecks.task_id, 1));

      // Only the new checks should exist (old ones replaced)
      const tvChecks = checks.filter(
        (c) =>
          c.check_type === "test_verification" &&
          c.check_id.startsWith("test-verification-"),
      );

      // Each re-prepare should replace old generated checks
      expect(tvChecks.length).toBeGreaterThanOrEqual(1);
      const configs = tvChecks.map((c) => JSON.parse(c.check_config));
      const hasSmokeConfig = configs.some(
        (c: { tier: string }) => c.tier === "smoke",
      );
      expect(hasSmokeConfig).toBe(true);
    });
  });
});
