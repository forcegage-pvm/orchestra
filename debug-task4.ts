import path from "node:path";
import { closeDb, getDb, getRawDb } from "./src/db/index.js";

async function main() {
  const dbPath = path.resolve(process.cwd(), ".orchestra/orchestra.db");
  console.log(`Connecting to DB at: ${dbPath}`);

  getDb(dbPath);

  try {
    const db = getRawDb();
    if (db) {
      const reviews = db
        .prepare("SELECT * FROM code_reviews WHERE task_id = 15")
        .all();
      console.log(
        "Task 15 (Sprint 002 Task 4) Reviews:",
        JSON.stringify(reviews, null, 2),
      );

      const issues = db
        .prepare("SELECT * FROM code_review_issues WHERE task_id = 15")
        .all();
      console.log(
        "Task 15 Code Review Issues:",
        JSON.stringify(issues, null, 2),
      );

      const task = db.prepare("SELECT * FROM tasks WHERE id = 15").all();
      console.log("Task 15 Status:", JSON.stringify(task, null, 2));
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    closeDb();
  }
}

main();
