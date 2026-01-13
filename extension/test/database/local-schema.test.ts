/**
 * Tests for local-schema.ts
 *
 * Verifies that the chatSessions table is correctly defined with all required
 * columns, types, and constraints.
 */

import { describe, expect, it } from "vitest";
import { chatSessions } from "../../src/database/local-schema.js";

describe("chatSessions table schema", () => {
  it("should have table name 'chat_sessions'", () => {
    // Verify the table name is correctly set to 'chat_sessions'
    // @ts-expect-error - accessing internal property for testing
    expect(chatSessions[Symbol.for("drizzle:Name")]).toBe("chat_sessions");
  });

  it("should have id column as PRIMARY KEY with autoIncrement", () => {
    const columns = chatSessions.id;
    expect(columns).toBeDefined();
    expect(columns.name).toBe("id");
    expect(columns.dataType).toBe("number");
    expect(columns.primary).toBe(true);
    // @ts-expect-error - accessing internal property for testing
    expect(columns.autoIncrement).toBe(true);
  });

  it("should have role column as TEXT with UNIQUE constraint", () => {
    const columns = chatSessions.role;
    expect(columns).toBeDefined();
    expect(columns.name).toBe("role");
    expect(columns.dataType).toBe("string");
    expect(columns.notNull).toBe(true);
    // @ts-expect-error - accessing internal property for testing
    expect(columns.isUnique).toBe(true);
  });

  it("should have tab_label column as TEXT NOT NULL", () => {
    const columns = chatSessions.tab_label;
    expect(columns).toBeDefined();
    expect(columns.name).toBe("tab_label");
    expect(columns.dataType).toBe("string");
    expect(columns.notNull).toBe(true);
  });

  it("should have created_at column as TEXT NOT NULL", () => {
    const columns = chatSessions.created_at;
    expect(columns).toBeDefined();
    expect(columns.name).toBe("created_at");
    expect(columns.dataType).toBe("string");
    expect(columns.notNull).toBe(true);
  });

  it("should have last_used_at column as TEXT NOT NULL", () => {
    const columns = chatSessions.last_used_at;
    expect(columns).toBeDefined();
    expect(columns.name).toBe("last_used_at");
    expect(columns.dataType).toBe("string");
    expect(columns.notNull).toBe(true);
  });

  it("should be exported as 'chatSessions'", () => {
    // Verify the table is exported with the correct name
    expect(chatSessions).toBeDefined();
    expect(typeof chatSessions).toBe("object");
  });
});
