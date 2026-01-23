// Script to de-escalate a task (simulating human supervisor action)
// Usage: node scripts/de-escalate.js <task_id> [target_status] [--clear-signal]
//
// Examples:
//   node scripts/de-escalate.js 1                    # Move task 1 to GATE_CHECK
//   node scripts/de-escalate.js 1 IMPLEMENT          # Move task 1 to IMPLEMENT
//   node scripts/de-escalate.js 1 IMPLEMENT --clear-signal  # Move to IMPLEMENT and clear stale signal

import Database from "better-sqlite3";

const args = process.argv.slice(2);
const taskId = parseInt(args[0] || "1");
const clearSignal = args.includes("--clear-signal");
const targetStatus =
  args.find((a) => !a.startsWith("--") && isNaN(parseInt(a))) ||
  (clearSignal ? "IMPLEMENT" : "GATE_CHECK");

const db = new Database(".orchestra/orchestra.db");

// Get sprint ID first
const sprint = db.prepare("SELECT id FROM sprints WHERE is_active = 1").get();
if (!sprint) {
  console.error("No active sprint found");
  process.exit(1);
}

// Update task status
const result = db
  .prepare(
    `
  UPDATE tasks 
  SET status = ? 
  WHERE task_id = ? 
  AND sprint_id = ?
`
  )
  .run(targetStatus, taskId, sprint.id);

console.log(
  `De-escalated task ${taskId} to ${targetStatus}. Changes: ${result.changes}`
);

// Optionally clear stale signal
if (clearSignal) {
  // Get the internal task row id for FK reference
  const task = db
    .prepare("SELECT id FROM tasks WHERE task_id = ? AND sprint_id = ?")
    .get(taskId, sprint.id);
  if (task) {
    const signalResult = db
      .prepare("DELETE FROM signals WHERE task_id = ?")
      .run(task.id);
    console.log(`Cleared ${signalResult.changes} signal(s) for task ${taskId}`);

    // Verification results cascade delete from signals, but clear explicitly for safety
    const verifyResult = db
      .prepare("DELETE FROM verification_results WHERE task_id = ?")
      .run(task.id);
    if (verifyResult.changes > 0) {
      console.log(`Cleared ${verifyResult.changes} verification result(s)`);
    }
  }
}

db.close();
