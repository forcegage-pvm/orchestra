/**
 * Sprint Config Handler Tests
 *
 * Tests for get_sprint_config and set_sprint_config MCP tools.
 * Verifies get/set operations, fallback to global config, and error handling.
 */

import { eq, and } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../src/db/index.js";
import { config, sprintSettings, sprints } from "../../src/db/schema.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";
import { handleGetSprintConfig } from "../../src/mcp-server/handlers/get-sprint-config.js";
import { handleSetSprintConfig } from "../../src/mcp-server/handlers/set-sprint-config.js";

describe("Sprint Config Handlers", () => {
  const testSprintId = "test-sprint-001";
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("sprint-config-");

    // Create a test sprint
    const db = getDb();
    const now = new Date().toISOString();
    await db.insert(sprints).values({
      id: testSprintId,
      name: "Test Sprint",
      workflow_step: "CONFIGURE",
      is_active: true,
      created_at: now,
      updated_at: now,
    });
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  describe("handleSetSprintConfig", () => {
    it("should set a new sprint-specific config value", async () => {
      const result = await handleSetSprintConfig({
        sprint_id: testSprintId,
        key: "tdd.require_tests",
        value: "true",
        description: "Enable TDD for this sprint",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.key).toBe("tdd.require_tests");
      expect(parsed.value).toBe("true");
      expect(parsed.sprint_id).toBe(testSprintId);
      expect(parsed.action).toBe("created");

      // Verify in database
      const db = getDb();
      const [row] = await db
        .select()
        .from(sprintSettings)
        .where(
          and(
            eq(sprintSettings.sprint_id, testSprintId),
            eq(sprintSettings.key, "tdd.require_tests")
          )
        );

      expect(row).toBeDefined();
      expect(row.value).toBe("true");
      expect(row.description).toBe("Enable TDD for this sprint");
    });

    it("should update an existing sprint-specific config value", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Insert initial value
      await db.insert(sprintSettings).values({
        sprint_id: testSprintId,
        key: "tdd.test_file_pattern",
        value: "test/**/*.test.ts",
        description: "Test file pattern",
        created_at: now,
        updated_at: now,
      });

      // Update via handler
      const result = await handleSetSprintConfig({
        sprint_id: testSprintId,
        key: "tdd.test_file_pattern",
        value: "extension/test/**/*.test.ts",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.value).toBe("extension/test/**/*.test.ts");
      expect(parsed.action).toBe("updated");

      // Verify in database
      const [row] = await db
        .select()
        .from(sprintSettings)
        .where(
          and(
            eq(sprintSettings.sprint_id, testSprintId),
            eq(sprintSettings.key, "tdd.test_file_pattern")
          )
        );

      expect(row.value).toBe("extension/test/**/*.test.ts");
    });

    it("should use active sprint if sprint_id not provided", async () => {
      const result = await handleSetSprintConfig({
        key: "pre_signal_build_command",
        value: "npm run build",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.sprint_id).toBe(testSprintId);
    });

    it("should fail if sprint does not exist", async () => {
      const result = await handleSetSprintConfig({
        sprint_id: "nonexistent-sprint",
        key: "some_key",
        value: "some_value",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error.message).toContain("not found");
    });

    it("should fail if no active sprint exists", async () => {
      const db = getDb();
      // Deactivate the sprint
      await db
        .update(sprints)
        .set({ is_active: false })
        .where(eq(sprints.id, testSprintId));

      const result = await handleSetSprintConfig({
        key: "some_key",
        value: "some_value",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error.message).toContain("No active sprint");
    });

    it("should require key parameter", async () => {
      const result = await handleSetSprintConfig({
        value: "some value",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");
    });

    it("should require value parameter", async () => {
      const result = await handleSetSprintConfig({
        key: "some_key",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("handleGetSprintConfig", () => {
    it("should get sprint-specific config value", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Insert sprint-specific config
      await db.insert(sprintSettings).values({
        sprint_id: testSprintId,
        key: "tdd.require_tests",
        value: "true",
        created_at: now,
        updated_at: now,
      });

      const result = await handleGetSprintConfig({
        sprint_id: testSprintId,
        key: "tdd.require_tests",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.key).toBe("tdd.require_tests");
      expect(parsed.value).toBe("true");
      expect(parsed.source).toBe("sprint");
      expect(parsed.sprint_id).toBe(testSprintId);
    });

    it("should fall back to global config when sprint-specific value not found", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Insert only global config
      await db.insert(config).values({
        key: "tdd.require_tests",
        value: "false",
        description: "Global TDD setting",
        created_at: now,
        updated_at: now,
      });

      const result = await handleGetSprintConfig({
        sprint_id: testSprintId,
        key: "tdd.require_tests",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.key).toBe("tdd.require_tests");
      expect(parsed.value).toBe("false");
      expect(parsed.source).toBe("global");
      expect(parsed.sprint_id).toBe(testSprintId);
    });

    it("should prefer sprint-specific over global config", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Insert both global and sprint-specific
      await db.insert(config).values({
        key: "tdd.require_tests",
        value: "false",
        created_at: now,
        updated_at: now,
      });

      await db.insert(sprintSettings).values({
        sprint_id: testSprintId,
        key: "tdd.require_tests",
        value: "true",
        created_at: now,
        updated_at: now,
      });

      const result = await handleGetSprintConfig({
        sprint_id: testSprintId,
        key: "tdd.require_tests",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.value).toBe("true"); // Sprint-specific value
      expect(parsed.source).toBe("sprint");
    });

    it("should return not_found when neither sprint nor global config exists", async () => {
      const result = await handleGetSprintConfig({
        sprint_id: testSprintId,
        key: "nonexistent.key",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.value).toBe(null);
      expect(parsed.source).toBe("not_found");
    });

    it("should use active sprint if sprint_id not provided", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      await db.insert(sprintSettings).values({
        sprint_id: testSprintId,
        key: "test_key",
        value: "test_value",
        created_at: now,
        updated_at: now,
      });

      const result = await handleGetSprintConfig({
        key: "test_key",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.sprint_id).toBe(testSprintId);
      expect(parsed.value).toBe("test_value");
    });

    it("should fail if no active sprint exists", async () => {
      const db = getDb();
      // Deactivate the sprint
      await db
        .update(sprints)
        .set({ is_active: false })
        .where(eq(sprints.id, testSprintId));

      const result = await handleGetSprintConfig({
        key: "some_key",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error.message).toContain("No active sprint");
    });

    it("should require key parameter", async () => {
      const result = await handleGetSprintConfig({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Integration: Set and Get", () => {
    it("should set and get sprint config values", async () => {
      // Set value
      const setResult = await handleSetSprintConfig({
        sprint_id: testSprintId,
        key: "tdd.test_pattern",
        value: "describe|test|it",
        description: "Test pattern regex",
      });

      const setParsed = JSON.parse(setResult.content[0].text);
      expect(setParsed.success).toBe(true);

      // Get value
      const getResult = await handleGetSprintConfig({
        sprint_id: testSprintId,
        key: "tdd.test_pattern",
      });

      const getParsed = JSON.parse(getResult.content[0].text);
      expect(getParsed.success).toBe(true);
      expect(getParsed.value).toBe("describe|test|it");
      expect(getParsed.source).toBe("sprint");
    });

    it("should handle multiple sprint configs independently", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create second sprint
      await db.insert(sprints).values({
        id: "test-sprint-002",
        name: "Test Sprint 2",
        workflow_step: "CONFIGURE",
        is_active: false,
        created_at: now,
        updated_at: now,
      });

      // Set different values for each sprint
      await handleSetSprintConfig({
        sprint_id: testSprintId,
        key: "tdd.require_tests",
        value: "true",
      });

      await handleSetSprintConfig({
        sprint_id: "test-sprint-002",
        key: "tdd.require_tests",
        value: "false",
      });

      // Verify each sprint has its own value
      const result1 = await handleGetSprintConfig({
        sprint_id: testSprintId,
        key: "tdd.require_tests",
      });

      const result2 = await handleGetSprintConfig({
        sprint_id: "test-sprint-002",
        key: "tdd.require_tests",
      });

      const parsed1 = JSON.parse(result1.content[0].text);
      const parsed2 = JSON.parse(result2.content[0].text);

      expect(parsed1.value).toBe("true");
      expect(parsed2.value).toBe("false");
    });
  });
});
