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
  testIdentifier: string; // Format: "file::group::test"
}

/**
 * Result of registering a test
 */
export interface RegisterTestResult {
  registryId: number;
  testIdentifier: string;
  status: "REGISTERED";
}

/**
 * Register a new TDD red test in the registry
 *
 * @param options - Registration options including taskId and testIdentifier
 * @returns Registry entry metadata
 * @throws Error if no active sprint or task not found
 */
export async function registerTest(
  options: RegisterTestOptions
): Promise<RegisterTestResult> {
  const { taskId, testIdentifier } = options;
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
      test_identifier: testIdentifier,
      test_file: null,
      created_at: now,
    })
    .returning();

  if (!entry) {
    throw new Error("Failed to insert registry entry");
  }

  return {
    registryId: entry.id,
    testIdentifier: entry.test_identifier,
    status: "REGISTERED",
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
    test_identifier: entry.test_identifier,
    test_file: entry.test_file ?? undefined,
    created_at: entry.created_at,
  }));
}
