/**
 * Set Config Handler Tests
 *
 * TDD tests for the set_config MCP tool that allows setting
 * configuration values like pre-signal commands.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
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
        value: "npm run build:prod",
        description: "Production build command",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.key).toBe("pre_signal_build_command");
      expect(parsed.value).toBe("npm run build:prod");

      // Verify in database
      const db = getDb();
      const [row] = await db
        .select()
        .from(config)
        .where(eq(config.key, "pre_signal_build_command"));

      expect(row).toBeDefined();
      expect(row.value).toBe("npm run build:prod");
      expect(row.description).toBe("Production build command");
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

    it("should set pre_signal_skip_build config", async () => {
      const result = await handleSetConfig({
        key: "pre_signal_skip_build",
        value: "true",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);

      const db = getDb();
      const [row] = await db
        .select()
        .from(config)
        .where(eq(config.key, "pre_signal_skip_build"));

      expect(row.value).toBe("true");
    });

    it("should set pre_signal_timeout config", async () => {
      const result = await handleSetConfig({
        key: "pre_signal_timeout",
        value: "60000",
        description: "60 second timeout",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);

      const db = getDb();
      const [row] = await db
        .select()
        .from(config)
        .where(eq(config.key, "pre_signal_timeout"));

      expect(row.value).toBe("60000");
    });
  });
});
