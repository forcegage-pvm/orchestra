# MCP Tool Contracts: TDD Red-Green Enforcement

**Feature**: 003-tdd-red-green
**Date**: 2026-01-14

## Overview

This document defines the MCP tool schemas for TDD Red-Green Enforcement:
1. **New Tool**: `register_tdd_red_test` (implementor-only)
2. **Modified Tool**: `complete_task` (extended parameters)
3. **Modified Tool**: `configure_sprint` (extended parameters)

## register_tdd_red_test

**Role**: `implementor`  
**Purpose**: Register individual test(s) created during TDD red-phase implementation

### Input Schema (Zod)

```typescript
const RegisterTddRedTestInputSchema = z.object({
  task_id: z.number()
    .describe("The red-phase task ID this test belongs to"),
  
  tests: z.array(z.object({
    test_identifier: z.string()
      .regex(/^.+::.+::.+$/)
      .describe("Unique test ID in format: {file_path}::{group}::{test_name}"),
    
    description: z.string()
      .optional()
      .describe("Optional description of what this test validates"),
  }))
    .min(1)
    .describe("Array of tests to register"),
});

type RegisterTddRedTestInput = z.output<typeof RegisterTddRedTestInputSchema>;
```

### Output Schema

```typescript
const RegisterTddRedTestOutputSchema = z.object({
  success: z.boolean(),
  registered_count: z.number(),
  tests: z.array(z.object({
    test_identifier: z.string(),
    registry_id: z.number(),
    status: z.literal("REGISTERED"),
  })),
  errors: z.array(z.object({
    test_identifier: z.string(),
    error: z.string(),
  })).optional(),
});

type RegisterTddRedTestOutput = z.output<typeof RegisterTddRedTestOutputSchema>;
```

### Example Request

```json
{
  "task_id": 5,
  "tests": [
    {
      "test_identifier": "test/widget_test.dart::WidgetTests::displays loading spinner",
      "description": "Verifies spinner shows during async operation"
    },
    {
      "test_identifier": "test/widget_test.dart::WidgetTests::hides spinner on complete"
    }
  ]
}
```

### Example Response

```json
{
  "success": true,
  "registered_count": 2,
  "tests": [
    {
      "test_identifier": "test/widget_test.dart::WidgetTests::displays loading spinner",
      "registry_id": 101,
      "status": "REGISTERED"
    },
    {
      "test_identifier": "test/widget_test.dart::WidgetTests::hides spinner on complete",
      "registry_id": 102,
      "status": "REGISTERED"
    }
  ]
}
```

### Error Cases

| Error | Description |
|-------|-------------|
| `TASK_NOT_FOUND` | Task ID does not exist |
| `NOT_TDD_RED_TASK` | Task does not have `tdd_red_phase=true` |
| `TASK_ALREADY_COMPLETE` | Cannot register tests for completed task |
| `DUPLICATE_TEST` | Test identifier already exists in this sprint |
| `INVALID_IDENTIFIER_FORMAT` | Identifier doesn't match `{file}::{group}::{test}` |

---

## complete_task (Extended)

**Role**: `orchestrator`  
**Purpose**: Complete a task with TDD-aware validation

### Extended Input Schema

```typescript
const CompleteTaskInputSchema = z.object({
  task_id: z.number()
    .describe("The task ID to complete"),
  
  // EXISTING FIELDS...
  
  // NEW: TDD fields for red-phase tasks
  green_task_id: z.number()
    .optional()
    .describe("For TDD red-phase tasks: the task ID that will green these tests. Required if not declared in sprint config."),
});
```

### Behavior Changes

#### For TDD Red-Phase Tasks (`tdd_red_phase=true`)

1. **Pre-Signal Validation** (before completion):
   - All registered tests must be validated against markers in codebase
   - Validation sets status REGISTERED → VALIDATED

2. **Green Task Assignment** (during completion):
   - If `green_task_id` provided: use it
   - Else if relationship exists in `tdd_task_relationships`: use that
   - Else: **BLOCK** with error `GREEN_TASK_REQUIRED`

3. **Status Transition**:
   - All registry entries for this task: VALIDATED → PENDING_GREEN
   - Set `green_task_id` and `assigned_at` on each entry

#### For Green Tasks (completing a task assigned as green)

1. **Verification**: Run tests, verify all pass (markers must be removed)
2. **Status Transition**: PENDING_GREEN → GREEN
3. **Timestamps**: Set `greened_at` on each entry

### New Error Cases

| Error | Description |
|-------|-------------|
| `GREEN_TASK_REQUIRED` | TDD red-phase task completed without green task assignment |
| `TESTS_NOT_VALIDATED` | Some registered tests not found in codebase markers |
| `TESTS_STILL_RED` | Green task completed but tests still failing/marked |

---

## configure_sprint (Extended)

**Role**: `orchestrator`  
**Purpose**: Configure sprint with optional TDD task relationships

### Extended Input Schema

```typescript
const ConfigureSprintInputSchema = z.object({
  // EXISTING FIELDS...
  sprint: z.object({ /* ... */ }),
  phases: z.array(/* ... */),
  tasks: z.array(/* ... */),
  
  // NEW: TDD relationships declared upfront
  tdd_relationships: z.array(z.object({
    red_task_id: z.number()
      .describe("Task ID with tdd_red_phase=true"),
    
    green_task_id: z.number()
      .describe("Task ID that will implement and green these tests"),
  }))
    .optional()
    .describe("Upfront declaration of red-to-green task mappings"),
});
```

### Example Request (Partial)

```json
{
  "sprint": { "id": "sprint-016", "name": "Sprint 016" },
  "tasks": [
    { "task_id": 1, "tdd_red_phase": true, "..." },
    { "task_id": 2, "..." },
    { "task_id": 3, "..." }
  ],
  "tdd_relationships": [
    { "red_task_id": 1, "green_task_id": 3 }
  ]
}
```

### Validation

- `red_task_id` must reference a task with `tdd_red_phase=true`
- `green_task_id` must reference a different task in the same sprint
- Duplicate relationships are rejected

---

## get_sprint_status (Extended Output)

**Role**: `orchestrator`, `implementor`  
**Purpose**: Include TDD registry summary in sprint status

### Extended Output

```typescript
const SprintStatusOutputSchema = z.object({
  // EXISTING FIELDS...
  
  // NEW: TDD summary
  tdd_summary: z.object({
    total_registered: z.number(),
    by_status: z.object({
      REGISTERED: z.number(),
      VALIDATED: z.number(),
      PENDING_GREEN: z.number(),
      GREEN: z.number(),
    }),
    blocking_closeout: z.boolean()
      .describe("True if any entries are not GREEN"),
  }).optional(),
});
```

---

## Tool Registration (tools.ts pattern)

```typescript
// src/mcp-server/tools.ts

const TOOLS_WITH_ROLES: ToolWithRole[] = [
  // ... existing tools ...
  
  // NEW TDD tool
  {
    tool: {
      name: "register_tdd_red_test",
      description: "Register test(s) created during TDD red-phase implementation",
      inputSchema: zodToJsonSchema(RegisterTddRedTestInputSchema),
    },
    role: "implementor",
  },
];
```

## Handler Location

New file: `src/mcp-server/handlers/tdd-registry.ts`

```typescript
export async function handleRegisterTddRedTest(
  input: RegisterTddRedTestInput,
  db: DrizzleDB
): Promise<RegisterTddRedTestOutput> {
  // Implementation
}
```
