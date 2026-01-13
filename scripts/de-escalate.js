// Temporary script to de-escalate a task (simulating human supervisor action)
import Database from "better-sqlite3";

const taskId = parseInt(process.argv[2] || "6");
const targetStatus = process.argv[3] || "GATE_CHECK";

const db = new Database(".orchestra/orchestra.db");

const result = db
  .prepare(
    `
  UPDATE tasks 
  SET status = ? 
  WHERE task_id = ? 
  AND sprint_id = (SELECT id FROM sprints WHERE is_active = 1)
`
  )
  .run(targetStatus, taskId);

console.log(
  `De-escalated task ${taskId} to ${targetStatus}. Changes: ${result.changes}`
);
db.close();
