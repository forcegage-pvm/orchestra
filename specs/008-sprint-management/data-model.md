# Data Model: Sprint Management & UI Consistency

**Feature Branch**: `008-sprint-management`  
**Created**: 2026-01-23  
**Status**: Complete

## Overview

This document defines the data model changes required for sprint archive functionality, filtering, and UI consistency improvements.

---

## Database Schema Changes

### Table: `sprints` (UPDATE)

#### Current Schema

```typescript
export const sprints = sqliteTable("sprints", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  workflow_step: text("workflow_step").notNull(),
  config: text("config"),
  is_active: integer("is_active", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  completed_at: text("completed_at"),
});
```

#### New Column

| Column        | Type              | Default | Nullable | Index | Description                                           |
| ------------- | ----------------- | ------- | -------- | ----- | ----------------------------------------------------- |
| `is_archived` | INTEGER (boolean) | `false` | NOT NULL | Yes   | Whether sprint is archived (hidden from default view) |

#### Updated Schema

```typescript
export const sprints = sqliteTable(
  "sprints",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    workflow_step: text("workflow_step").notNull(),
    config: text("config"),
    is_active: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(false),
    is_archived: integer("is_archived", { mode: "boolean" })
      .notNull()
      .default(false), // NEW
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    completed_at: text("completed_at"),
  },
  (sprints) => ({
    workflowStepIdx: index("workflow_step_idx").on(sprints.workflow_step),
    isActiveIdx: index("is_active_idx").on(sprints.is_active),
    isArchivedIdx: index("is_archived_idx").on(sprints.is_archived), // NEW
    statusIdx: index("sprint_status_idx").on(sprints.status),
  }),
);
```

### Migration SQL

```sql
-- Migration: Add is_archived column to sprints table
ALTER TABLE sprints ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
CREATE INDEX is_archived_idx ON sprints(is_archived);
```

---

## TypeScript Types

### Filter Enum

```typescript
/**
 * Sprint visibility filter for UI
 */
export type SprintFilter = "active" | "archived" | "all";
```

### Sprint Type Extension

```typescript
/**
 * Sprint record from database
 */
export interface Sprint {
  id: string;
  name: string;
  status: SprintStatus;
  workflow_step: WorkflowStep;
  config: string | null;
  is_active: boolean;
  is_archived: boolean; // NEW
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
```

### Signal File Format

```typescript
/**
 * Enhanced signal file content
 * Format: "{timestamp}:{sequence}" or "{timestamp}" (legacy)
 */
export interface SignalContent {
  timestamp: number;
  sequence?: number; // Optional for backward compatibility
}

/**
 * Parse signal file content
 */
export function parseSignal(content: string): SignalContent {
  const [timestampStr, sequenceStr] = content.split(":");
  return {
    timestamp: parseInt(timestampStr, 10),
    sequence: sequenceStr ? parseInt(sequenceStr, 10) : undefined,
  };
}
```

---

## Query Interfaces

### getAllSprints (UPDATE)

```typescript
/**
 * Get all sprints with optional archive filter
 *
 * @param workspaceRoot - Workspace root path for database connection
 * @param filter - Optional filter: "active" (default), "archived", or "all"
 * @returns Array of sprints matching filter criteria
 */
export function getAllSprints(
  workspaceRoot: string,
  filter: SprintFilter = "active",
): Sprint[] {
  const db = getDb(workspaceRoot);

  let query = db.select().from(sprints);

  if (filter === "active") {
    query = query.where(eq(sprints.is_archived, false));
  } else if (filter === "archived") {
    query = query.where(eq(sprints.is_archived, true));
  }
  // filter === "all" - no where clause

  return query.orderBy(desc(sprints.created_at)).all();
}
```

### archiveSprint (NEW)

```typescript
/**
 * Archive a sprint
 *
 * @param sprintId - Sprint ID to archive
 * @throws Error if sprint is currently active
 */
export async function archiveSprint(sprintId: string): Promise<void> {
  const db = getDb();

  const [sprint] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.id, sprintId))
    .limit(1);

  if (!sprint) {
    throw new ValidationError("Sprint not found", [
      { field: "sprintId", message: "Sprint does not exist" },
    ]);
  }

  if (sprint.is_active) {
    throw new ValidationError("Cannot archive active sprint", [
      { field: "sprintId", message: "Set a different sprint as active first" },
    ]);
  }

  await db
    .update(sprints)
    .set({
      is_archived: true,
      updated_at: new Date().toISOString(),
    })
    .where(eq(sprints.id, sprintId));
}
```

### unarchiveSprint (NEW)

```typescript
/**
 * Unarchive a sprint
 *
 * @param sprintId - Sprint ID to unarchive
 */
export async function unarchiveSprint(sprintId: string): Promise<void> {
  const db = getDb();

  const [sprint] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.id, sprintId))
    .limit(1);

  if (!sprint) {
    throw new ValidationError("Sprint not found", [
      { field: "sprintId", message: "Sprint does not exist" },
    ]);
  }

  await db
    .update(sprints)
    .set({
      is_archived: false,
      updated_at: new Date().toISOString(),
    })
    .where(eq(sprints.id, sprintId));
}
```

### setActiveSprint (UPDATE)

```typescript
/**
 * Set a sprint as active (with auto-unarchive)
 *
 * @param sprintId - Sprint ID to set as active
 */
export async function setActiveSprint(sprintId: string): Promise<void> {
  const db = getDb();

  // Deactivate all sprints
  await db
    .update(sprints)
    .set({ is_active: false, updated_at: new Date().toISOString() });

  // Activate and unarchive target sprint
  await db
    .update(sprints)
    .set({
      is_active: true,
      is_archived: false, // Auto-unarchive when setting active
      updated_at: new Date().toISOString(),
    })
    .where(eq(sprints.id, sprintId));
}
```

---

## MCP Tool Schemas

### archive_sprint

```typescript
export const archiveSprintSchema = z.object({
  sprint_id: z.string().describe("The ID of the sprint to archive"),
});

export type ArchiveSprintInput = z.output<typeof archiveSprintSchema>;
```

### unarchive_sprint

```typescript
export const unarchiveSprintSchema = z.object({
  sprint_id: z.string().describe("The ID of the sprint to unarchive"),
});

export type UnarchiveSprintInput = z.output<typeof unarchiveSprintSchema>;
```

### get_sprints (UPDATE)

```typescript
export const getSprintsSchema = z.object({
  filter: z
    .enum(["active", "archived", "all"])
    .default("active")
    .describe(
      "Filter sprints by archive status: 'active' (default), 'archived', or 'all'",
    ),
});

export type GetSprintsInput = z.output<typeof getSprintsSchema>;
```

---

## Extension State

### Filter State Persistence

```typescript
/**
 * Get current sprint filter from workspace state
 */
export function getSprintFilter(
  context: vscode.ExtensionContext,
): SprintFilter {
  return context.workspaceState.get<SprintFilter>("sprintFilter", "active");
}

/**
 * Set sprint filter in workspace state
 */
export async function setSprintFilter(
  context: vscode.ExtensionContext,
  filter: SprintFilter,
): Promise<void> {
  await context.workspaceState.update("sprintFilter", filter);
}
```

---

## Validation Rules

### Archive Validation

| Rule                         | Condition                   | Error Message                                                               |
| ---------------------------- | --------------------------- | --------------------------------------------------------------------------- |
| Cannot archive active sprint | `sprint.is_active === true` | "Cannot archive the active sprint. Set a different sprint as active first." |
| Sprint must exist            | `sprint === null`           | "Sprint not found"                                                          |

### Unarchive Validation

| Rule                    | Condition                      | Error Message                                 |
| ----------------------- | ------------------------------ | --------------------------------------------- |
| Sprint must exist       | `sprint === null`              | "Sprint not found"                            |
| Sprint must be archived | `sprint.is_archived === false` | "Sprint is not archived" (warning, not error) |

---

## State Transitions

### Sprint Archive State Machine

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌──────────┐    archiveSprint()    ┌───────────┐          │
│  │  ACTIVE  │ ───────────────────── │ ARCHIVED  │          │
│  │(visible) │  (only if !is_active) │ (hidden)  │          │
│  └──────────┘                       └───────────┘          │
│       ▲                                   │                 │
│       │                                   │                 │
│       │      unarchiveSprint()            │                 │
│       └───────────────────────────────────┘                 │
│                                                             │
│       │      setActiveSprint()            │                 │
│       └───────────────────────────────────┘                 │
│            (auto-unarchives if archived)                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Indexes

| Table     | Index Name        | Columns       | Purpose                          |
| --------- | ----------------- | ------------- | -------------------------------- |
| `sprints` | `is_archived_idx` | `is_archived` | Fast filtering by archive status |

The existing indexes (`workflow_step_idx`, `is_active_idx`, `sprint_status_idx`) remain unchanged.
