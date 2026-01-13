const Database = require("better-sqlite3");
const db = new Database(".orchestra/orchestra.db");

console.log("=== GIT COMMITS IN DATABASE ===");
const commits = db
  .prepare(
    `
  SELECT id, commit_sha, commit_message, tool_execution_id, sprint_id, task_id, committed_at 
  FROM git_commits 
  ORDER BY id DESC 
  LIMIT 15
`
  )
  .all();

commits.forEach((c) => {
  const sha = c.commit_sha ? c.commit_sha.substring(0, 7) : "null";
  console.log(
    `[${c.id}] ${c.committed_at} | Task:${c.task_id || "null"} | ${sha} | ${
      c.commit_message
    }`
  );
});

console.log("\n=== TOOL EXECUTIONS WITH COMMITS ===");
const execs = db
  .prepare(
    `
  SELECT te.id, te.tool_name, te.executed_at, gc.commit_sha, gc.commit_message 
  FROM tool_executions te 
  LEFT JOIN git_commits gc ON gc.tool_execution_id = te.id 
  WHERE te.tool_name IN ('prepare_task', 'signal_completion', 'complete_task')
  ORDER BY te.id DESC 
  LIMIT 20
`
  )
  .all();

execs.forEach((e) => {
  const commit = e.commit_sha
    ? `${e.commit_sha.substring(0, 7)} - ${e.commit_message}`
    : "NO COMMIT";
  console.log(`[${e.id}] ${e.executed_at} | ${e.tool_name} | ${commit}`);
});

db.close();
