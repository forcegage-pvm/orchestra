/**
 * Script to add spec_consultation_notes to handlePrepareTask calls in test files
 */

import fs from "fs";

const testFiles = [
  "test/mcp-server/prepare-task-tdd.test.ts",
  "test/mcp-server/prepare-task-tdd-red.test.ts",
  "test/mcp-server/prepare-task-cleanup.test.ts",
  "test/mcp-server/policy-enforcement.test.ts",
  "test/mcp-server/get-task.test.ts",
  "test/mcp-server/get-code-review.test.ts",
  "test/integration/spec-traceability.test.ts",
];

function updateTestFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${filePath} - not found`);
    return;
  }

  let content = fs.readFileSync(filePath, "utf8");
  let modified = false;

  // Check if already has SPEC_NOTES import
  if (!content.includes("SPEC_NOTES")) {
    // Add import
    if (
      content.includes(
        'import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";',
      )
    ) {
      content = content.replace(
        'import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";',
        'import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";\nimport { SPEC_NOTES } from "../setup/test-fixtures.js";',
      );
      modified = true;
    }
  }

  // Add spec_consultation_notes to handlePrepareTask calls that don't have it
  // Pattern: handlePrepareTask({ task_id: N, acceptance_criteria:
  const regex =
    /handlePrepareTask\(\{\s*\n(\s+)task_id:\s*(\d+|\w+),\s*\n(\s+)acceptance_criteria:/g;

  if (regex.test(content)) {
    content = content.replace(regex, (match, indent1, taskId, indent2) => {
      return `handlePrepareTask({\n${indent1}task_id: ${taskId},\n${indent1}spec_consultation_notes: SPEC_NOTES,\n${indent2}acceptance_criteria:`;
    });
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${filePath}`);
  } else {
    console.log(`No changes needed for ${filePath}`);
  }
}

testFiles.forEach(updateTestFile);
console.log("Done!");
