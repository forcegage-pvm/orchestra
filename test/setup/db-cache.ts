/**
 * Database Setup Cache for Test Performance
 *
 * Implements TD-028: Database Migration Bottleneck in Test Suite
 *
 * Problem: 77 test files × 17 migrations = 1309 migration executions per test run
 * Solution: Run migrations ONCE in global setup, then copy the database for each test
 *
 * Usage in test files:
 * ```typescript
 * import { setupTestDb, cleanupTestDb } from '../setup/db-cache.js';
 *
 * let tempDir: string;
 *
 * beforeEach(async () => {
 *   tempDir = await setupTestDb('my-test-');
 * });
 *
 * afterEach(async () => {
 *   await cleanupTestDb(tempDir);
 * });
 * ```
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// File where global setup stores the template path
const TEMPLATE_PATH_FILE = path.join(
  os.tmpdir(),
  "orchestra-test-db-template.txt",
);

/**
 * Get the pre-migrated database template path from global setup
 */
function getTemplatePath(): string | null {
  try {
    if (fs.existsSync(TEMPLATE_PATH_FILE)) {
      return fs.readFileSync(TEMPLATE_PATH_FILE, "utf8").trim();
    }
  } catch {
    // Ignore
  }
  return null;
}

/**
 * Singleton cache for database setup
 */
class DatabaseSetupCache {
  private static instance: DatabaseSetupCache;
  private templatePath: string | null = null;
  private fallbackBaseDir: string | null = null;
  private fallbackInitialized = false;

  static getInstance(): DatabaseSetupCache {
    if (!DatabaseSetupCache.instance) {
      DatabaseSetupCache.instance = new DatabaseSetupCache();
      // Try to get template from global setup
      DatabaseSetupCache.instance.templatePath = getTemplatePath();
    }
    return DatabaseSetupCache.instance;
  }

  /**
   * Get an initialized database for a test
   */
  async getInitializedDatabase(testName: string): Promise<string> {
    if (this.templatePath && !fs.existsSync(this.templatePath)) {
      this.templatePath = null;
    }

    // If no template from global setup, create one (fallback for single-file runs)
    if (!this.templatePath) {
      if (!this.fallbackInitialized) {
        await this.initializeFallback();
      }
    }

    // Create test-specific temp directory
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), testName));

    // Copy database to test location
    this.copyDatabase(testDir);

    return testDir;
  }

  private async initializeFallback(): Promise<void> {
    this.fallbackBaseDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "orchestra-db-fallback-"),
    );

    const originalWorkspace = process.env.ORCHESTRA_WORKSPACE;

    try {
      process.env.ORCHESTRA_WORKSPACE = this.fallbackBaseDir;

      const { resetDb, initializeDb, runMigrationsV2 } =
        await import("../../src/db/index.js");

      resetDb();
      await initializeDb();
      await runMigrationsV2();

      this.templatePath = path.join(
        this.fallbackBaseDir,
        ".orchestra",
        "orchestra.db",
      );
      resetDb();
      this.fallbackInitialized = true;
    } finally {
      if (originalWorkspace !== undefined) {
        process.env.ORCHESTRA_WORKSPACE = originalWorkspace;
      } else {
        delete process.env.ORCHESTRA_WORKSPACE;
      }
    }
  }

  private copyDatabase(testDir: string): void {
    if (!this.templatePath || !fs.existsSync(this.templatePath)) {
      throw new Error("Database template not found");
    }

    const testOrchestraDir = path.join(testDir, ".orchestra");
    fs.mkdirSync(testOrchestraDir, { recursive: true });

    const testDbPath = path.join(testOrchestraDir, "orchestra.db");
    fs.copyFileSync(this.templatePath, testDbPath);
  }
}

export const dbCache = DatabaseSetupCache.getInstance();

/**
 * Setup a test with a pre-migrated database.
 * Replaces the pattern of:
 *   tempDir = fs.mkdtempSync(...);
 *   process.env.ORCHESTRA_WORKSPACE = tempDir;
 *   resetDb();
 *   await initializeDb();
 *   await runMigrationsV2();  // <-- This is the slow part
 *
 * @param testPrefix - Prefix for the temp directory name
 * @returns The temp directory path
 */
export async function setupTestDb(testPrefix: string): Promise<string> {
  // Get test directory with pre-copied database
  const tempDir = await dbCache.getInitializedDatabase(testPrefix);

  // Set environment
  process.env.ORCHESTRA_WORKSPACE = tempDir;

  // Reset db connection to pick up new path
  const { resetDb, getDb } = await import("../../src/db/index.js");
  resetDb();
  getDb(); // Force connection

  return tempDir;
}

/**
 * Cleanup after a test.
 * Replaces the pattern of:
 *   resetDb();
 *   fs.rmSync(tempDir, { recursive: true });
 *   delete process.env.ORCHESTRA_WORKSPACE;
 *
 * @param tempDir - The temp directory to clean up
 */
export async function cleanupTestDb(tempDir: string): Promise<void> {
  const { resetDb } = await import("../../src/db/index.js");

  // Close db connection
  resetDb();

  // Remove temp directory
  if (tempDir && fs.existsSync(tempDir)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors (Windows file locking)
    }
  }

  // Clean environment
  delete process.env.ORCHESTRA_WORKSPACE;
}
