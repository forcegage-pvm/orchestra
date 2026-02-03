import Database from "better-sqlite3";
import * as fs from "fs";

const SPRINT_ID = "test-workflow-001";

const GREETER_STUB = `/**
 * Greets a person by name.
 */
export function greet(name: string): string {
  throw new Error("Not implemented");
}
`;

const GREETER_TEST_STUB = `import { greet } from "./greeter.js";

describe("greet", () => {
  it.todo("should greet Alice");
  it.todo("should greet Bob");
  it.todo("should handle empty string");
  it.todo("should handle whitespace");
});
`;

const db = new Database(".orchestra/orchestra.db");

// Reset sprint status to ACTIVE
db.prepare("UPDATE sprints SET status = 'ACTIVE' WHERE id = ?").run(SPRINT_ID);

// Reset tasks to PENDING and clear retry counts
db.prepare(
  "UPDATE tasks SET status = 'PENDING', retry_count = 0 WHERE sprint_id = ?",
).run(SPRINT_ID);

// Clear handovers
db.prepare(
  "DELETE FROM handovers WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)",
).run(SPRINT_ID);

// Clear feedback (verification failure feedback)
db.prepare(
  "DELETE FROM feedback WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)",
).run(SPRINT_ID);

// Clear escalations
db.prepare(
  "DELETE FROM escalations WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)",
).run(SPRINT_ID);

// Clear amendments (specification changes tracking)
db.prepare(
  "DELETE FROM amendments WHERE sprint_id = ? OR task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)",
).run(SPRINT_ID, SPRINT_ID);

// Clear spec reviews (sprint and handover review decisions)
db.prepare(
  "DELETE FROM spec_reviews WHERE sprint_id = ? OR task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)",
).run(SPRINT_ID, SPRINT_ID);

// Clear code reviews and related data
db.prepare(
  "DELETE FROM code_review_fixes WHERE review_id IN (SELECT id FROM code_reviews WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?))",
).run(SPRINT_ID);
db.prepare(
  "DELETE FROM code_review_issues WHERE review_id IN (SELECT id FROM code_reviews WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?))",
).run(SPRINT_ID);
db.prepare(
  "DELETE FROM code_reviews WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)",
).run(SPRINT_ID);

// Clear agent sessions and events
db.prepare(
  "DELETE FROM session_events WHERE session_id IN (SELECT session_id FROM agent_sessions WHERE sprint_id = ?)",
).run(SPRINT_ID);
db.prepare("DELETE FROM agent_sessions WHERE sprint_id = ?").run(SPRINT_ID);

const sprint = db
  .prepare("SELECT id, name, status FROM sprints WHERE id = ?")
  .get(SPRINT_ID);
const tasks = db
  .prepare("SELECT id, title, status FROM tasks WHERE sprint_id = ?")
  .all(SPRINT_ID);
console.log("Sprint:", sprint);
console.log("Tasks:", tasks);
db.close();

fs.writeFileSync("testing/hello-greeter/greeter.ts", GREETER_STUB);
fs.writeFileSync("testing/hello-greeter/greeter.test.ts", GREETER_TEST_STUB);
console.log("Files reverted!");
