import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

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

db.prepare("UPDATE sprints SET status = 'ACTIVE' WHERE id = ?").run(SPRINT_ID);
db.prepare("UPDATE tasks SET status = 'PENDING' WHERE sprint_id = ?").run(SPRINT_ID);
db.prepare("DELETE FROM handovers WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)").run(SPRINT_ID);
db.prepare("DELETE FROM code_review_issues WHERE review_id IN (SELECT id FROM code_reviews WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?))").run(SPRINT_ID);
db.prepare("DELETE FROM code_reviews WHERE task_id IN (SELECT id FROM tasks WHERE sprint_id = ?)").run(SPRINT_ID);

const sprint = db.prepare("SELECT id, name, status FROM sprints WHERE id = ?").get(SPRINT_ID);
const tasks = db.prepare("SELECT id, title, status FROM tasks WHERE sprint_id = ?").all(SPRINT_ID);
console.log("Sprint:", sprint);
console.log("Tasks:", tasks);
db.close();

fs.writeFileSync("testing/hello-greeter/greeter.ts", GREETER_STUB);
fs.writeFileSync("testing/hello-greeter/greeter.test.ts", GREETER_TEST_STUB);
console.log("Files reverted!");
