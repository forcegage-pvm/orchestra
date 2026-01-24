/**
 * prepare_task TDD Red-Phase Verification Auto-Injection Tests
 *
 * Tests for auto-injection of TDD red-phase verification checks in prepare_task.
 * Validates that checks are correctly injected based on tdd_red_phase flag.
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../src/db/index.js";
import {
  phases,
  sprints,
  sprintSettings,
  tasks,
  verificationChecks,
} from "../../src/db/schema.js";
import { handlePrepareTask } from "../../src/mcp-server/handlers/prepare-task.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

describe("prepare_task TDD Red-Phase Verification Auto-Injection", () => {
  const testSprintId = "test-sprint-tdd-red";
  let currentPhaseId: number;
  let tempDir: string;

  beforeEach(async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    tempDir = await setupTestDb("tdd-red-test-");
    const db = getDb();
    const now = new Date().toISOString();

    // Create test sprint
    await db.insert(sprints).values({
      id: testSprintId,
      name: "TDD Red Test Sprint",
      workflow_step: "SELECT_TASK",
      is_active: 1,
      created_at: now,
      updated_at: now,
    });

    // Create test phase
    await db.insert(phases).values({
      id: 1,
      sprint_id: testSprintId,
      phase_id: "phase-tdd-red",
      phase_name: "TDD Red Phase",
      speckit_tasks: "[]",
      order: 1,
    });

    currentPhaseId = 1;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestDb(tempDir);
  });

  describe("TypeScript projects", () => {
    beforeEach(async () => {
      const db = getDb();
      const now = new Date().toISOString();

      await db.insert(sprintSettings).values([
        {
          sprint_id: testSprintId,
          key: "test_command",
          value: "npm test",
          created_at: now,
          updated_at: now,
        },
        {
          sprint_id: testSprintId,
          key: "test_file_pattern",
          value: "test/**/*.test.ts",
          created_at: now,
          updated_at: now,
        },
        {
          sprint_id: testSprintId,
          key: "source_base_dir",
          value: ".",
          created_at: now,
          updated_at: now,
        },
      ]);

      // Mark as TypeScript project with test script
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-project",
          scripts: { test: "vitest" },
        }),
      );
    });

    it("should inject red-phase checks when tdd_red_phase=true", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create task with tdd_red_phase=true
      await db.insert(tasks).values({
        id: 1,
        sprint_id: testSprintId,
        phase_id: currentPhaseId,
        task_id: 1,
        title: "Add failing test",
        category: "INFRASTRUCTURE",
        status: "PENDING",
        description: "Create red-phase test",
        dependencies: "[]",
        tdd_red_phase: true,
        created_at: now,
        updated_at: now,
      });

      // Prepare task
      const result = await handlePrepareTask({
        task_id: 1,
        priority: "P0",
        context:
          "Test task for TDD red-phase verification. This validates auto-injection of checks.",
        acceptance_criteria: [
          { criterion: "Test criterion", verification: "Manual check" },
        ],
        file_operations: [
          {
            operation: "CREATE",
            path: "test/tdd-red/feature.test.ts",
            description: "Failing test",
          },
        ],
        deliverables: ["feature.test.ts"],
      });

      // Verify task prepared successfully
      const resultObj = JSON.parse(result.content[0].text);
      expect(resultObj.success).toBe(true);

      // Verify checks were injected
      const checks = await db
        .select()
        .from(verificationChecks)
        .where(eq(verificationChecks.task_id, 1));

      // Should have 4 checks: 2 behavioral + 2 structural (task-ID + marker)
      expect(checks).toHaveLength(4);

      // Check 1: Red tests must fail
      const redFailCheck = checks.find(
        (c) =>
          c.check_type === "behavioral" &&
          c.description.includes("Red-phase tests must fail"),
      );
      expect(redFailCheck).toBeDefined();
      expect(redFailCheck!.severity).toBe("BLOCKING");
      const redFailConfig = JSON.parse(redFailCheck!.check_config);
      // Templates now include filter flags directly
      expect(redFailConfig.command).toBe('npm test -- -t "\\[tdd-red\\]"');
      expect(redFailConfig.expect_exit_code).toBe(1);

      // Check 2: Non-red tests must pass
      const greenPassCheck = checks.find(
        (c) =>
          c.check_type === "behavioral" &&
          c.description.includes("Non-red tests must pass"),
      );
      expect(greenPassCheck).toBeDefined();
      expect(greenPassCheck!.severity).toBe("BLOCKING");
      const greenPassConfig = JSON.parse(greenPassCheck!.check_config);
      expect(greenPassConfig.expect_exit_code).toBe(0);

      // Check 3: Structural check for task-ID annotation
      const taskIdCheck = checks.find(
        (c) =>
          c.check_type === "structural" &&
          c.description.includes("Task-ID annotation"),
      );
      expect(taskIdCheck).toBeDefined();
      expect(taskIdCheck!.severity).toBe("BLOCKING");

      // Check 4: Structural check for [tdd-red] marker
      const markerCheck = checks.find(
        (c) =>
          c.check_type === "structural" &&
          c.description.includes("Red-phase test marker"),
      );
      expect(markerCheck).toBeDefined();
      expect(markerCheck!.severity).toBe("BLOCKING");
      const markerConfig = JSON.parse(markerCheck!.check_config);
      expect(markerConfig.path).toBe("test/**/*.test.ts");
      expect(markerConfig.min_matches).toBe(1);
    });

    it("should NOT inject cleanup checks when tdd_red_phase=false (cleanup is implementor responsibility)", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create task with tdd_red_phase=false (default)
      await db.insert(tasks).values({
        id: 1,
        sprint_id: testSprintId,
        phase_id: currentPhaseId,
        task_id: 1,
        title: "Implement feature",
        category: "FEATURE",
        status: "PENDING",
        description: "Green phase implementation",
        dependencies: "[]",
        tdd_red_phase: false,
        created_at: now,
        updated_at: now,
      });

      // Prepare task
      const result = await handlePrepareTask({
        task_id: 1,
        priority: "P0",
        context:
          "Test task for TDD cleanup verification. Cleanup is the implementor's responsibility during the GREEN phase.",
        acceptance_criteria: [
          { criterion: "Test criterion", verification: "Manual check" },
        ],
        file_operations: [
          {
            operation: "CREATE",
            path: "src/feature.ts",
            description: "Feature",
          },
        ],
        deliverables: ["feature.ts"],
      });

      // Verify task prepared successfully
      const resultObj = JSON.parse(result.content[0].text);
      expect(resultObj.success).toBe(true);

      // Verify NO cleanup check was auto-injected (cleanup is now implementor responsibility)
      const checks = await db
        .select()
        .from(verificationChecks)
        .where(eq(verificationChecks.task_id, 1));

      const cleanupCheck = checks.find(
        (c) =>
          c.check_type === "structural" &&
          c.description.includes("No red-phase"),
      );
      // Cleanup checks should NOT be auto-injected - orchestrator explicitly adds them
      // to GREEN phase tasks when appropriate
      expect(cleanupCheck).toBeUndefined();
    });
  });

  describe("Dart projects", () => {
    beforeEach(async () => {
      const db = getDb();
      const now = new Date().toISOString();

      await db.insert(sprintSettings).values([
        {
          sprint_id: testSprintId,
          key: "test_command",
          value: "flutter test",
          created_at: now,
          updated_at: now,
        },
        {
          sprint_id: testSprintId,
          key: "test_file_pattern",
          value: "test/**/*.dart",
          created_at: now,
          updated_at: now,
        },
        {
          sprint_id: testSprintId,
          key: "source_base_dir",
          value: ".",
          created_at: now,
          updated_at: now,
        },
      ]);

      // Mark as Dart project
      fs.writeFileSync(
        path.join(tempDir, "pubspec.yaml"),
        "name: test_project\n",
      );
    });

    it("should inject Dart-specific red-phase checks when tdd_red_phase=true", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create task with tdd_red_phase=true
      await db.insert(tasks).values({
        id: 1,
        sprint_id: testSprintId,
        phase_id: currentPhaseId,
        task_id: 1,
        title: "Add failing widget test",
        category: "INTEGRATION",
        status: "PENDING",
        description: "Create red-phase test",
        dependencies: "[]",
        tdd_red_phase: true,
        created_at: now,
        updated_at: now,
      });

      // Prepare task
      const result = await handlePrepareTask({
        task_id: 1,
        priority: "P0",
        context:
          "Test task for Dart TDD red-phase verification. Uses flutter test commands.",
        acceptance_criteria: [
          { criterion: "Test criterion", verification: "Manual check" },
        ],
        file_operations: [
          {
            operation: "CREATE",
            path: "test/widget_test.dart",
            description: "Failing test",
          },
        ],
        deliverables: ["widget_test.dart"],
      });

      // Verify task prepared successfully
      const resultObj = JSON.parse(result.content[0].text);
      expect(resultObj.success).toBe(true);

      // Verify checks were injected
      const checks = await db
        .select()
        .from(verificationChecks)
        .where(eq(verificationChecks.task_id, 1));

      // Should have 4 checks: 2 behavioral + 2 structural (task-ID + marker)
      expect(checks).toHaveLength(4);

      // Check 1: Tagged tests must fail
      const taggedFailCheck = checks.find(
        (c) =>
          c.check_type === "behavioral" &&
          c.description.includes("Tagged tests must fail"),
      );
      expect(taggedFailCheck).toBeDefined();
      const taggedConfig = JSON.parse(taggedFailCheck!.check_config);
      // Templates now include filter flags directly
      expect(taggedConfig.command).toBe("flutter test --tags tdd-red");
      expect(taggedConfig.expect_exit_code).toBe(1);

      // Check 2: Non-tagged tests must pass
      const nonTaggedCheck = checks.find(
        (c) =>
          c.check_type === "behavioral" &&
          c.description.includes("Non-tagged tests must pass"),
      );
      expect(nonTaggedCheck).toBeDefined();
      const nonTaggedConfig = JSON.parse(nonTaggedCheck!.check_config);
      // Templates now include filter flags directly
      expect(nonTaggedConfig.command).toBe(
        "flutter test --exclude-tags tdd-red",
      );
      expect(nonTaggedConfig.expect_exit_code).toBe(0);

      // Check 3: Structural check for task-ID annotation
      const taskIdCheck = checks.find(
        (c) =>
          c.check_type === "structural" &&
          c.description.includes("Task-ID annotation"),
      );
      expect(taskIdCheck).toBeDefined();

      // Check 4: Structural check for @Tags(['tdd-red']) marker
      const markerCheck = checks.find(
        (c) =>
          c.check_type === "structural" &&
          c.description.includes("Red-phase marker"),
      );
      expect(markerCheck).toBeDefined();
      const markerConfig = JSON.parse(markerCheck!.check_config);
      expect(markerConfig.path).toBe("test/**/*.dart");
      expect(markerConfig.pattern).toContain("tdd-red");
      expect(markerConfig.min_matches).toBe(1);
    });

    it("should NOT inject Dart-specific cleanup checks when tdd_red_phase=false (cleanup is implementor responsibility)", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create task with tdd_red_phase=false
      await db.insert(tasks).values({
        id: 1,
        sprint_id: testSprintId,
        phase_id: currentPhaseId,
        task_id: 1,
        title: "Implement widget",
        category: "VISUAL",
        status: "PENDING",
        description: "Green phase implementation",
        dependencies: "[]",
        tdd_red_phase: false,
        created_at: now,
        updated_at: now,
      });

      // Prepare task
      const result = await handlePrepareTask({
        task_id: 1,
        priority: "P0",
        context:
          "Test task for Dart cleanup verification. Cleanup is the implementor's responsibility during the GREEN phase.",
        acceptance_criteria: [
          { criterion: "Test criterion", verification: "Manual check" },
        ],
        file_operations: [
          {
            operation: "CREATE",
            path: "lib/widget.dart",
            description: "Widget",
          },
        ],
        deliverables: ["widget.dart"],
      });

      // Verify task prepared successfully
      const resultObj = JSON.parse(result.content[0].text);
      expect(resultObj.success).toBe(true);

      // Verify NO cleanup check was auto-injected (cleanup is now implementor responsibility)
      const checks = await db
        .select()
        .from(verificationChecks)
        .where(eq(verificationChecks.task_id, 1));

      const cleanupCheck = checks.find(
        (c) =>
          c.check_type === "structural" &&
          c.description.includes("No red-phase markers"),
      );
      // Cleanup checks should NOT be auto-injected - orchestrator explicitly adds them
      // to GREEN phase tasks when appropriate
      expect(cleanupCheck).toBeUndefined();
    });
  });

  describe("Sprint environment configuration", () => {
    it("should use sprint environment config when available", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Add sprint environment settings
      await db.insert(sprintSettings).values([
        {
          sprint_id: testSprintId,
          key: "test_command",
          value: "npm test",
          created_at: now,
          updated_at: now,
        },
        {
          sprint_id: testSprintId,
          key: "test_file_pattern",
          value: "test/**/*.test.ts",
          created_at: now,
          updated_at: now,
        },
        {
          sprint_id: testSprintId,
          key: "source_base_dir",
          value: ".",
          created_at: now,
          updated_at: now,
        },
      ]);

      // Create package.json with test script for npm test validation
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-project",
          scripts: { test: "vitest" },
        }),
      );

      // No pubspec.yaml - but config is explicit

      // Create task with tdd_red_phase=true
      await db.insert(tasks).values({
        id: 1,
        sprint_id: testSprintId,
        phase_id: currentPhaseId,
        task_id: 1,
        title: "Task with explicit config",
        category: "INFRASTRUCTURE",
        status: "PENDING",
        description: "Task using sprint environment config",
        dependencies: "[]",
        tdd_red_phase: true,
        created_at: now,
        updated_at: now,
      });

      // Prepare task
      const result = await handlePrepareTask({
        task_id: 1,
        priority: "P0",
        context: "Test task using explicit sprint environment configuration.",
        acceptance_criteria: [
          { criterion: "Test criterion", verification: "Manual check" },
        ],
        file_operations: [
          {
            operation: "CREATE",
            path: "src/feature.ts",
            description: "Feature",
          },
        ],
        deliverables: ["feature.ts"],
      });

      // Verify task prepared successfully
      const resultObj = JSON.parse(result.content[0].text);
      expect(resultObj.success).toBe(true);

      // Verify TDD checks WERE injected using sprint config
      const checks = await db
        .select()
        .from(verificationChecks)
        .where(eq(verificationChecks.task_id, 1));

      // Should have TDD-specific checks (using npm test from config)
      const tddChecks = checks.filter((c) =>
        c.description.toLowerCase().includes("tdd"),
      );
      expect(tddChecks.length).toBeGreaterThan(0);

      // Verify check uses the configured test command
      const behavioralCheck = tddChecks.find(
        (c) => c.check_type === "behavioral",
      );
      expect(behavioralCheck).toBeDefined();
      const config = JSON.parse(behavioralCheck!.check_config as string);
      expect(config.command).toContain("npm test");
    });

    it("should prioritize sprint config over file_operations inference", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Add sprint environment settings with explicit config
      await db.insert(sprintSettings).values([
        {
          sprint_id: testSprintId,
          key: "test_command",
          value: "npm test -- --testPathPattern=custom",
          created_at: now,
          updated_at: now,
        },
        {
          sprint_id: testSprintId,
          key: "test_file_pattern",
          value: "spec/**/*.spec.ts",
          created_at: now,
          updated_at: now,
        },
        {
          sprint_id: testSprintId,
          key: "source_base_dir",
          value: ".",
          created_at: now,
          updated_at: now,
        },
      ]);

      // Create package.json with test script for validation
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-project",
          scripts: { test: "vitest" },
        }),
      );

      // Create task with file_operations that would infer TypeScript
      // Without sprint config, it would default to "test/**/*.test.ts"
      await db.insert(tasks).values({
        id: 1,
        sprint_id: testSprintId,
        phase_id: currentPhaseId,
        task_id: 1,
        title: "Task with custom patterns",
        category: "INFRASTRUCTURE",
        status: "PENDING",
        description: "Sprint config should override default patterns",
        dependencies: "[]",
        tdd_red_phase: true,
        created_at: now,
        updated_at: now,
      });

      // Prepare task with file_operations having .ts extension
      // Without explicit sprint config, this would infer "test/**/*.test.ts"
      const result = await handlePrepareTask({
        task_id: 1,
        priority: "P0",
        context:
          "Test that explicit sprint config overrides default pattern inference.",
        acceptance_criteria: [
          { criterion: "Test criterion", verification: "Manual check" },
        ],
        file_operations: [
          {
            operation: "CREATE",
            path: "src/feature.ts",
            description: "TypeScript file (would infer test/**/*.test.ts)",
          },
        ],
        deliverables: ["feature.ts"],
      });

      // Verify task prepared successfully
      const resultObj = JSON.parse(result.content[0].text);
      expect(resultObj.success).toBe(true);

      // Verify checks use sprint config, NOT inferred from file extensions
      const checks = await db
        .select()
        .from(verificationChecks)
        .where(eq(verificationChecks.task_id, 1));

      const behavioralCheck = checks.find((c) => c.check_type === "behavioral");
      expect(behavioralCheck).toBeDefined();
      const config = JSON.parse(behavioralCheck!.check_config as string);

      // Should use custom command from sprint config
      // NOT default "npm test"
      expect(config.command).toContain("--testPathPattern=custom");

      // Verify structural check uses configured test file pattern
      const structuralChecks = checks.filter(
        (c) => c.check_type === "structural",
      );
      expect(structuralChecks.length).toBeGreaterThan(0);

      // Find structural check with the configured pattern
      const structuralCheck = structuralChecks.find((c) => {
        const cfg = JSON.parse(c.check_config as string);
        return cfg.path === "spec/**/*.spec.ts";
      });
      expect(structuralCheck).toBeDefined();
    });

    it("should fall back to language detection when no sprint config", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // NO sprint settings - will fall back to language detection
      // Create package.json for npm test validation
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-project",
          scripts: { test: "vitest" },
        }),
      );

      // Create task with tdd_red_phase=true
      await db.insert(tasks).values({
        id: 1,
        sprint_id: testSprintId,
        phase_id: currentPhaseId,
        task_id: 1,
        title: "Task without config",
        category: "INFRASTRUCTURE",
        status: "PENDING",
        description: "Task falling back to language detection",
        dependencies: "[]",
        tdd_red_phase: true,
        created_at: now,
        updated_at: now,
      });

      // Prepare task
      const result = await handlePrepareTask({
        task_id: 1,
        priority: "P0",
        context:
          "Test task without sprint config - should fallback to defaults.",
        acceptance_criteria: [
          { criterion: "Test criterion", verification: "Manual check" },
        ],
        file_operations: [
          { operation: "CREATE", path: "src/feature.c", description: "C file" },
        ],
        deliverables: ["feature.c"],
      });

      // Verify task prepared successfully
      const resultObj = JSON.parse(result.content[0].text);
      expect(resultObj.success).toBe(true);

      // Verify TDD checks ARE injected (defaults to TypeScript when unknown)
      const checks = await db
        .select()
        .from(verificationChecks)
        .where(eq(verificationChecks.task_id, 1));

      // Should have TDD-specific checks (TypeScript defaults)
      const tddChecks = checks.filter((c) =>
        c.description.toLowerCase().includes("tdd"),
      );
      // When there's no sprint config and no recognized language, it falls back to TypeScript defaults
      expect(tddChecks.length).toBeGreaterThan(0);
    });
  });

  describe("Check ID generation", () => {
    beforeEach(() => {
      // Mark as TypeScript project
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "test-project" }),
      );
    });

    it("should generate unique check IDs when multiple checks exist", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create task
      await db.insert(tasks).values({
        id: 1,
        sprint_id: testSprintId,
        phase_id: currentPhaseId,
        task_id: 1,
        title: "Task with existing checks",
        category: "INFRASTRUCTURE",
        status: "PENDING",
        description: "Test",
        dependencies: "[]",
        tdd_red_phase: true,
        created_at: now,
        updated_at: now,
      });

      // Insert existing checks
      await db.insert(verificationChecks).values([
        {
          task_id: 1,
          check_id: "behav-0",
          check_type: "behavioral",
          description: "Existing behavioral check",
          severity: "MAJOR",
          check_config: "{}",
          created_at: now,
        },
        {
          task_id: 1,
          check_id: "struct-0",
          check_type: "structural",
          description: "Existing structural check",
          severity: "MAJOR",
          check_config: "{}",
          created_at: now,
        },
      ]);

      // Prepare task
      await handlePrepareTask({
        task_id: 1,
        priority: "P0",
        context:
          "Test task for verifying unique check ID generation with existing checks.",
        acceptance_criteria: [
          { criterion: "Test criterion", verification: "Manual check" },
        ],
        file_operations: [
          {
            operation: "CREATE",
            path: "test/tdd-red/feature.test.ts",
            description: "Test",
          },
        ],
        deliverables: ["feature.test.ts"],
      });

      // Verify check IDs are unique
      const checks = await db
        .select()
        .from(verificationChecks)
        .where(eq(verificationChecks.task_id, 1));

      const checkIds = checks.map((c) => c.check_id);
      const uniqueIds = new Set(checkIds);
      expect(uniqueIds.size).toBe(checkIds.length); // All IDs are unique

      // Verify TDD checks have correct ID format
      const tddChecks = checks.filter((c) => c.check_id.includes("tdd-red"));
      expect(tddChecks.length).toBeGreaterThan(0);
      tddChecks.forEach((check) => {
        expect(check.check_id).toMatch(/^(behav|struct)-tdd-red-\d+$/);
      });
    });
  });
});
