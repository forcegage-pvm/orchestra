# Task Manager Module Specification

**Version:** 1.0.0  
**Purpose:** Complex test scenario for validating the full Orchestra agent workflow including TDD, multi-file dependencies, refactoring, and edge case handling.

## Overview

This specification defines a Task Manager module - a complete CRUD system for managing tasks with priorities, due dates, filtering, and validation. The implementation tests multiple agent capabilities:

- TDD red/green workflow
- Multi-file dependencies and imports
- Interface-first design
- Complex validation logic
- Error handling patterns
- Refactoring existing code

## Architecture

```
testing/task-manager/
├── types.ts           # Core interfaces and types
├── errors.ts          # Custom error classes
├── validator.ts       # Input validation logic
├── repository.ts      # In-memory task storage
├── service.ts         # Business logic layer
├── types.test.ts      # Type guard tests
├── validator.test.ts  # Validation tests
├── repository.test.ts # Repository tests
├── service.test.ts    # Service integration tests
```

---

## Feature Requirements

### F001: Core Type Definitions

**File:** `testing/task-manager/types.ts`

#### Task Interface

```typescript
interface Task {
  id: string; // UUID v4 format
  title: string; // 1-100 characters, trimmed
  description: string; // 0-1000 characters
  priority: Priority; // LOW | MEDIUM | HIGH | CRITICAL
  status: TaskStatus; // PENDING | IN_PROGRESS | COMPLETED | CANCELLED
  dueDate: Date | null; // Optional due date
  tags: string[]; // 0-10 tags, each 1-30 chars
  createdAt: Date; // Immutable creation timestamp
  updatedAt: Date; // Last modification timestamp
}
```

#### Priority Enum

```typescript
enum Priority {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  CRITICAL = 3,
}
```

#### TaskStatus Enum

```typescript
enum TaskStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}
```

#### CreateTaskInput Interface

```typescript
interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: Priority;
  dueDate?: Date | null;
  tags?: string[];
}
```

#### UpdateTaskInput Interface

```typescript
interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: Priority;
  status?: TaskStatus;
  dueDate?: Date | null;
  tags?: string[];
}
```

#### Type Guards

Export type guard functions:

- `isValidPriority(value: unknown): value is Priority`
- `isValidTaskStatus(value: unknown): value is TaskStatus`
- `isTask(value: unknown): value is Task`

---

### F002: Custom Error Classes

**File:** `testing/task-manager/errors.ts`

#### ValidationError

```typescript
class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}
```

#### TaskNotFoundError

```typescript
class TaskNotFoundError extends Error {
  constructor(public readonly taskId: string) {
    super(`Task not found: ${taskId}`);
    this.name = "TaskNotFoundError";
  }
}
```

#### DuplicateTaskError

```typescript
class DuplicateTaskError extends Error {
  constructor(public readonly taskId: string) {
    super(`Task already exists: ${taskId}`);
    this.name = "DuplicateTaskError";
  }
}
```

---

### F003: Input Validation

**File:** `testing/task-manager/validator.ts`

#### validateTitle(title: string): string

- Trims whitespace
- Throws `ValidationError` if:
  - Empty after trimming (field: "title", message: "Title is required")
  - Length > 100 (field: "title", message: "Title must be 100 characters or less")
- Returns trimmed title

#### validateDescription(description: string): string

- Allows empty string (optional field)
- Throws `ValidationError` if length > 1000 (field: "description")
- Returns original string (no trimming)

#### validateTags(tags: string[]): string[]

- Returns empty array if input is empty
- Throws `ValidationError` if:
  - More than 10 tags (field: "tags", message: "Maximum 10 tags allowed")
  - Any tag is empty after trimming (field: "tags", message: "Tags cannot be empty")
  - Any tag exceeds 30 characters (field: "tags", message: "Tags must be 30 characters or less")
- Returns array with trimmed tags, duplicates removed (case-sensitive)

#### validateDueDate(dueDate: Date | null): Date | null

- Returns null if input is null
- Throws `ValidationError` if:
  - Date is in the past (field: "dueDate", message: "Due date cannot be in the past")
  - Date is invalid (field: "dueDate", message: "Invalid date")
- Returns the Date object unchanged

#### validateCreateInput(input: CreateTaskInput): ValidatedCreateInput

- Validates all fields using individual validators
- Applies defaults:
  - `description`: `""` if undefined
  - `priority`: `Priority.MEDIUM` if undefined
  - `dueDate`: `null` if undefined
  - `tags`: `[]` if undefined
- Returns fully validated input with all fields guaranteed

#### validateUpdateInput(input: UpdateTaskInput): ValidatedUpdateInput

- Only validates fields that are present (not undefined)
- Returns object with only the validated fields that were provided

---

### F004: Task Repository

**File:** `testing/task-manager/repository.ts`

In-memory storage with Map<string, Task>.

#### TaskRepository class

```typescript
class TaskRepository {
  private tasks: Map<string, Task>;

  constructor();

  // Create new task - throws DuplicateTaskError if id exists
  create(task: Task): Task;

  // Find by ID - returns undefined if not found
  findById(id: string): Task | undefined;

  // Find by ID - throws TaskNotFoundError if not found
  getById(id: string): Task;

  // Update existing task - throws TaskNotFoundError if not found
  update(id: string, updates: Partial<Task>): Task;

  // Delete task - throws TaskNotFoundError if not found
  delete(id: string): void;

  // Find all tasks matching filter criteria
  findAll(filter?: TaskFilter): Task[];

  // Count tasks matching filter criteria
  count(filter?: TaskFilter): number;

  // Clear all tasks (for testing)
  clear(): void;
}
```

#### TaskFilter Interface

```typescript
interface TaskFilter {
  status?: TaskStatus | TaskStatus[];
  priority?: Priority | Priority[];
  tags?: string[]; // Match ANY of the provided tags
  dueBefore?: Date; // Tasks due before this date
  dueAfter?: Date; // Tasks due after this date
  searchText?: string; // Search in title and description (case-insensitive)
}
```

#### Filter Behavior

- Multiple filter criteria are combined with AND logic
- `status` and `priority` arrays use OR logic within the field
- `tags` filter matches if task has ANY of the specified tags
- `searchText` matches if title OR description contains the text (case-insensitive)
- Tasks with null dueDate are excluded from dueBefore/dueAfter filters

---

### F005: Task Service

**File:** `testing/task-manager/service.ts`

Business logic layer that coordinates validation and repository.

#### TaskService class

```typescript
class TaskService {
  constructor(private repository: TaskRepository);

  // Create a new task with auto-generated ID and timestamps
  create(input: CreateTaskInput): Task;

  // Get task by ID
  get(id: string): Task;

  // Update existing task
  update(id: string, input: UpdateTaskInput): Task;

  // Delete task
  delete(id: string): void;

  // List tasks with optional filtering
  list(filter?: TaskFilter): Task[];

  // Mark task as completed
  complete(id: string): Task;

  // Mark task as cancelled
  cancel(id: string): Task;

  // Transition task to in-progress
  start(id: string): Task;

  // Get overdue tasks (dueDate < now AND status not COMPLETED/CANCELLED)
  getOverdue(): Task[];

  // Get task statistics
  getStats(): TaskStats;
}
```

#### TaskStats Interface

```typescript
interface TaskStats {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<Priority, number>;
  overdue: number;
}
```

#### Service Behavior

- `create`: Uses crypto.randomUUID() for id, sets createdAt/updatedAt to now
- `update`: Sets updatedAt to now, preserves createdAt
- Status transitions:
  - PENDING → IN_PROGRESS, COMPLETED, CANCELLED
  - IN_PROGRESS → COMPLETED, CANCELLED, PENDING
  - COMPLETED → No transitions allowed (throw ValidationError)
  - CANCELLED → No transitions allowed (throw ValidationError)

---

## Test Requirements

### TR001: Type Guard Tests

**File:** `testing/task-manager/types.test.ts`

Test cases for `isValidPriority`:

- Returns true for all Priority enum values (0, 1, 2, 3)
- Returns false for negative numbers
- Returns false for numbers > 3
- Returns false for strings
- Returns false for null/undefined

Test cases for `isValidTaskStatus`:

- Returns true for all TaskStatus values
- Returns false for invalid strings
- Returns false for null/undefined

Test cases for `isTask`:

- Returns true for valid Task object
- Returns false for objects missing required fields
- Returns false for objects with invalid field types

---

### TR002: Validator Tests

**File:** `testing/task-manager/validator.test.ts`

Test `validateTitle`:

- Trims and returns valid title
- Throws for empty string
- Throws for whitespace-only string
- Throws for title > 100 chars
- Accepts exactly 100 chars

Test `validateDescription`:

- Returns empty string unchanged
- Returns valid description unchanged
- Throws for description > 1000 chars
- Accepts exactly 1000 chars

Test `validateTags`:

- Returns empty array for empty input
- Trims all tags
- Removes duplicates (case-sensitive)
- Throws for > 10 tags
- Throws for empty tag after trimming
- Throws for tag > 30 chars

Test `validateDueDate`:

- Returns null for null input
- Returns valid future date unchanged
- Throws for past date
- Throws for invalid date

Test `validateCreateInput`:

- Returns fully validated input with defaults
- Validates all fields together

Test `validateUpdateInput`:

- Only includes provided fields
- Validates only provided fields

---

### TR003: Repository Tests

**File:** `testing/task-manager/repository.test.ts`

Test CRUD operations:

- create: Stores and returns task
- create: Throws DuplicateTaskError for duplicate id
- findById: Returns task if found
- findById: Returns undefined if not found
- getById: Returns task if found
- getById: Throws TaskNotFoundError if not found
- update: Updates and returns task
- update: Throws TaskNotFoundError if not found
- delete: Removes task
- delete: Throws TaskNotFoundError if not found
- clear: Removes all tasks

Test filtering:

- findAll: Returns all tasks with no filter
- findAll: Filters by single status
- findAll: Filters by multiple statuses
- findAll: Filters by single priority
- findAll: Filters by multiple priorities
- findAll: Filters by tags (OR logic)
- findAll: Filters by dueBefore
- findAll: Filters by dueAfter
- findAll: Filters by searchText (case-insensitive)
- findAll: Combines multiple filters with AND logic
- count: Returns correct count for filter

---

### TR004: Service Tests

**File:** `testing/task-manager/service.test.ts`

Test task lifecycle:

- create: Creates task with auto-generated id
- create: Validates input before creating
- get: Returns existing task
- get: Throws for non-existent task
- update: Updates existing task
- update: Validates input before updating
- update: Sets updatedAt timestamp
- delete: Removes task
- list: Returns filtered tasks

Test status transitions:

- complete: Marks task as completed
- complete: Throws for already completed task
- complete: Throws for cancelled task
- cancel: Marks task as cancelled
- cancel: Throws for completed task
- cancel: Throws for already cancelled task
- start: Marks task as in-progress
- start: Throws for completed task
- start: Throws for cancelled task

Test analytics:

- getOverdue: Returns tasks past due date
- getOverdue: Excludes completed/cancelled tasks
- getStats: Returns correct statistics

---

## Technical Constraints

- Must use TypeScript with strict mode
- Must work with Vitest test runner
- Module should be self-contained (no external dependencies except uuid)
- All exports must use named exports (no default exports)
- Use `crypto.randomUUID()` for ID generation (Node.js built-in)
- Date comparisons should use start of day for past date validation

## Acceptance Criteria

1. All files exist with correct exports
2. All 4 test files pass (100% test success)
3. Type guards correctly validate types
4. Validation throws appropriate errors with correct field names
5. Repository correctly implements filtering logic
6. Service correctly enforces status transitions
7. No TypeScript compilation errors
8. Code follows project ESLint rules
