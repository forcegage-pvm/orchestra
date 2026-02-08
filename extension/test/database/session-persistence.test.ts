/**
 * Tests for session persistence functions
 *
 * Verifies getSessionLabel, saveSessionLabel, and clearSessionLabel functions
 * that provide CRUD operations for chat session labels in the chat_sessions table.
 *
 * These tests use in-memory SQLite database to verify the functions work correctly
 * without requiring a full Orchestra workspace setup.
 *
 * Note: These tests require the Node.js-compiled better-sqlite3 module.
 * When the module is compiled for Electron (for VSIX packaging), these tests
 * will be skipped to avoid NODE_MODULE_VERSION mismatch errors.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Early detection of better-sqlite3 compatibility
// If module version mismatch, skip all tests in this file
let Database: typeof import("better-sqlite3").default | null = null;
let moduleCompatible = false;
try {
  Database = (await import("better-sqlite3")).default;
  // Try to actually use it to confirm compatibility
  const testDb = new Database(":memory:");
  testDb.close();
  moduleCompatible = true;
} catch {
  moduleCompatible = false;
}

// If module is not compatible, skip the entire file
if (!moduleCompatible) {
  describe.skip("Session Persistence Functions (skipped: native module incompatible)", () => {
    it("skipped due to NODE_MODULE_VERSION mismatch", () => {});
  });
} else {
  // Import dependencies only if module is compatible
  const { getSessionLabel } = await import("../../src/database/queries.js");
  const { clearSessionLabel, saveSessionLabel } =
    await import("../../src/database/mutations.js");
  const { OrchestraDB } = await import("../../src/database/client.js");

  // Module compatibility flag for conditional test execution
  const canRunTests = moduleCompatible && Database !== null;

  // Test fixtures
  let testWorkspaceRoot: string;
  let testDbPath: string;

  /**
   * Create a minimal Orchestra database for testing
   * Only creates the chat_sessions table and sprints table (required for foreign key)
   */
  function createTestDatabase(dbPath: string): void {
    if (!canRunTests) return;
    const db = new Database(dbPath);

    // Create sprints table (required for foreign key references)
    db.exec(`
    CREATE TABLE IF NOT EXISTS sprints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      workflow_step TEXT NOT NULL,
      spec_path TEXT,
      spec_version TEXT,
      spec_hash TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);

    // Create chat_sessions table
    db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL UNIQUE,
      tab_label TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL
    )
  `);

    db.close();
  }

  // Skip all tests if better-sqlite3 module is incompatible (e.g., compiled for Electron)
  const describeIfCompatible = canRunTests ? describe : describe.skip;

  describeIfCompatible("Session Persistence Functions", () => {
    beforeEach(() => {
      // Create temporary directory for test database
      testWorkspaceRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "orchestra-session-test-"),
      );

      // Create .orchestra directory structure
      const orchestraDir = path.join(testWorkspaceRoot, ".orchestra");
      fs.mkdirSync(orchestraDir, { recursive: true });

      // Create test database
      testDbPath = path.join(orchestraDir, "orchestra.db");
      createTestDatabase(testDbPath);
    });

    afterEach(() => {
      // Close database connection before cleanup (critical for Windows)
      OrchestraDB.close();

      // Clean up test workspace
      fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
    });

    describe("getSessionLabel", () => {
      it("should return null when no session exists for the role", () => {
        const label = getSessionLabel(testWorkspaceRoot, "orchestrator");
        expect(label).toBeNull();
      });

      it("should return the tab label for an existing orchestrator session", () => {
        // Insert a session directly
        const db = new Database(testDbPath);
        db.prepare(
          `INSERT INTO chat_sessions (role, tab_label, created_at, last_used_at) VALUES (?, ?, ?, ?)`,
        ).run(
          "orchestrator",
          "Copilot Chat 1",
          "2026-01-08T12:00:00Z",
          "2026-01-08T12:00:00Z",
        );
        db.close();

        const label = getSessionLabel(testWorkspaceRoot, "orchestrator");
        expect(label).toBe("Copilot Chat 1");
      });

      it("should return the tab label for an existing implementor session", () => {
        // Insert a session directly
        const db = new Database(testDbPath);
        db.prepare(
          `INSERT INTO chat_sessions (role, tab_label, created_at, last_used_at) VALUES (?, ?, ?, ?)`,
        ).run(
          "implementor",
          "Copilot Chat 2",
          "2026-01-08T13:00:00Z",
          "2026-01-08T13:00:00Z",
        );
        db.close();

        const label = getSessionLabel(testWorkspaceRoot, "implementor");
        expect(label).toBe("Copilot Chat 2");
      });

      it("should return the correct label when both roles have sessions", () => {
        // Insert both sessions
        const db = new Database(testDbPath);
        db.prepare(
          `INSERT INTO chat_sessions (role, tab_label, created_at, last_used_at) VALUES (?, ?, ?, ?)`,
        ).run(
          "orchestrator",
          "Copilot Chat 1",
          "2026-01-08T12:00:00Z",
          "2026-01-08T12:00:00Z",
        );
        db.prepare(
          `INSERT INTO chat_sessions (role, tab_label, created_at, last_used_at) VALUES (?, ?, ?, ?)`,
        ).run(
          "implementor",
          "Copilot Chat 2",
          "2026-01-08T13:00:00Z",
          "2026-01-08T13:00:00Z",
        );
        db.close();

        const orchestratorLabel = getSessionLabel(
          testWorkspaceRoot,
          "orchestrator",
        );
        const implementorLabel = getSessionLabel(
          testWorkspaceRoot,
          "implementor",
        );

        expect(orchestratorLabel).toBe("Copilot Chat 1");
        expect(implementorLabel).toBe("Copilot Chat 2");
      });

      it("should have correct function signature with workspaceRoot first parameter", () => {
        // Type check - this will fail at compile time if signature is wrong
        const fn: (
          workspaceRoot: string,
          role: "orchestrator" | "implementor",
        ) => string | null = getSessionLabel;
        expect(fn).toBeDefined();
      });

      it("should use literal union type for role parameter", () => {
        // This test verifies the type constraint at compile time
        // TypeScript will error if we try to pass an invalid role
        const validRoles: Array<"orchestrator" | "implementor"> = [
          "orchestrator",
          "implementor",
        ];

        validRoles.forEach((role) => {
          const label = getSessionLabel(testWorkspaceRoot, role);
          expect(label).toBeNull(); // No sessions exist yet
        });
      });
    });

    describe("saveSessionLabel", () => {
      it("should insert a new session label for orchestrator role", () => {
        saveSessionLabel(testWorkspaceRoot, "orchestrator", "Copilot Chat 1");

        // Verify it was saved
        const label = getSessionLabel(testWorkspaceRoot, "orchestrator");
        expect(label).toBe("Copilot Chat 1");
      });

      it("should insert a new session label for implementor role", () => {
        saveSessionLabel(testWorkspaceRoot, "implementor", "Copilot Chat 2");

        // Verify it was saved
        const label = getSessionLabel(testWorkspaceRoot, "implementor");
        expect(label).toBe("Copilot Chat 2");
      });

      it("should update an existing session label (upsert behavior)", () => {
        // Save initial label
        saveSessionLabel(testWorkspaceRoot, "orchestrator", "Copilot Chat 1");
        expect(getSessionLabel(testWorkspaceRoot, "orchestrator")).toBe(
          "Copilot Chat 1",
        );

        // Update to new label
        saveSessionLabel(testWorkspaceRoot, "orchestrator", "Copilot Chat 3");
        expect(getSessionLabel(testWorkspaceRoot, "orchestrator")).toBe(
          "Copilot Chat 3",
        );
      });

      it("should set both created_at and last_used_at timestamps", () => {
        saveSessionLabel(testWorkspaceRoot, "orchestrator", "Copilot Chat 1");

        // Verify timestamps were set
        const db = new Database(testDbPath);
        const row = db
          .prepare(
            `SELECT created_at, last_used_at FROM chat_sessions WHERE role = ?`,
          )
          .get("orchestrator") as {
          created_at: string;
          last_used_at: string;
        };
        db.close();

        expect(row.created_at).toBeDefined();
        expect(row.last_used_at).toBeDefined();
        expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        expect(row.last_used_at).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
        );
      });

      it("should not create duplicate rows due to UNIQUE constraint", () => {
        // Save twice
        saveSessionLabel(testWorkspaceRoot, "orchestrator", "Copilot Chat 1");
        saveSessionLabel(testWorkspaceRoot, "orchestrator", "Copilot Chat 3");

        // Verify only one row exists
        const db = new Database(testDbPath);
        const count = db
          .prepare(`SELECT COUNT(*) as count FROM chat_sessions WHERE role = ?`)
          .get("orchestrator") as { count: number };
        db.close();

        expect(count.count).toBe(1);
      });

      it("should have correct function signature with workspaceRoot first parameter", () => {
        // Type check - this will fail at compile time if signature is wrong
        const fn: (
          workspaceRoot: string,
          role: "orchestrator" | "implementor",
          label: string,
        ) => void = saveSessionLabel;
        expect(fn).toBeDefined();
      });
    });

    describe("clearSessionLabel", () => {
      it("should delete an existing session label", () => {
        // Save a session
        saveSessionLabel(testWorkspaceRoot, "orchestrator", "Copilot Chat 1");
        expect(getSessionLabel(testWorkspaceRoot, "orchestrator")).toBe(
          "Copilot Chat 1",
        );

        // Clear it
        clearSessionLabel(testWorkspaceRoot, "orchestrator");
        expect(getSessionLabel(testWorkspaceRoot, "orchestrator")).toBeNull();
      });

      it("should do nothing when clearing a non-existent session", () => {
        // This should not throw
        expect(() => {
          clearSessionLabel(testWorkspaceRoot, "orchestrator");
        }).not.toThrow();

        // Verify still no session exists
        expect(getSessionLabel(testWorkspaceRoot, "orchestrator")).toBeNull();
      });

      it("should only delete the specified role's session", () => {
        // Save both sessions
        saveSessionLabel(testWorkspaceRoot, "orchestrator", "Copilot Chat 1");
        saveSessionLabel(testWorkspaceRoot, "implementor", "Copilot Chat 2");

        // Clear orchestrator only
        clearSessionLabel(testWorkspaceRoot, "orchestrator");

        // Verify orchestrator is cleared but implementor remains
        expect(getSessionLabel(testWorkspaceRoot, "orchestrator")).toBeNull();
        expect(getSessionLabel(testWorkspaceRoot, "implementor")).toBe(
          "Copilot Chat 2",
        );
      });

      it("should have correct function signature with workspaceRoot first parameter", () => {
        // Type check - this will fail at compile time if signature is wrong
        const fn: (
          workspaceRoot: string,
          role: "orchestrator" | "implementor",
        ) => void = clearSessionLabel;
        expect(fn).toBeDefined();
      });
    });

    describe("Integration: Full CRUD lifecycle", () => {
      it("should handle complete create-read-update-delete cycle", () => {
        const role: "orchestrator" | "implementor" = "orchestrator";

        // 1. Create - Save initial label
        saveSessionLabel(testWorkspaceRoot, role, "Initial Label");
        expect(getSessionLabel(testWorkspaceRoot, role)).toBe("Initial Label");

        // 2. Read - Verify we can read it back
        const label1 = getSessionLabel(testWorkspaceRoot, role);
        expect(label1).toBe("Initial Label");

        // 3. Update - Change the label
        saveSessionLabel(testWorkspaceRoot, role, "Updated Label");
        expect(getSessionLabel(testWorkspaceRoot, role)).toBe("Updated Label");

        // 4. Delete - Clear the label
        clearSessionLabel(testWorkspaceRoot, role);
        expect(getSessionLabel(testWorkspaceRoot, role)).toBeNull();

        // 5. Verify deletion is complete
        const label2 = getSessionLabel(testWorkspaceRoot, role);
        expect(label2).toBeNull();
      });

      it("should handle concurrent operations on both roles", () => {
        // Save both
        saveSessionLabel(testWorkspaceRoot, "orchestrator", "Orchestrator Tab");
        saveSessionLabel(testWorkspaceRoot, "implementor", "Implementor Tab");

        // Read both
        expect(getSessionLabel(testWorkspaceRoot, "orchestrator")).toBe(
          "Orchestrator Tab",
        );
        expect(getSessionLabel(testWorkspaceRoot, "implementor")).toBe(
          "Implementor Tab",
        );

        // Update both
        saveSessionLabel(testWorkspaceRoot, "orchestrator", "New Orchestrator");
        saveSessionLabel(testWorkspaceRoot, "implementor", "New Implementor");

        // Verify updates
        expect(getSessionLabel(testWorkspaceRoot, "orchestrator")).toBe(
          "New Orchestrator",
        );
        expect(getSessionLabel(testWorkspaceRoot, "implementor")).toBe(
          "New Implementor",
        );

        // Clear one
        clearSessionLabel(testWorkspaceRoot, "orchestrator");

        // Verify only one is cleared
        expect(getSessionLabel(testWorkspaceRoot, "orchestrator")).toBeNull();
        expect(getSessionLabel(testWorkspaceRoot, "implementor")).toBe(
          "New Implementor",
        );

        // Clear the other
        clearSessionLabel(testWorkspaceRoot, "implementor");

        // Verify both are cleared
        expect(getSessionLabel(testWorkspaceRoot, "orchestrator")).toBeNull();
        expect(getSessionLabel(testWorkspaceRoot, "implementor")).toBeNull();
      });
    });

    describe("Edge Cases", () => {
      it("should handle empty string as tab label", () => {
        saveSessionLabel(testWorkspaceRoot, "orchestrator", "");
        expect(getSessionLabel(testWorkspaceRoot, "orchestrator")).toBe("");
      });

      it("should handle very long tab labels", () => {
        const longLabel = "Copilot Chat ".repeat(100); // Very long label
        saveSessionLabel(testWorkspaceRoot, "orchestrator", longLabel);
        expect(getSessionLabel(testWorkspaceRoot, "orchestrator")).toBe(
          longLabel,
        );
      });

      it("should handle special characters in tab labels", () => {
        const specialLabel = "Copilot 🤖 Chat <>&\"'";
        saveSessionLabel(testWorkspaceRoot, "implementor", specialLabel);
        expect(getSessionLabel(testWorkspaceRoot, "implementor")).toBe(
          specialLabel,
        );
      });

      it("should handle rapid save/clear cycles", () => {
        // Rapidly save and clear multiple times
        for (let i = 0; i < 10; i++) {
          saveSessionLabel(testWorkspaceRoot, "orchestrator", `Label ${i}`);
          expect(getSessionLabel(testWorkspaceRoot, "orchestrator")).toBe(
            `Label ${i}`,
          );
          clearSessionLabel(testWorkspaceRoot, "orchestrator");
          expect(getSessionLabel(testWorkspaceRoot, "orchestrator")).toBeNull();
        }
      });
    });
  });
}
