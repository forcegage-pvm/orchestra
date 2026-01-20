import path from "node:path";
import { closeDb, getDb } from "./src/db/index.js";
import { handleGetOpenCodeReviewIssues } from "./src/mcp-server/handlers/get-open-code-review-issues.js";

async function main() {
  const dbPath = path.resolve(process.cwd(), ".orchestra/orchestra.db");
  console.log(`Connecting to DB at: ${dbPath}`);

  // Initialize DB with explicit path
  getDb(dbPath);

  try {
    // Task 15 is the one with issues in the case study DB (Sprint 2 Task 4)
    console.log("Querying open code review issues for Task 15...");
    const result = await handleGetOpenCodeReviewIssues({ task_id: 15 });
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    closeDb();
  }
}

main();
