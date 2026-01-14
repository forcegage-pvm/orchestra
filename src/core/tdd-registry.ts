/**
 * TDD Red Registry CRUD Operations
 *
 * Provides functions for managing TDD red test registry entries:
 * - registerTest: Create new registry entry
 * - getTestsByTask: Retrieve entries for a task
 * - updateStatus: Update entry status with timestamps
 */

import { and, eq } from "drizzle-orm";
import { getActiveSprint, getDb } from "../db/index.js";
import { tasks, tddRedRegistry } from "../db/schema.js";
import type {
  TddRegistryEntry,
  TddRegistryStatus,
} from "../schemas/tdd-registry.js";

/**
 * Options for registering a new TDD red test
 */
export interface RegisterTestOptions {
  taskId: number; // User-facing task ID
  testIdentifier: string; // Format: "file::group::test"
  description?: string;
  markerType?: string; // e.g., "it.skip", "@Tags(['tdd-red'])"
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
  const { taskId, testIdentifier, description, markerType } = options;
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
      description: description ?? null,
      marker_type: markerType ?? null,
      status: "REGISTERED",
      created_at: now,
      validated_at: null,
      assigned_at: null,
      greened_at: null,
      green_task_id: null,
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
    description: entry.description ?? undefined,
    marker_type: entry.marker_type ?? undefined,
    status: entry.status as TddRegistryStatus,
    green_task_id: entry.green_task_id ?? undefined,
    created_at: entry.created_at,
    validated_at: entry.validated_at ?? undefined,
    assigned_at: entry.assigned_at ?? undefined,
    greened_at: entry.greened_at ?? undefined,
  }));
}

/**
 * Update the status of a registry entry with appropriate timestamps
 *
 * @param registryId - Registry entry ID
 * @param newStatus - New status value
 * @returns Updated registry entry
 * @throws Error if registry entry not found
 */
export async function updateStatus(
  registryId: number,
  newStatus: TddRegistryStatus
): Promise<TddRegistryEntry> {
  const db = getDb();
  const now = new Date().toISOString();

  // Prepare update values based on status
  const updateValues: {
    status: TddRegistryStatus;
    validated_at?: string;
    assigned_at?: string;
    greened_at?: string;
  } = {
    status: newStatus,
  };

  // Set appropriate timestamp based on status
  switch (newStatus) {
    case "VALIDATED":
      updateValues.validated_at = now;
      break;
    case "PENDING_GREEN":
      updateValues.assigned_at = now;
      break;
    case "GREEN":
      updateValues.greened_at = now;
      break;
  }

  // Update the entry
  const [updated] = await db
    .update(tddRedRegistry)
    .set(updateValues)
    .where(eq(tddRedRegistry.id, registryId))
    .returning();

  if (!updated) {
    throw new Error(`Registry entry ${registryId} not found`);
  }

  // Map to TddRegistryEntry type
  return {
    id: updated.id,
    sprint_id: updated.sprint_id,
    red_task_id: updated.red_task_id,
    test_identifier: updated.test_identifier,
    description: updated.description ?? undefined,
    marker_type: updated.marker_type ?? undefined,
    status: updated.status as TddRegistryStatus,
    green_task_id: updated.green_task_id ?? undefined,
    created_at: updated.created_at,
    validated_at: updated.validated_at ?? undefined,
    assigned_at: updated.assigned_at ?? undefined,
    greened_at: updated.greened_at ?? undefined,
  };
}

/**
 * Assign VALIDATED tests to a green-phase task
 *
 * Transitions all VALIDATED registry entries for a red task to PENDING_GREEN,
 * setting the green_task_id and assigned_at timestamp.
 *
 * @param redTaskId - Internal ID of the red-phase task
 * @param greenTaskInternalId - Internal ID of the green-phase task
 * @returns Number of entries transitioned
 */
export async function assignToGreenTask(
  redTaskId: number,
  greenTaskInternalId: number
): Promise<number> {
  const db = getDb();
  const now = new Date().toISOString();

  // Update all VALIDATED entries for this red task
  const result = await db
    .update(tddRedRegistry)
    .set({
      status: "PENDING_GREEN",
      green_task_id: greenTaskInternalId,
      assigned_at: now,
    })
    .where(
      and(
        eq(tddRedRegistry.red_task_id, redTaskId),
        eq(tddRedRegistry.status, "VALIDATED")
      )
    );

  // Return the number of rows updated
  return result.changes;
}
