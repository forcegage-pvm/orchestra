# Data Model: TDD Red-Green Enforcement

**Feature**: 003-tdd-red-green
**Date**: 2026-01-14

## Entity Overview

```
┌─────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────┐
│      sprints        │     │   tdd_task_relationships │     │   tdd_red_registry  │
├─────────────────────┤     ├─────────────────────────┤     ├─────────────────────┤
│ id (PK)             │◄────│ sprint_id (FK)          │     │ id (PK)             │
│ name                │     │ red_task_id (FK)        │─────│ sprint_id (FK)      │
│ ...                 │     │ green_task_id (FK)      │─────│ red_task_id (FK)    │
└─────────────────────┘     │ declared_at             │     │ green_task_id (FK)  │
        ▲                   │ created_at              │     │ test_identifier     │
        │                   └─────────────────────────┘     │ marker_type         │
        │                                                    │ status              │
┌───────┴─────────────┐                                     │ created_at          │
│       tasks         │◄────────────────────────────────────│ validated_at        │
├─────────────────────┤                                     │ assigned_at         │
│ id (PK)             │                                     │ greened_at          │
│ sprint_id (FK)      │                                     └─────────────────────┘
│ tdd_red_phase       │
│ ...                 │
└─────────────────────┘
```

## Table Definitions

### tdd_task_relationships

Links red tasks to their corresponding green tasks. Declared upfront at sprint configuration OR at red task completion.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | INTEGER | NO | autoincrement | Primary key |
| sprint_id | TEXT | NO | - | FK to sprints.id |
| red_task_id | INTEGER | NO | - | FK to tasks.id (the TDD red-phase task) |
| green_task_id | INTEGER | NO | - | FK to tasks.id (the task that will green these tests) |
| declared_at | TEXT | NO | - | 'configure_sprint' \| 'complete_task' |
| created_at | TEXT | NO | - | ISO 8601 timestamp |

**Indexes**:
- `tdd_rel_sprint_idx` on (sprint_id)
- `tdd_rel_red_task_idx` on (red_task_id)

**Unique Constraints**:
- `(sprint_id, red_task_id, green_task_id)` - One relationship per red-green pair

### tdd_red_registry

Individual test entries tracking status through the red-green lifecycle. Created by implementor registration.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | INTEGER | NO | autoincrement | Primary key |
| sprint_id | TEXT | NO | - | FK to sprints.id |
| red_task_id | INTEGER | NO | - | FK to tasks.id (task that created this test) |
| test_identifier | TEXT | NO | - | Unique test ID: "{file}::{group}::{test}" |
| description | TEXT | YES | NULL | Optional description from implementor |
| marker_type | TEXT | YES | NULL | 'dart-inline-tag' \| 'dart-library-tag' \| 'ts-directory' \| 'ts-name-tag' |
| status | TEXT | NO | 'REGISTERED' | 'REGISTERED' \| 'VALIDATED' \| 'PENDING_GREEN' \| 'GREEN' |
| green_task_id | INTEGER | YES | NULL | FK to tasks.id (assigned at red task completion) |
| created_at | TEXT | NO | - | ISO 8601 timestamp (registration time) |
| validated_at | TEXT | YES | NULL | ISO 8601 timestamp (pre-signal validation passed) |
| assigned_at | TEXT | YES | NULL | ISO 8601 timestamp (green task assigned) |
| greened_at | TEXT | YES | NULL | ISO 8601 timestamp (test verified GREEN) |

**Indexes**:
- `tdd_reg_sprint_idx` on (sprint_id)
- `tdd_reg_red_task_idx` on (red_task_id)
- `tdd_reg_green_task_idx` on (green_task_id)
- `tdd_reg_status_idx` on (status)

**Unique Constraints**:
- `(sprint_id, test_identifier)` - One entry per test per sprint

## Status Lifecycle

```
┌────────────┐   pre-signal   ┌───────────┐   complete_task   ┌───────────────┐   complete_task   ┌─────────┐
│ REGISTERED │──────────────► │ VALIDATED │─────────────────► │ PENDING_GREEN │─────────────────► │  GREEN  │
│            │   validation   │           │   (red task)      │               │   (green task)    │         │
└────────────┘                └───────────┘                   └───────────────┘                   └─────────┘
     ▲                                                               │
     │                                                               │
 register_tdd_red_test                                    green_task_id assigned
 (implementor tool)                                       (from relationship or input)
```

## Drizzle Schema (TypeScript)

```typescript
// src/db/schema.ts additions

/**
 * TDD Task Relationships - Links red tasks to green tasks
 */
export const tddTaskRelationships = sqliteTable(
  "tdd_task_relationships",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sprint_id: text("sprint_id")
      .notNull()
      .references(() => sprints.id, { onDelete: "cascade" }),
    red_task_id: integer("red_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    green_task_id: integer("green_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    declared_at: text("declared_at").notNull(), // 'configure_sprint' | 'complete_task'
    created_at: text("created_at").notNull(),
  },
  (table) => ({
    sprintIdx: index("tdd_rel_sprint_idx").on(table.sprint_id),
    redTaskIdx: index("tdd_rel_red_task_idx").on(table.red_task_id),
    uniqueRel: uniqueIndex("tdd_rel_unique").on(
      table.sprint_id,
      table.red_task_id,
      table.green_task_id
    ),
  })
);

/**
 * TDD Red Registry - Individual test entries
 */
export const tddRedRegistry = sqliteTable(
  "tdd_red_registry",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sprint_id: text("sprint_id")
      .notNull()
      .references(() => sprints.id, { onDelete: "cascade" }),
    red_task_id: integer("red_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    test_identifier: text("test_identifier").notNull(),
    description: text("description"),
    marker_type: text("marker_type"),
    status: text("status").notNull().default("REGISTERED"),
    green_task_id: integer("green_task_id").references(() => tasks.id),
    created_at: text("created_at").notNull(),
    validated_at: text("validated_at"),
    assigned_at: text("assigned_at"),
    greened_at: text("greened_at"),
  },
  (table) => ({
    sprintIdx: index("tdd_reg_sprint_idx").on(table.sprint_id),
    redTaskIdx: index("tdd_reg_red_task_idx").on(table.red_task_id),
    greenTaskIdx: index("tdd_reg_green_task_idx").on(table.green_task_id),
    statusIdx: index("tdd_reg_status_idx").on(table.status),
    uniqueTest: uniqueIndex("tdd_reg_unique_test").on(
      table.sprint_id,
      table.test_identifier
    ),
  })
);
```

## Migration Script

```sql
-- Migration: 003_tdd_red_green_registry

CREATE TABLE tdd_task_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  red_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  green_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  declared_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX tdd_rel_sprint_idx ON tdd_task_relationships(sprint_id);
CREATE INDEX tdd_rel_red_task_idx ON tdd_task_relationships(red_task_id);
CREATE UNIQUE INDEX tdd_rel_unique ON tdd_task_relationships(sprint_id, red_task_id, green_task_id);

CREATE TABLE tdd_red_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  red_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  test_identifier TEXT NOT NULL,
  description TEXT,
  marker_type TEXT,
  status TEXT NOT NULL DEFAULT 'REGISTERED',
  green_task_id INTEGER REFERENCES tasks(id),
  created_at TEXT NOT NULL,
  validated_at TEXT,
  assigned_at TEXT,
  greened_at TEXT
);

CREATE INDEX tdd_reg_sprint_idx ON tdd_red_registry(sprint_id);
CREATE INDEX tdd_reg_red_task_idx ON tdd_red_registry(red_task_id);
CREATE INDEX tdd_reg_green_task_idx ON tdd_red_registry(green_task_id);
CREATE INDEX tdd_reg_status_idx ON tdd_red_registry(status);
CREATE UNIQUE INDEX tdd_reg_unique_test ON tdd_red_registry(sprint_id, test_identifier);
```

## Validation Rules

1. **Registration**: Only allowed for tasks where `tdd_red_phase=true`
2. **Test Identifier Format**: Must follow pattern `{file_path}::{group}::{test_name}`
3. **Status Transitions**: 
   - REGISTERED → VALIDATED (only via pre-signal validation)
   - VALIDATED → PENDING_GREEN (only via complete_task with green_task_id)
   - PENDING_GREEN → GREEN (only via complete_task verification)
4. **Unique Constraint**: No duplicate test_identifier within a sprint
5. **Relationship Constraint**: red_task_id must have `tdd_red_phase=true`
