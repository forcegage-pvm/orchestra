# Test Setup - Database Caching System

This directory contains the shared test infrastructure for Orchestra's test suite.

## Overview

Orchestra uses a **pre-migrated database cache** pattern to achieve 5x faster test runs. Migrations run ONCE when the test suite starts, and each test file copies the pre-migrated template.

## Performance

| Metric | Old Pattern | New Pattern | Improvement |
|--------|-------------|-------------|-------------|
| Test Duration | ~95 seconds | ~18 seconds | **5.3x faster** |
| Migration Runs | 1309 (17 × 77) | 17 (once) | **77x fewer** |

## Required Pattern for All Tests

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../src/db/index.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

describe("My Test Suite", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("my-test-");
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  it("should do something with database", async () => {
    const db = getDb();
    // ... test code
  });
});
```

## Key Functions

### `setupTestDb(prefix: string): Promise<string>`

- Creates a unique temp directory with the given prefix
- Copies the pre-migrated database template to `.orchestra/orchestra.db`
- Sets `ORCHESTRA_WORKSPACE` environment variable
- Returns the temp directory path (save this for cleanup)

### `cleanupTestDb(tempDir: string): Promise<void>`

- Closes the database connection via `closeDb()`
- Removes the temp directory and all contents
- Clears `ORCHESTRA_WORKSPACE` environment variable

### `getDb(): BetterSqlite3Database`

Import from `../../src/db/index.js` - gets the current database connection.

## ❌ DO NOT USE (Old Pattern)

The following pattern is **deprecated** and causes 5x slower tests:

```typescript
// ❌ WRONG - causes 1309 migration runs per test session
import { initializeDb, resetDb } from "../../src/db/index.js";
import { runMigrationsV2 } from "../../src/db/migrations.js";

beforeEach(async () => {
  tempDir = fs.mkdtempSync(...);
  process.env.ORCHESTRA_WORKSPACE = tempDir;
  resetDb();
  await initializeDb();
  await runMigrationsV2();  // ← This runs 17 migrations EVERY test file
});
```

## How It Works

1. **Global Setup** (`global-setup.ts`): Runs before any test workers start
   - Creates a base temp directory
   - Runs all migrations ONCE
   - Writes the template path to a temp file

2. **Per-Test Setup** (`setupTestDb()`): Runs in each test's beforeEach
   - Reads template path from temp file
   - Copies the pre-migrated database file
   - Points the test to the copied database

3. **Per-Test Cleanup** (`cleanupTestDb()`): Runs in each test's afterEach
   - Closes database connection
   - Deletes temp directory

## Files

- `db-cache.ts` - DatabaseSetupCache singleton, `setupTestDb()`, `cleanupTestDb()`
- `global-setup.ts` - Vitest globalSetup that creates the template database
- `README.md` - This documentation

## Technical Debt Reference

See [TD-028-database-migration-test-bottleneck.md](../../technical-debt/TD-028-database-migration-test-bottleneck.md) for the full analysis and solution details.
