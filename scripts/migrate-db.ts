#!/usr/bin/env npx tsx
/**
 * Database Migration Script
 *
 * Run this to apply schema migrations to an existing database.
 *
 * Usage:
 *   npx tsx scripts/migrate-db.ts
 *   npx tsx scripts/migrate-db.ts --status
 *   npx tsx scripts/migrate-db.ts --workspace /path/to/workspace
 *   ORCHESTRA_WORKSPACE=/path npx tsx scripts/migrate-db.ts
 */

import {
  closeDb,
  getDb,
  getDbPath,
  getMigrationStatus,
  getSchemaVersion,
  initializeDb,
  runMigrationsV2,
} from "../src/db/index.js";

async function main() {
  const args = process.argv.slice(2);
  const showStatus = args.includes("--status") || args.includes("-s");

  console.log("Orchestra Database Migration");
  console.log("============================\n");

  // Force database connection to initialize with current workspace
  getDb();

  const dbPath = getDbPath();
  console.log(`Database: ${dbPath}\n`);

  if (!dbPath) {
    console.error("ERROR: Could not resolve database path.");
    console.error(
      "Set ORCHESTRA_WORKSPACE environment variable or use --workspace flag."
    );
    process.exit(1);
  }

  // First ensure base schema exists
  console.log("Ensuring base schema...");
  await initializeDb();

  if (showStatus) {
    // Just show status
    const status = await getMigrationStatus();
    const version = await getSchemaVersion();

    console.log(`\nSchema Version: ${version || "(initial)"}`);
    console.log(`\nMigration Status:`);
    console.log(`  Total migrations: ${status.total}`);
    console.log(`  Applied: ${status.applied.length}`);
    console.log(`  Pending: ${status.pending.length}`);

    if (status.applied.length > 0) {
      console.log(`\nApplied Migrations:`);
      status.applied.forEach((id) => console.log(`  ✓ ${id}`));
    }

    if (status.pending.length > 0) {
      console.log(`\nPending Migrations:`);
      status.pending.forEach((id) => console.log(`  ○ ${id}`));
    }
  } else {
    // Run migrations
    console.log("\nRunning versioned migrations...");
    const result = await runMigrationsV2();

    if (result.applied === 0) {
      console.log("\n✓ Database is up to date - no migrations needed.");
    } else {
      console.log(`\n✓ Applied ${result.applied} migration(s):`);
      result.migrations.forEach((id) => console.log(`  - ${id}`));
    }

    const version = await getSchemaVersion();
    console.log(`\nCurrent Schema Version: ${version}`);
  }

  closeDb();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
