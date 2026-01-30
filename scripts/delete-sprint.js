#!/usr/bin/env node
import Database from "better-sqlite3";
const db = new Database(".orchestra/orchestra.db");

const sprintId = process.argv[2];
if (!sprintId) {
  console.log("Usage: node scripts/delete-sprint.js <sprint-id>");
  process.exit(1);
}

// Get task IDs for this sprint
const taskIds = db
  .prepare(`SELECT id FROM tasks WHERE sprint_id = ?`)
  .all(sprintId)
  .map((r) => r.id);
console.log(`Found ${taskIds.length} tasks to delete`);

db.exec(`UPDATE sprints SET is_active = 0 WHERE id = '${sprintId}'`);

// Delete related data with error handling
if (taskIds.length > 0) {
  const taskIdList = taskIds.join(",");
  try {
    db.exec(
      `DELETE FROM tdd_task_relationships WHERE red_task_id IN (${taskIdList}) OR green_task_id IN (${taskIdList})`,
    );
  } catch (e) {
    console.log("tdd_task_relationships: " + e.message);
  }
  try {
    db.exec(`DELETE FROM verification_checks WHERE task_id IN (${taskIdList})`);
  } catch (e) {
    console.log("verification_checks: " + e.message);
  }
}

db.exec(`DELETE FROM tasks WHERE sprint_id = '${sprintId}'`);
db.exec(`DELETE FROM phases WHERE sprint_id = '${sprintId}'`);
db.exec(`DELETE FROM sprints WHERE id = '${sprintId}'`);

console.log(`Deleted sprint: ${sprintId}`);
db.close();
