import { getDb } from "./src/db/index.js";

const db = getDb();

// Check tables exist
const tables = await db.all(
  `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('agent_sessions', 'session_events') ORDER BY name`,
);
console.log("\n=== Tables ===");
console.log(JSON.stringify(tables, null, 2));

// Check agent_sessions schema
const sessionsSchema = await db.all(`PRAGMA table_info(agent_sessions)`);
console.log("\n=== agent_sessions columns ===");
console.log(JSON.stringify(sessionsSchema, null, 2));

// Check session_events schema
const eventsSchema = await db.all(`PRAGMA table_info(session_events)`);
console.log("\n=== session_events columns ===");
console.log(JSON.stringify(eventsSchema, null, 2));

// Check indexes
const indexes = await db.all(
  `SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND tbl_name IN ('agent_sessions', 'session_events') AND name LIKE 'idx_%' ORDER BY tbl_name, name`,
);
console.log("\n=== Indexes ===");
console.log(JSON.stringify(indexes, null, 2));
