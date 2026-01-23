# Sprint Management - Data Model

**Spec**: 008-sprint-management  
**Created**: 2026-01-23

## Database Schema Changes

### Migration: Add Sprint Archive Column

```sql
-- Migration: 20260123_001_add_sprint_archive
-- Description: Add is_archived column to sprints table for archive functionality

ALTER TABLE sprints ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS is_archived_idx ON sprints(is_archived);
```

### Updated Sprints Table Schema

```typescript
// src/db/schema.ts - Updated sprints table
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
    is_archived: integer("is_archived", { mode: "boolean" }) // NEW
      .notNull()
      .default(false),
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

---

## Query Changes

### getAllSprints with Filter Support

```typescript
// src/db/queries.ts - Updated getAllSprints

export type SprintFilter = "active" | "archived" | "all";

export interface GetSprintsOptions {
  filter?: SprintFilter;
}

export function getAllSprints(
  workspacePath: string,
  options: GetSprintsOptions = {},
): Sprint[] {
  const db = getDb(workspacePath);
  const { filter = "active" } = options;

  let query = db.select().from(sprints);

  switch (filter) {
    case "active":
      query = query.where(eq(sprints.is_archived, false));
      break;
    case "archived":
      query = query.where(eq(sprints.is_archived, true));
      break;
    case "all":
      // No filter - return all sprints
      break;
  }

  return query.orderBy(desc(sprints.created_at)).all();
}
```

### Archive/Unarchive Functions

```typescript
// src/db/queries.ts - New archive functions

export function archiveSprint(workspacePath: string, sprintId: string): void {
  const db = getDb(workspacePath);

  // Check if sprint is active
  const sprint = db
    .select()
    .from(sprints)
    .where(eq(sprints.id, sprintId))
    .get();
  if (!sprint) {
    throw new Error(`Sprint not found: ${sprintId}`);
  }
  if (sprint.is_active) {
    throw new Error(
      "Cannot archive the active sprint. Set a different sprint as active first.",
    );
  }

  db.update(sprints)
    .set({
      is_archived: true,
      updated_at: new Date().toISOString(),
    })
    .where(eq(sprints.id, sprintId))
    .run();
}

export function unarchiveSprint(workspacePath: string, sprintId: string): void {
  const db = getDb(workspacePath);

  db.update(sprints)
    .set({
      is_archived: false,
      updated_at: new Date().toISOString(),
    })
    .where(eq(sprints.id, sprintId))
    .run();
}
```

---

## Extension State

### Filter Persistence

```typescript
// Filter state stored in extension globalState
interface OrchestraGlobalState {
  "orchestra.sprintFilter": SprintFilter; // 'active' | 'archived' | 'all'
}

// Usage in SprintTreeProvider
const savedFilter = context.globalState.get<SprintFilter>(
  "orchestra.sprintFilter",
  "active",
);
```

---

## Signal File Format

### Enhanced Signal File Content

```typescript
// Current format (simple timestamp)
// .orchestra/.signal content: "1706012345678"

// Enhanced format with sequence
interface SignalContent {
  sequence: number; // Monotonically increasing
  timestamp: number; // Unix timestamp ms
  operation: string; // Optional: what triggered the signal
}

// .orchestra/.signal content (JSON):
// {"sequence":42,"timestamp":1706012345678,"operation":"task_status_update"}
```

### Backward-Compatible Signal Parsing (DD-005)

```typescript
// Extension must handle both old and new formats
private parseSignalContent(content: string): SignalContent {
  try {
    // Try JSON format first (new format)
    const parsed = JSON.parse(content);
    return {
      sequence: parsed.sequence ?? 0,
      timestamp: parsed.timestamp ?? Date.now(),
      operation: parsed.operation ?? 'unknown'
    };
  } catch {
    // Fallback: old format is just a timestamp string
    return {
      sequence: 0,  // No sequence tracking in old format
      timestamp: parseInt(content, 10) || Date.now(),
      operation: 'legacy'
    };
  }
}
```

---

## MCP Tool Schemas

### archive_sprint Tool

```typescript
{
  name: "archive_sprint",
  description: "Archive a sprint to hide it from the default Sprint Explorer view. Cannot archive the active sprint.",
  parameters: {
    type: "object",
    properties: {
      sprint_id: {
        type: "string",
        description: "The ID of the sprint to archive"
      }
    },
    required: ["sprint_id"]
  },
  role: "orchestrator"
}
```

### unarchive_sprint Tool

```typescript
{
  name: "unarchive_sprint",
  description: "Unarchive a previously archived sprint to make it visible in the default Sprint Explorer view.",
  parameters: {
    type: "object",
    properties: {
      sprint_id: {
        type: "string",
        description: "The ID of the sprint to unarchive"
      }
    },
    required: ["sprint_id"]
  },
  role: "orchestrator"
}
```

---

## UI Component Interfaces

### SprintTreeProvider Filter Interface

```typescript
interface SprintTreeProviderConfig {
  filter: SprintFilter;
  showArchivedIndicator: boolean;
}

// Single command for filter selection (opens Quick Pick)
// orchestra.selectSprintFilter - Opens dropdown with Active/Archived/All options
```

### Current Task Card Refresh Command

```typescript
// Command: orchestra.refreshCurrentTask
// No parameters - refreshes the current task view from database

// Implementation in CurrentTaskViewProvider
public forceRefresh(): void {
  // Clear any cached state
  this._cachedTask = undefined;

  // Reload from database
  this._refresh();
}
```

### Set Active Sprint with Auto-Unarchive

```typescript
// When setting an archived sprint as active, auto-unarchive it (DD-002)
export function setActiveSprint(workspacePath: string, sprintId: string): void {
  const db = getDb(workspacePath);

  // Deactivate current active sprint
  db.update(sprints)
    .set({ is_active: false, updated_at: new Date().toISOString() })
    .where(eq(sprints.is_active, true))
    .run();

  // Activate new sprint AND unarchive if needed
  db.update(sprints)
    .set({
      is_active: true,
      is_archived: false, // Auto-unarchive when setting active
      updated_at: new Date().toISOString(),
    })
    .where(eq(sprints.id, sprintId))
    .run();
}
```

---

## Type Definitions

```typescript
// types/sprint.ts

export type SprintStatus =
  | "PENDING_SPEC_REVIEW"
  | "ACTIVE"
  | "SPEC_REVIEW_FAILED"
  | "COMPLETE"
  | "CLOSED";

export type SprintFilter = "active" | "archived" | "all";

export interface Sprint {
  id: string;
  name: string;
  status: SprintStatus;
  workflow_step: string;
  config: string | null;
  is_active: boolean;
  is_archived: boolean; // NEW
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface SprintQueryOptions {
  filter?: SprintFilter;
  includeArchived?: boolean; // Deprecated, use filter instead
}
```
