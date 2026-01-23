/**
 * Vitest Global Setup
 *
 * Runs ONCE before all test workers start.
 * Creates a pre-migrated database template that all tests can copy.
 *
 * This implements TD-028: Database Migration Bottleneck fix.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// File where we store the template path for workers to find
const TEMPLATE_PATH_FILE = path.join(
  os.tmpdir(),
  "orchestra-test-db-template.txt",
);

export async function setup(): Promise<void> {
  // Create temp directory for the base database
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-db-base-"));

  // Set workspace for initialization
  process.env.ORCHESTRA_WORKSPACE = baseDir;

  // Import and run migrations
  const { resetDb, initializeDb, runMigrationsV2 } =
    await import("../../src/db/index.js");

  resetDb();
  await initializeDb();
  await runMigrationsV2();

  // Store path and close connection
  const templatePath = path.join(baseDir, ".orchestra", "orchestra.db");
  resetDb();

  // Write template path to file for workers
  fs.writeFileSync(TEMPLATE_PATH_FILE, templatePath, "utf8");

  // Clean up env
  delete process.env.ORCHESTRA_WORKSPACE;

  console.log(`\n🗄️  Database template created: ${templatePath}\n`);
}

export async function teardown(): Promise<void> {
  try {
    if (fs.existsSync(TEMPLATE_PATH_FILE)) {
      const templatePath = fs.readFileSync(TEMPLATE_PATH_FILE, "utf8");
      const baseDir = path.dirname(path.dirname(templatePath));

      // Clean up template
      if (baseDir.includes("orchestra-db-base-")) {
        fs.rmSync(baseDir, { recursive: true, force: true });
      }

      fs.unlinkSync(TEMPLATE_PATH_FILE);
    }
  } catch {
    // Ignore errors
  }
}
