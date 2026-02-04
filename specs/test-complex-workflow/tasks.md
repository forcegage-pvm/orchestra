# Task Manager Module - Task Breakdown

## Sprint Overview

**Sprint ID:** test-complex-001  
**Sprint Name:** Task Manager Complex Test Sprint  
**Total Tasks:** 9  
**Phases:** 3 (Foundation, Core Implementation, Integration)

## Initial State

**Files that EXIST (stubs to be updated):**

- `testing/task-manager/types.ts` - Has interfaces/enums, type guards throw "Not implemented"
- `testing/task-manager/errors.ts` - Has class structure, constructors need implementation

**Files that DO NOT EXIST (must be created from scratch):**

- `testing/task-manager/validator.ts`
- `testing/task-manager/repository.ts`
- `testing/task-manager/service.ts`
- `testing/task-manager/types.test.ts`
- `testing/task-manager/validator.test.ts`
- `testing/task-manager/repository.test.ts`
- `testing/task-manager/service.test.ts`

---

## Phase 1: Foundation

### T001: Implement Type Guards

**Phase:** foundation  
**Category:** INFRASTRUCTURE  
**Dependencies:** None

**Summary:** Implement the type guard functions in the existing types.ts stub

**Spec References:** F001

**File Operation:** UPDATE `testing/task-manager/types.ts`

**Verification:**

- `isValidPriority` returns true for Priority.LOW (0), MEDIUM (1), HIGH (2), CRITICAL (3)
- `isValidPriority` returns false for -1, 4, "LOW", null, undefined
- `isValidTaskStatus` returns true for all TaskStatus enum string values
- `isValidTaskStatus` returns false for "INVALID", "", null, undefined
- `isTask` returns true for objects with all required Task properties of correct types
- `isTask` returns false for null, undefined, objects missing required fields

---

### T002: Implement Error Classes

**Phase:** foundation  
**Category:** INFRASTRUCTURE  
**Dependencies:** None

**Summary:** Fix the error class implementations in the existing errors.ts stub

**Spec References:** F002

**File Operation:** UPDATE `testing/task-manager/errors.ts`

**Verification:**

- `new ValidationError("msg", "field", 123)` creates error with message="msg", field="field", value=123
- `new TaskNotFoundError("abc-123")` creates error with message="Task not found: abc-123", taskId="abc-123"
- `new DuplicateTaskError("abc-123")` creates error with message="Task already exists: abc-123", taskId="abc-123"
- All errors have correct `name` property matching class name
- All errors pass `instanceof Error` check

---

### T003: Create Type Guard Tests

**Phase:** foundation  
**Category:** INTEGRATION  
**Dependencies:** T001

**Summary:** Create test file for type guard functions from scratch

**Spec References:** TR001

**File Operation:** CREATE `testing/task-manager/types.test.ts`

**Verification:**

- File imports `isValidPriority`, `isValidTaskStatus`, `isTask` from `./types.js`
- Tests isValidPriority with valid enum values (0,1,2,3) → all return true
- Tests isValidPriority with invalid values (-1, 4, "LOW", null) → all return false
- Tests isValidTaskStatus with valid TaskStatus strings → all return true
- Tests isValidTaskStatus with invalid values ("INVALID", null) → all return false
- Tests isTask with complete valid Task object → returns true
- Tests isTask with invalid/partial objects → returns false
- Command `npx vitest run testing/task-manager/types.test.ts` passes all tests

---

## Phase 2: Core Implementation

### T004: Create Input Validator Module

**Phase:** core  
**Category:** INFRASTRUCTURE  
**Dependencies:** T001, T002

**Summary:** Create validator.ts from scratch with input validation functions

**Spec References:** F003

**File Operation:** CREATE `testing/task-manager/validator.ts`

**Verification:**

- File exports: `validateTitle`, `validateDescription`, `validateTags`, `validateDueDate`
- File exports: `validateCreateInput`, `validateUpdateInput`
- `validateTitle("  hello  ")` returns "hello" (trimmed)
- `validateTitle("")` throws ValidationError with field="title"
- `validateTitle("x".repeat(101))` throws ValidationError with field="title"
- `validateDescription("")` returns "" (allows empty)
- `validateDescription("x".repeat(1001))` throws ValidationError
- `validateTags(["  tag1  ", "tag1"])` returns ["tag1"] (trimmed, deduped)
- `validateTags(Array(11).fill("t"))` throws ValidationError with field="tags"
- `validateDueDate(null)` returns null
- `validateDueDate(pastDate)` throws ValidationError with field="dueDate"

---

### T005: Create Validator Tests

**Phase:** core  
**Category:** INTEGRATION  
**Dependencies:** T004

**Summary:** Create test file for all validation functions from scratch

**Spec References:** TR002

**File Operation:** CREATE `testing/task-manager/validator.test.ts`

**Verification:**

- Tests validateTitle: valid input, empty string error, whitespace error, >100 chars error
- Tests validateDescription: empty allowed, >1000 chars error
- Tests validateTags: empty array, trim tags, remove duplicates, max 10 error, empty tag error
- Tests validateDueDate: null returns null, future date valid, past date error
- Tests validateCreateInput applies defaults for optional fields
- Tests validateUpdateInput only validates provided fields
- Command `npx vitest run testing/task-manager/validator.test.ts` passes all tests

---

### T006: Create Task Repository

**Phase:** core  
**Category:** INFRASTRUCTURE  
**Dependencies:** T001, T002

**Summary:** Create repository.ts from scratch with in-memory TaskRepository

**Spec References:** F004

**File Operation:** CREATE `testing/task-manager/repository.ts`

**Verification:**

- File exports `TaskRepository` class and `TaskFilter` interface
- `create(task)` stores task and returns it
- `create(task)` throws DuplicateTaskError if task.id already exists
- `findById(id)` returns task or undefined
- `getById(id)` returns task or throws TaskNotFoundError
- `update(id, updates)` merges updates and returns updated task
- `update(id, updates)` throws TaskNotFoundError if not found
- `delete(id)` removes task or throws TaskNotFoundError
- `findAll({status: TaskStatus.PENDING})` returns only pending tasks
- `findAll({searchText: "hello"})` matches case-insensitive in title/description
- `count(filter)` returns correct count

---

### T007: Create Repository Tests

**Phase:** core  
**Category:** INTEGRATION  
**Dependencies:** T006

**Summary:** Create test file for TaskRepository CRUD and filtering

**Spec References:** TR003

**File Operation:** CREATE `testing/task-manager/repository.test.ts`

**Verification:**

- Tests all CRUD methods: create, findById, getById, update, delete, clear
- Tests DuplicateTaskError thrown on duplicate create
- Tests TaskNotFoundError thrown on missing getById, update, delete
- Tests filtering by single status and multiple statuses (OR logic)
- Tests filtering by priority (single and array)
- Tests filtering by tags (matches ANY tag)
- Tests filtering by dueBefore and dueAfter
- Tests searchText case-insensitive matching
- Tests combining multiple filters (AND logic)
- Command `npx vitest run testing/task-manager/repository.test.ts` passes all tests

---

## Phase 3: Integration

### T008: Create Task Service

**Phase:** integration  
**Category:** INTEGRATION  
**Dependencies:** T004, T006

**Summary:** Create service.ts from scratch with TaskService business logic

**Spec References:** F005

**File Operation:** CREATE `testing/task-manager/service.ts`

**Verification:**

- File exports `TaskService` class and `TaskStats` interface
- `create(input)` validates input, generates UUID, sets createdAt/updatedAt
- `get(id)` returns task or throws TaskNotFoundError
- `update(id, input)` validates, preserves createdAt, updates updatedAt
- `complete(id)` sets status to COMPLETED
- `complete(id)` throws ValidationError if already COMPLETED or CANCELLED
- `cancel(id)` sets status to CANCELLED
- `start(id)` sets status to IN_PROGRESS
- `getOverdue()` returns tasks with dueDate < now and status not COMPLETED/CANCELLED
- `getStats()` returns {total, byStatus: {...}, byPriority: {...}, overdue: n}

---

### T009: Create Service Tests

**Phase:** integration  
**Category:** INTEGRATION  
**Dependencies:** T008

**Summary:** Create test file for TaskService lifecycle and analytics

**Spec References:** TR004

**File Operation:** CREATE `testing/task-manager/service.test.ts`

**Verification:**

- Tests create: validates input, generates UUID, sets timestamps
- Tests get: returns task, throws on not found
- Tests update: merges changes, updates timestamp
- Tests delete: removes task
- Tests complete: changes status, error on completed/cancelled
- Tests cancel: changes status, error on completed/cancelled
- Tests start: changes status to IN_PROGRESS
- Tests getOverdue: returns only active overdue tasks
- Tests getStats: correct totals by status and priority
- Command `npx vitest run testing/task-manager/service.test.ts` passes all tests

---

## Task Dependency Graph

```
T001 (Type Guards) ──┬───────────> T003 (Type Tests)
                     │
                     ├───────────> T004 (Validator) ──> T005 (Validator Tests)
                     │                    │
T002 (Errors) ───────┤                    └──────────────────────┐
                     │                                           │
                     └───────────> T006 (Repository) ──> T007 (Repo Tests)
                                          │                      │
                                          └──────────────────────┴──> T008 (Service) ──> T009 (Service Tests)
```

## Verification Commands

```bash
# Run all tests
npx vitest run testing/task-manager/

# Run individual test files
npx vitest run testing/task-manager/types.test.ts
npx vitest run testing/task-manager/validator.test.ts
npx vitest run testing/task-manager/repository.test.ts
npx vitest run testing/task-manager/service.test.ts

# Type check
npx tsc --noEmit testing/task-manager/*.ts
```
