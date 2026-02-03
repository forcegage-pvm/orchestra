import { getDb } from "./src/db/index.js";

const db = getDb();

// Check agent_sessions foreign keys
const sessionsFKs = await db.all(`PRAGMA foreign_key_list(agent_sessions)`);
console.log("\n=== agent_sessions foreign keys ===");
console.log(JSON.stringify(sessionsFKs, null, 2));

// Check session_events foreign keys
const eventsFKs = await db.all(`PRAGMA foreign_key_list(session_events)`);
console.log("\n=== session_events foreign keys ===");
console.log(JSON.stringify(eventsFKs, null, 2));
