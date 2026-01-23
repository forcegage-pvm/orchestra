/**
 * Set Config Handler Tests
 *
 * TDD tests for the set_config MCP tool that allows setting
 * configuration values like pre-signal commands.
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "../../src/db/index.js";
import { config } from "../../src/db/schema.js";
import { handleSetConfig } from "../../src/mcp-server/handlers/set-config.js";

describe("Set Config Handler", () => {
  beforeEach(async () => {
    resetDb();
  });

  afterEach(async () => {
    resetDb();
  });

  describe("handleSetConfig", () => {
    it("should set a new config value", async () => {
      const result = await handleSetConfig({
        key: "pre_signal_build_command",
        value: "npm run build",
        description: "Build command",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.key).toBe("pre_signal_build_command");
      expect(parsed.value).toBe("npm run build");

      // Verify in database
      const db = getDb();
      const [row] = await db
        .select()
        .from(config)
        .where(eq(config.key, "pre_signal_build_command"));

      expect(row).toBeDefined();
      expect(row.value).toBe("npm run build");
      expect(row.description).toBe("Build command");
    });

    it("should update an existing config value", async () => {
      const db = getDb();
      const uniqueKey = `test_update_key_${Date.now()}`;

      // Insert initial value
      await db.insert(config).values({
        key: uniqueKey,
        value: "npm test",
        description: "Test command",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Update via handler
      const result = await handleSetConfig({
        key: uniqueKey,
        value: "npm run test:coverage",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.value).toBe("npm run test:coverage");
      expect(parsed.action).toBe("updated");

      // Verify in database
      const [row] = await db
        .select()
        .from(config)
        .where(eq(config.key, uniqueKey));

      expect(row.value).toBe("npm run test:coverage");
    });

    it("should require key parameter", async () => {
      const result = await handleSetConfig({
        value: "some value",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");
    });

    it("should require value parameter", async () => {
      const result = await handleSetConfig({
        key: "some_key",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");
    });

    it("should reject pre_signal_skip_build=true as dangerous", async () => {
      const result = await handleSetConfig({
        key: "pre_signal_skip_build",
        value: "true",
      });

      const parsed = JSON.parse(result.content[0].text);
      // Should be rejected as dangerous - skipping checks masks real errors
      expect(parsed.success).toBe(false);
      expect(parsed.error.message).toContain("DANGEROUS");
    });

    it("should allow pre_signal_skip_build=false", async () => {
      const result = await handleSetConfig({
        key: "pre_signal_skip_build",
        value: "false",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);

      const db = getDb();
      const [row] = await db
        .select()
        .from(config)
        .where(eq(config.key, "pre_signal_skip_build"));

      expect(row.value).toBe("false");
    });

    it("should set pre_signal_timeout config", async () => {
      const result = await handleSetConfig({
        key: "pre_signal_timeout",
        value: "120000",
        description: "2 minute timeout",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);

      const db = getDb();
      const [row] = await db
        .select()
        .from(config)
        .where(eq(config.key, "pre_signal_timeout"));

      expect(row.value).toBe("120000");
    });

    it("should reject build:prod as invalid script", async () => {
      const result = await handleSetConfig({
        key: "pre_signal_build_command",
        value: "npm run build:prod",
      });

      const parsed = JSON.parse(result.content[0].text);
      // Should be rejected - build:prod doesn't exist
      expect(parsed.success).toBe(false);
      expect(parsed.error.message).toContain("DANGEROUS");
      expect(parsed.error.message).toContain("build:prod");
    });

    it("should reject too short timeout", async () => {
      const result = await handleSetConfig({
        key: "pre_signal_timeout",
        value: "30000",
      });

      const parsed = JSON.parse(result.content[0].text);
      // Should be rejected - 30s is too short
      expect(parsed.success).toBe(false);
      expect(parsed.error.message).toContain("DANGEROUS");
      expect(parsed.error.message).toContain("too short");
    });
  });
});
