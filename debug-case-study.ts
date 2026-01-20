import path from "node:path";
import { closeDb, getDb, getRawDb } from "./src/db/index.js";
import { handleGetOpenCodeReviewIssues } from "./src/mcp-server/handlers/get-open-code-review-issues.js";

async function main() {
  // const dbPath = path.resolve(process.cwd(), "docs/case-study/orchestra.db");
  const dbPath = path.resolve(process.cwd(), ".orchestra/orchestra.db");
  console.log(`Connecting to DB at: ${dbPath}`);

  // Initialize DB with explicit path
  getDb(dbPath);

  try {
    console.log("Querying open code review issues for Task 4...");
    const result = await handleGetOpenCodeReviewIssues({ task_id: 4 });
    console.log("Result:", JSON.stringify(result, null, 2));

    const db = getRawDb();
    if (db) {
      // const reviews = db.prepare("SELECT * FROM spec_reviews").all();
      // console.log("All Spec Reviews:", JSON.stringify(reviews, null, 2));

      const codeReviews = db
        .prepare("SELECT * FROM code_reviews WHERE task_id = 4")
        .all();
      console.log("Task 4 Code Reviews:", JSON.stringify(codeReviews, null, 2));

      const issues = db
        .prepare("SELECT * FROM code_review_issues WHERE task_id = 4")
        .all();
      console.log(
        "Task 4 Code Review Issues:",
        JSON.stringify(issues, null, 2),
      );
    } else {
      console.log("Raw DB not available");
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    closeDb();
  }
}

main();
