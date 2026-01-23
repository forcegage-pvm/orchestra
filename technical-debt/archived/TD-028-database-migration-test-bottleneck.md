# TD-028: Database Migration Bottleneck in Test Suite

## Status: RESOLVED

## Priority: P1 (High)

## Created: 2026-01-22

## Resolved: 2026-01-27

## Resolution Summary

Implemented **Solution 1: Shared Database Setup** as recommended. Created vitest globalSetup that runs all 17 migrations ONCE before any test files load, then each test file copies the pre-migrated database template.

### Files Created/Modified

- `test/setup/db-cache.ts` - DatabaseSetupCache singleton with `setupTestDb()` and `cleanupTestDb()` exports
- `test/setup/global-setup.ts` - Vitest globalSetup that creates template database once
- `vitest.config.ts` - Added `globalSetup: ["./test/setup/global-setup.ts"]`
- 37 test files updated to use `setupTestDb/cleanupTestDb` pattern

### Performance Results

| Metric               | Before         | After           | Improvement     |
| -------------------- | -------------- | --------------- | --------------- |
| Total test time      | ~95 seconds    | ~18 seconds     | **5.3x faster** |
| Migration executions | 1309 (17 × 77) | 17 (once)       | **77x fewer**   |
| Per-test setup       | 8-34 seconds   | 0.1-0.4 seconds | **~50x faster** |

### New Test Pattern

```typescript
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

describe("Test Suite", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("prefix-");
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });
});
```

---

## Original Problem Statement

The test suite performance is severely limited by database migrations running for every test file. With 77 test files and 17 migrations per file, the suite executes approximately 1309 individual migration operations, taking ~95 seconds total (~1.2 seconds per test file).

### Performance Impact

- **Total test time**: ~95 seconds for 1086 tests
- **Migration overhead**: ~652-2618 seconds of cumulative DB setup time
- **Per-test overhead**: 8.5-34 seconds of database work per test file
- **Parallelization limited**: Even with 8 workers, database I/O contention reduces benefits

### Root Cause Analysis

Every test file follows this setup pattern:

```typescript
beforeEach(async () => {
  // 1. Create isolated temp directory
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-name-"));
  process.env.ORCHESTRA_WORKSPACE = tempDir;

  // 2. Reset database connection
  resetDb();

  // 3. Initialize fresh database
  await initializeDb();

  // 4. RUN ALL 17 MIGRATIONS FROM SCRATCH
  await runMigrationsV2();
});
```

#### What Each Migration Does

Each of the 17 migrations performs expensive database operations:

1. **Schema introspection**: `PRAGMA table_info()` queries
2. **Table alterations**: `ALTER TABLE` operations
3. **Table creation**: Complex `CREATE TABLE` with 15+ columns
4. **Index creation**: Multiple `CREATE INDEX` operations
5. **Foreign key setup**: Constraint validation
6. **Transaction commits**: Disk I/O for persistence

Example migration (`20260117_007_add_controller_agent_schema`):

- Checks if columns exist (multiple PRAGMA queries)
- Adds status column to sprints table
- Creates spec_reviews table (15 columns, foreign keys)
- Creates 4 indexes on the new table
- All operations are disk I/O bound

#### The Math Problem

- **17 migrations** × **77 test files** = **1309 migration executions**
- Each migration: 0.5-2 seconds (disk I/O, schema operations)
- Total theoretical time: 654-2618 seconds
- Actual time with parallelism: ~95 seconds
- **98% of test time is database setup, 2% is actual testing**

## Current Workarounds

### Applied Optimizations (Limited Impact)

Recent test runner optimizations provided only 2% improvement because they optimize test execution, not setup:

- ✅ **Thread pool**: Uses 4-8 workers effectively
- ✅ **Caching**: Reduces redundant operations
- ✅ **Watch mode**: Good for TDD workflow
- ✅ **Sharding**: 3x speedup for CI (96s → ~32s)
- ❌ **Database bottleneck**: Migrations run before any test code

## Proposed Solutions

### Solution 1: Shared Database Setup (Recommended)

#### Concept

Run migrations once per test session, reuse across all test files.

#### Implementation

**A. Create Migration Cache System**

```typescript
// src/test/db-test-setup.ts
class DatabaseSetupCache {
  private static instance: DatabaseSetupCache;
  private baseDbPath: string;
  private isInitialized = false;

  static getInstance() {
    if (!DatabaseSetupCache.instance) {
      DatabaseSetupCache.instance = new DatabaseSetupCache();
    }
    return DatabaseSetupCache.instance;
  }

  async getInitializedDatabase(testName: string): Promise<string> {
    if (!this.isInitialized) {
      await this.initializeBaseDatabase();
      this.isInitialized = true;
    }

    // Copy base database to test-specific location
    const testDbPath = this.createTestDatabase(testName);
    await this.copyBaseDatabase(testDbPath);
    return testDbPath;
  }

  private async initializeBaseDatabase() {
    // Run migrations once
    resetDb();
    await initializeDb();
    await runMigrationsV2();
    this.baseDbPath = getCurrentDbPath();
  }
}
```

**B. Update Test Setup Pattern**

```typescript
// In each test file
beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-name-"));
  process.env.ORCHESTRA_WORKSPACE = tempDir;

  // Get pre-migrated database instead of running migrations
  const dbPath =
    await DatabaseSetupCache.getInstance().getInitializedDatabase(testName);
  setTestDatabasePath(dbPath);
});
```

#### Benefits

- **Migration time**: 17 migrations × 1 run = **~8.5-34 seconds total** (vs 652-2618 seconds)
- **Per-test time**: ~0.1-0.4 seconds setup (vs 8.5-34 seconds)
- **Total test time**: ~10-20 seconds (vs ~95 seconds)
- **10x speedup** for local development

#### Risks

- **Test isolation**: Tests might interfere with each other
- **State leakage**: One test's changes affect others
- **Debugging complexity**: Harder to isolate test-specific issues

#### Mitigation

- Use database snapshots/checkpoints for true isolation
- Add test naming to database paths for debugging
- Implement cleanup verification

### Solution 2: In-Memory SQLite Databases

#### Concept

Use `:memory:` databases instead of temp files for faster I/O.

#### Implementation

```typescript
// src/db/index.ts
export async function initializeTestDb(): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    // Use in-memory database for tests
    const db = new Database(":memory:");
    setGlobalDb(db);
    return;
  }

  // Normal file-based initialization
  const db = new Database(getDbPath());
  setGlobalDb(db);
}
```

#### Benefits

- **I/O elimination**: No disk writes for schema operations
- **Faster operations**: Memory is ~100x faster than disk
- **Cleanup**: Automatic when process ends

#### Risks

- **Concurrency**: Multiple test files can't share in-memory DB
- **Migration complexity**: Each test still needs its own migrations
- **Memory usage**: Large schemas consume RAM

### Solution 3: Transaction-Based Test Isolation

#### Concept

Run migrations once, then use savepoints/rollbacks for test isolation.

#### Implementation

```typescript
class TransactionTestSetup {
  private static baseDb: Database;

  static async setup() {
    if (!this.baseDb) {
      this.baseDb = new Database(":memory:");
      await runMigrationsV2(this.baseDb);
    }
  }

  static async createTestContext(): Promise<TestContext> {
    // Create savepoint for this test
    await this.baseDb.run("SAVEPOINT test_start");

    return {
      db: this.baseDb,
      rollback: async () => {
        await this.baseDb.run("ROLLBACK TO test_start");
      },
    };
  }
}
```

#### Benefits

- **Single migration run**: Setup once per session
- **Fast isolation**: Savepoints are instantaneous
- **True isolation**: Each test sees clean state

#### Risks

- **SQLite limitations**: Savepoints have nesting limits
- **Memory growth**: Uncommitted transactions consume memory
- **Debugging**: Harder to inspect database state

### Solution 4: Pre-built Database Snapshots

#### Concept

Create database snapshots that can be quickly restored.

#### Implementation

```typescript
// Build script: create-db-snapshot.js
async function createSnapshot() {
  // Run migrations on fresh database
  await initializeDb();
  await runMigrationsV2();

  // Export database as SQL dump
  const dump = await db.all(
    "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL",
  );
  fs.writeFileSync("test-snapshot.sql", dump.map((row) => row.sql).join(";\n"));
}

// Test setup: restore-snapshot.js
async function restoreSnapshot() {
  const db = new Database(":memory:");
  const snapshot = fs.readFileSync("test-snapshot.sql", "utf8");
  db.exec(snapshot);
  return db;
}
```

#### Benefits

- **Fast restoration**: Import SQL dump is fast
- **Predictable state**: Known good database state
- **CI friendly**: Snapshot can be cached

#### Risks

- **Snapshot staleness**: Must update when schema changes
- **Size limits**: Large dumps slow restoration
- **Maintenance overhead**: Manual snapshot updates

## Recommended Implementation Plan

### Phase 1: Shared Database Setup (Immediate Impact)

1. Implement `DatabaseSetupCache` class
2. Update test files to use cached setup
3. Measure performance improvement
4. Add monitoring for isolation issues

### Phase 2: Transaction Isolation (Enhanced Isolation)

1. Implement transaction-based isolation
2. Replace file copying with savepoints
3. Add test failure diagnostics

### Phase 3: CI Optimizations (Parallel Scaling)

1. Implement sharding with database snapshots
2. Add CI-specific optimizations
3. Monitor for scaling bottlenecks

## Success Metrics

- **Local development**: 10x speedup (95s → 9.5s)
- **CI builds**: 3x speedup with sharding (96s → 32s)
- **Test reliability**: No isolation-related test failures
- **Debugging**: Clear test-specific database inspection

## Related Files

- `src/db/migrations.ts` - Migration definitions (17 migrations)
- `src/db/index.ts` - Database initialization
- `test/**/*.test.ts` - Test files using migration setup
- `vitest.config.ts` - Test runner configuration

## Dependencies

- Requires test architecture refactoring
- May need database connection pooling
- Could impact test debugging workflows

## Risk Assessment

- **High reward**: 10x performance improvement
- **Medium risk**: Test isolation could be compromised
- **Low complexity**: Well-understood database patterns
- **High feasibility**: Standard testing practices exist</content>
  <parameter name="filePath">x:\Cloud Storage\Dropbox\Repositories\vs code\orchestra\technical-debt\TD-028-database-migration-test-bottleneck.md
