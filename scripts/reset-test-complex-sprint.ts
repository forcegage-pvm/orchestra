/**
 * Reset script for the complex test sprint (test-complex-001)
 *
 * This script:
 * 1. Resets the sprint and task status in the database
 * 2. Clears all related records (handovers, feedback, reviews, etc.)
 * 3. Uses git to restore files to their committed state
 * 4. Deletes any generated files that should not exist initially
 *
 * Usage: npx tsx scripts/reset-test-complex-sprint.ts
 */

import Database from "better-sqlite3";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const SPRINT_ID = "test-complex-001";
const TESTING_DIR = "testing/task-manager";

// Files that should exist (will be restored from git)
const FILES_TO_RESTORE = ["types.ts", "errors.ts"];

// Files that should NOT exist (agent creates these - will be deleted)
const FILES_TO_DELETE = [
  "validator.ts",
  "repository.ts",
  "service.ts",
  "types.test.ts",
  "validator.test.ts",
  "repository.test.ts",
  "service.test.ts",
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

    // Clear code reviews and related data
    const fixesDelete = db
      .prepare(
        "DELETE FROM code_review_fixes WHERE review_id IN (SELECT id FROM code_reviews WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?))",
      )
      .run(SPRINT_ID);
    console.log(
      `Code review fixes cleared: ${fixesDelete.changes} row(s) deleted`,
    );

    const issuesDelete = db
      .prepare(
        "DELETE FROM code_review_issues WHERE review_id IN (SELECT id FROM code_reviews WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?))",
      )
      .run(SPRINT_ID);
    console.log(
      `Code review issues cleared: ${issuesDelete.changes} row(s) deleted`,
    );

    const reviewsDelete = db
      .prepare(
        "DELETE FROM code_reviews WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)",
      )
      .run(SPRINT_ID);
    console.log(
      `Code reviews cleared: ${reviewsDelete.changes} row(s) deleted`,
    );

    // Clear agent sessions and events
    const eventsDelete = db
      .prepare(
        "DELETE FROM session_events WHERE session_id IN (SELECT session_id FROM agent_sessions WHERE sprint_id = ?)",
      )
      .run(SPRINT_ID);
    console.log(
      `Session events cleared: ${eventsDelete.changes} row(s) deleted`,
    );

    const sessionsDelete = db
      .prepare("DELETE FROM agent_sessions WHERE sprint_id = ?")
      .run(SPRINT_ID);
    console.log(
      `Agent sessions cleared: ${sessionsDelete.changes} row(s) deleted`,
    );

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
  } finally {
    db.close();
  }
}

// =============================================================================
// File system reset using git
// =============================================================================

function resetFiles(): void {
  console.log("\n--- Resetting Files ---");

  // Ensure testing directory exists
  if (!fs.existsSync(TESTING_DIR)) {
    fs.mkdirSync(TESTING_DIR, { recursive: true });
    console.log(`Created directory: ${TESTING_DIR}`);
  }

  // Delete files that should not exist (agent-created files)
  for (const file of FILES_TO_DELETE) {
    const filePath = path.join(TESTING_DIR, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Deleted: ${file}`);
    }
  }

  // Restore stub files from git
  for (const file of FILES_TO_RESTORE) {
    const filePath = path.join(TESTING_DIR, file);
    try {
      // Use git restore to get the committed version
      execSync(`git restore "${filePath}"`, { stdio: "pipe" });
      console.log(`Restored from git: ${file}`);
    } catch {
      // If git restore fails (file not in git yet), check if it exists
      if (!fs.existsSync(filePath)) {
        console.warn(`Warning: ${file} not found in git or on disk`);
      } else {
        console.log(`Kept existing: ${file} (not tracked by git)`);
      }
    }
  }

  console.log("\nFiles reset complete!");
}

// =============================================================================
// Main
// =============================================================================

console.log("=".repeat(60));
console.log(`Resetting Sprint: ${SPRINT_ID}`);
console.log("=".repeat(60));

try {
  resetDatabase();
  resetFiles();
  console.log("\n✅ Reset complete!");
} catch (error) {
  console.error("\n❌ Reset failed:", error);
  process.exit(1);
}
