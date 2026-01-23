/**
 * TDD Red Registry CRUD Operations
 *
 * Provides functions for managing TDD red test registry entries:
 * - registerTest: Create new registry entry
 * - getTestsByTask: Retrieve entries for a task
 */

import { eq } from "drizzle-orm";
import { getActiveSprint, getDb } from "../db/index.js";
import { tasks, tddRedRegistry } from "../db/schema.js";
import type { TddRegistryEntry } from "../schemas/tdd-registry.js";

/**
 * Options for registering a new TDD red test
 */
export interface RegisterTestOptions {
  taskId: number; // User-facing task ID
  testFile: string; // Relative path to test file
  testCount: number; // Number of tests in file
}

/**
 * Result of registering a test
 */
export interface RegisterTestResult {
  registryId: number;
  testFile: string;
  testCount: number;
}

/**
 * Register a new TDD red test file in the registry
 *
 * @param options - Registration options including taskId, testFile, and testCount
 * @returns Registry entry metadata
 * @throws Error if no active sprint or task not found
 */
export async function registerTest(
  options: RegisterTestOptions
): Promise<RegisterTestResult> {
  const { taskId, testFile, testCount } = options;
  const db = getDb();

  // Get active sprint
  const sprint = await getActiveSprint();
  if (!sprint) {
    throw new Error("No active sprint found");
  }

  // Get task's internal ID from tasks table
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.task_id, taskId))
    .limit(1);

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  // Insert registry entry
  const now = new Date().toISOString();
  const [entry] = await db
    .insert(tddRedRegistry)
    .values({
      sprint_id: sprint.id,
      red_task_id: task.id,
      test_file: testFile,
      test_count: testCount,
      created_at: now,
    })
    .returning();

  if (!entry) {
    throw new Error("Failed to insert registry entry");
  }

  return {
    registryId: entry.id,
    testFile: entry.test_file,
    testCount: entry.test_count ?? 1,
  };
}

/**
 * Get all registry entries for a specific red-phase task
 *
 * @param taskId - User-facing task ID
 * @returns Array of registry entries
 * @throws Error if task not found
 */
export async function getTestsByTask(
  taskId: number
): Promise<TddRegistryEntry[]> {
  const db = getDb();

  // Get task's internal ID
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.task_id, taskId))
    .limit(1);

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  // Query registry entries
  const entries = await db
    .select()
    .from(tddRedRegistry)
    .where(eq(tddRedRegistry.red_task_id, task.id));

  // Map to TddRegistryEntry type
  return entries.map((entry) => ({
    id: entry.id,
    sprint_id: entry.sprint_id,
    red_task_id: entry.red_task_id,
    test_file: entry.test_file,
    test_count: entry.test_count ?? 1,
    created_at: entry.created_at,
  }));
}
