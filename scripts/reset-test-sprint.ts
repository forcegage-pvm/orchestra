import Database from "better-sqlite3";

const db = new Database(".orchestra/orchestra.db");

// Reset sprint to PENDING_SPEC_REVIEW (spec reviewed state)
db.prepare(
  "UPDATE sprints SET status = 'PENDING_SPEC_REVIEW' WHERE id = 'test-workflow-001'",
).run();

// Reset tasks to PENDING
db.prepare(
  "UPDATE tasks SET status = 'PENDING' WHERE sprint_id = 'test-workflow-001'",
).run();

// Clear handovers
db.prepare(
  "DELETE FROM handovers WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = 'test-workflow-001')",
).run();

// Clear code reviews
db.prepare(
  "DELETE FROM code_reviews WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = 'test-workflow-001')",
).run();

// Clear code review issues
db.prepare(
  "DELETE FROM code_review_issues WHERE review_id IN (SELECT id FROM code_reviews WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = 'test-workflow-001'))",
).run();

console.log("Sprint and tasks reset successfully");
console.log(
  "Sprint:",
  db
    .prepare(
      "SELECT id, name, status FROM sprints WHERE id = 'test-workflow-001'",
    )
    .get(),
);
console.log(
  "Tasks:",
  db
    .prepare(
      "SELECT id, title, status FROM tasks WHERE sprint_id = 'test-workflow-001'",
    )
    .all(),
);

db.close();
