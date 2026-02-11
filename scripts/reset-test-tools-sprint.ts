/**
 * Reset script for the test-tools validation sprint (test-tools-001)
 *
 * This script:
 * 1. Resets the sprint and task status in the database
 * 2. Clears all related records (handovers, feedback, reviews, etc.)
 * 3. Restores the stub file to its "Not implemented" state
 * 4. Deletes any test files that should not exist initially
 *
 * Usage: npx tsx scripts/reset-test-tools-sprint.ts
 */

import Database from "better-sqlite3";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const SPRINT_ID = "test-tools-001";

// Files that should exist as stubs (will be restored from git)
const FILES_TO_RESTORE: Array<{ dir: string; file: string }> = [
  { dir: "src/core", file: "string-utils.ts" },
];

// Files that should NOT exist initially (agent creates these - will be deleted)
const FILES_TO_DELETE: Array<{ dir: string; file: string }> = [
  { dir: "test/smoke", file: "string-utils-exports.test.ts" },
  { dir: "test/unit/core", file: "string-utils.test.ts" },
  {
    dir: "extension/test/unit/agents/tools/testing",
    file: "test-tools-sanity.test.ts",
  },
];

// =============================================================================
// Database reset
// =============================================================================

function resetDatabase(): void {
  const db = new Database(".orchestra/orchestra.db");

  try {
    // Reset sprint status to ACTIVE
    const sprintUpdate = db
      .prepare("UPDATE sprints SET status = 'ACTIVE' WHERE id = ?")
      .run(SPRINT_ID);
    console.log(`Sprint status reset: ${sprintUpdate.changes} row(s) updated`);

    // Reset tasks to PENDING and clear retry counts
    const taskUpdate = db
      .prepare(
        "UPDATE tasks SET status = 'PENDING', retry_count = 0 WHERE sprint_id = ?",
      )
      .run(SPRINT_ID);
    console.log(`Tasks reset: ${taskUpdate.changes} row(s) updated`);

    // Clear handovers
    const handoverDelete = db
      .prepare(
        "DELETE FROM handovers WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)",
      )
      .run(SPRINT_ID);
    console.log(`Handovers cleared: ${handoverDelete.changes} row(s) deleted`);

    // Clear feedback (verification failure feedback)
    const feedbackDelete = db
      .prepare(
        "DELETE FROM feedback WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)",
      )
      .run(SPRINT_ID);
    console.log(`Feedback cleared: ${feedbackDelete.changes} row(s) deleted`);

    // Clear escalations
    const escalationDelete = db
      .prepare(
        "DELETE FROM escalations WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)",
      )
      .run(SPRINT_ID);
    console.log(
      `Escalations cleared: ${escalationDelete.changes} row(s) deleted`,
    );

    // Clear amendments (specification changes tracking)
    const amendmentDelete = db
      .prepare(
        "DELETE FROM amendments WHERE sprint_id = ? OR task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)",
      )
      .run(SPRINT_ID, SPRINT_ID);
    console.log(
      `Amendments cleared: ${amendmentDelete.changes} row(s) deleted`,
    );

    // Clear spec reviews (sprint and handover review decisions)
    const specReviewDelete = db
      .prepare(
        "DELETE FROM spec_reviews WHERE sprint_id = ? OR task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)",
      )
      .run(SPRINT_ID, SPRINT_ID);
    console.log(
      `Spec reviews cleared: ${specReviewDelete.changes} row(s) deleted`,
    );

    // Clear code review fixes (must delete before issues/reviews due to FK)
    const fixesDelete = db
      .prepare(
        "DELETE FROM code_review_fixes WHERE review_id IN (SELECT id FROM code_reviews WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?))",
      )
      .run(SPRINT_ID);
    console.log(
      `Code review fixes cleared: ${fixesDelete.changes} row(s) deleted`,
    );

    // Clear code review issues (must delete before reviews due to FK)
    const issueDelete = db
      .prepare(
        "DELETE FROM code_review_issues WHERE review_id IN (SELECT id FROM code_reviews WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?))",
      )
      .run(SPRINT_ID);
    console.log(
      `Code review issues cleared: ${issueDelete.changes} row(s) deleted`,
    );

    // Clear code reviews
    const reviewsDelete = db
      .prepare(
        "DELETE FROM code_reviews WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)",
      )
      .run(SPRINT_ID);
    console.log(
      `Code reviews cleared: ${reviewsDelete.changes} row(s) deleted`,
    );

    // Clear ALL agent sessions, messages, and events
    const messagesDelete = db.prepare("DELETE FROM session_messages").run();
    console.log(
      `Session messages cleared: ${messagesDelete.changes} row(s) deleted`,
    );

    const eventsDelete = db.prepare("DELETE FROM session_events").run();
    console.log(
      `Session events cleared: ${eventsDelete.changes} row(s) deleted`,
    );

    const sessionsDelete = db.prepare("DELETE FROM agent_sessions").run();
    console.log(
      `Agent sessions cleared: ${sessionsDelete.changes} row(s) deleted`,
    );

    // Clear sprint settings
    const settingsDelete = db
      .prepare("DELETE FROM sprint_settings WHERE sprint_id = ?")
      .run(SPRINT_ID);
    console.log(
      `Sprint settings cleared: ${settingsDelete.changes} row(s) deleted`,
    );

    // Clear TDD registry entries
    try {
      const tddDelete = db
        .prepare("DELETE FROM tdd_registry WHERE sprint_id = ?")
        .run(SPRINT_ID);
      console.log(`TDD registry cleared: ${tddDelete.changes} row(s) deleted`);
    } catch {
      // Table may not exist
    }

    // Display current state
    const sprint = db
      .prepare("SELECT id, name, status FROM sprints WHERE id = ?")
      .get(SPRINT_ID) as
      | { id: string; name: string; status: string }
      | undefined;
    const tasks = db
      .prepare("SELECT id, title, status FROM tasks WHERE sprint_id = ?")
      .all(SPRINT_ID) as Array<{ id: number; title: string; status: string }>;

    console.log("\n--- Current State ---");
    console.log("Sprint:", sprint);
    console.log("Tasks:", tasks);

    db.close();
    console.log("\n✅ Database reset complete");
  } catch (error) {
    db.close();
    throw error;
  }
}

// =============================================================================
// File reset
// =============================================================================

function resetFiles(): void {
  console.log("\n📁 Resetting files...\n");

  // Restore stub files from git
  for (const { dir, file } of FILES_TO_RESTORE) {
    const filePath = path.join(dir, file);
    try {
      execSync(`git checkout HEAD -- "${filePath}"`, { stdio: "pipe" });
      console.log(`  ✅ Restored: ${filePath}`);
    } catch {
      console.log(
        `  ⚠️  Could not restore (may not be committed): ${filePath}`,
      );
    }
  }

  // Delete generated test files
  for (const { dir, file } of FILES_TO_DELETE) {
    const filePath = path.join(dir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`  🗑️  Deleted: ${filePath}`);
    } else {
      console.log(`  ⏭️  Already absent: ${filePath}`);
    }
  }

  console.log("\n✅ File reset complete");
}

// =============================================================================
// Main
// =============================================================================

function main(): void {
  console.log(`🔄 Resetting sprint: ${SPRINT_ID}\n`);
  console.log("=".repeat(60));

  // Reset database
  console.log("\n🗄️  Resetting database...\n");
  resetDatabase();

  // Reset files
  resetFiles();

  console.log("\n" + "=".repeat(60));
  console.log(`\n✅ Sprint ${SPRINT_ID} fully reset and ready for replay.\n`);
  console.log("Next steps:");
  console.log(
    "  1. Configure sprint:  mcp_orchestra-orc_configure_sprint(...)",
  );
  console.log(
    "  2. Or use reset script: npx tsx scripts/reset-test-tools-sprint.ts",
  );
}

main();
