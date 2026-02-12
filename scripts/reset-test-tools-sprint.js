"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
var Database = require("better-sqlite3");
var child_process_1 = require("child_process");
var fs = require("fs");
var path = require("path");
var SPRINT_ID = "test-tools-001";
// Files that should exist as stubs (will be restored from git)
var FILES_TO_RESTORE = [
    { dir: "src/core", file: "string-utils.ts" },
];
// Files that should NOT exist initially (agent creates these - will be deleted)
var FILES_TO_DELETE = [
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
function resetDatabase() {
    var db = new Database(".orchestra/orchestra.db");
    try {
        // Reset sprint status to ACTIVE
        var sprintUpdate = db
            .prepare("UPDATE sprints SET status = 'ACTIVE' WHERE id = ?")
            .run(SPRINT_ID);
        console.log("Sprint status reset: ".concat(sprintUpdate.changes, " row(s) updated"));
        // Reset tasks to PENDING and clear retry counts
        var taskUpdate = db
            .prepare("UPDATE tasks SET status = 'PENDING', retry_count = 0 WHERE sprint_id = ?")
            .run(SPRINT_ID);
        console.log("Tasks reset: ".concat(taskUpdate.changes, " row(s) updated"));
        // Clear handovers
        var handoverDelete = db
            .prepare("DELETE FROM handovers WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)")
            .run(SPRINT_ID);
        console.log("Handovers cleared: ".concat(handoverDelete.changes, " row(s) deleted"));
        // Clear feedback (verification failure feedback)
        var feedbackDelete = db
            .prepare("DELETE FROM feedback WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)")
            .run(SPRINT_ID);
        console.log("Feedback cleared: ".concat(feedbackDelete.changes, " row(s) deleted"));
        // Clear escalations
        var escalationDelete = db
            .prepare("DELETE FROM escalations WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)")
            .run(SPRINT_ID);
        console.log("Escalations cleared: ".concat(escalationDelete.changes, " row(s) deleted"));
        // Clear amendments (specification changes tracking)
        var amendmentDelete = db
            .prepare("DELETE FROM amendments WHERE sprint_id = ? OR task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)")
            .run(SPRINT_ID, SPRINT_ID);
        console.log("Amendments cleared: ".concat(amendmentDelete.changes, " row(s) deleted"));
        // Clear spec reviews (sprint and handover review decisions)
        var specReviewDelete = db
            .prepare("DELETE FROM spec_reviews WHERE sprint_id = ? OR task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)")
            .run(SPRINT_ID, SPRINT_ID);
        console.log("Spec reviews cleared: ".concat(specReviewDelete.changes, " row(s) deleted"));
        // Clear code review fixes (must delete before issues/reviews due to FK)
        var fixesDelete = db
            .prepare("DELETE FROM code_review_fixes WHERE review_id IN (SELECT id FROM code_reviews WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?))")
            .run(SPRINT_ID);
        console.log("Code review fixes cleared: ".concat(fixesDelete.changes, " row(s) deleted"));
        // Clear code review issues (must delete before reviews due to FK)
        var issueDelete = db
            .prepare("DELETE FROM code_review_issues WHERE review_id IN (SELECT id FROM code_reviews WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?))")
            .run(SPRINT_ID);
        console.log("Code review issues cleared: ".concat(issueDelete.changes, " row(s) deleted"));
        // Clear code reviews
        var reviewsDelete = db
            .prepare("DELETE FROM code_reviews WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)")
            .run(SPRINT_ID);
        console.log("Code reviews cleared: ".concat(reviewsDelete.changes, " row(s) deleted"));
        // Clear ALL agent sessions, messages, and events
        var messagesDelete = db.prepare("DELETE FROM session_messages").run();
        console.log("Session messages cleared: ".concat(messagesDelete.changes, " row(s) deleted"));
        var eventsDelete = db.prepare("DELETE FROM session_events").run();
        console.log("Session events cleared: ".concat(eventsDelete.changes, " row(s) deleted"));
        var sessionsDelete = db.prepare("DELETE FROM agent_sessions").run();
        console.log("Agent sessions cleared: ".concat(sessionsDelete.changes, " row(s) deleted"));
        // Clear sprint settings
        var settingsDelete = db
            .prepare("DELETE FROM sprint_settings WHERE sprint_id = ?")
            .run(SPRINT_ID);
        console.log("Sprint settings cleared: ".concat(settingsDelete.changes, " row(s) deleted"));
        // Clear TDD registry entries
        try {
            var tddDelete = db
                .prepare("DELETE FROM tdd_registry WHERE sprint_id = ?")
                .run(SPRINT_ID);
            console.log("TDD registry cleared: ".concat(tddDelete.changes, " row(s) deleted"));
        }
        catch (_a) {
            // Table may not exist
        }
        // Display current state
        var sprint = db
            .prepare("SELECT id, name, status FROM sprints WHERE id = ?")
            .get(SPRINT_ID);
        var tasks = db
            .prepare("SELECT id, title, status FROM tasks WHERE sprint_id = ?")
            .all(SPRINT_ID);
        console.log("\n--- Current State ---");
        console.log("Sprint:", sprint);
        console.log("Tasks:", tasks);
        db.close();
        console.log("\n✅ Database reset complete");
    }
    catch (error) {
        db.close();
        throw error;
    }
}
// =============================================================================
// File reset
// =============================================================================
function resetFiles() {
    console.log("\n📁 Resetting files...\n");
    // Restore stub files from git
    for (var _i = 0, FILES_TO_RESTORE_1 = FILES_TO_RESTORE; _i < FILES_TO_RESTORE_1.length; _i++) {
        var _a = FILES_TO_RESTORE_1[_i], dir = _a.dir, file = _a.file;
        var filePath = path.join(dir, file);
        try {
            (0, child_process_1.execSync)("git checkout HEAD -- \"".concat(filePath, "\""), { stdio: "pipe" });
            console.log("  \u2705 Restored: ".concat(filePath));
        }
        catch (_b) {
            console.log("  \u26A0\uFE0F  Could not restore (may not be committed): ".concat(filePath));
        }
    }
    // Delete generated test files
    for (var _c = 0, FILES_TO_DELETE_1 = FILES_TO_DELETE; _c < FILES_TO_DELETE_1.length; _c++) {
        var _d = FILES_TO_DELETE_1[_c], dir = _d.dir, file = _d.file;
        var filePath = path.join(dir, file);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log("  \uD83D\uDDD1\uFE0F  Deleted: ".concat(filePath));
        }
        else {
            console.log("  \u23ED\uFE0F  Already absent: ".concat(filePath));
        }
    }
    console.log("\n✅ File reset complete");
}
// =============================================================================
// Main
// =============================================================================
function main() {
    console.log("\uD83D\uDD04 Resetting sprint: ".concat(SPRINT_ID, "\n"));
    console.log("=".repeat(60));
    // Reset database
    console.log("\n🗄️  Resetting database...\n");
    resetDatabase();
    // Reset files
    resetFiles();
    console.log("\n" + "=".repeat(60));
    console.log("\n\u2705 Sprint ".concat(SPRINT_ID, " fully reset and ready for replay.\n"));
    console.log("Next steps:");
    console.log("  1. Configure sprint:  mcp_orchestra-orc_configure_sprint(...)");
    console.log("  2. Or use reset script: npx tsx scripts/reset-test-tools-sprint.ts");
}
main();
