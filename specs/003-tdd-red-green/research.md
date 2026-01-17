# Research: TDD Red-Green Enforcement

**Feature**: 003-tdd-red-green
**Date**: 2026-01-14
**Status**: Complete

## Research Questions

### RQ-001: Existing TDD Infrastructure

**Question**: What TDD-related infrastructure already exists in the codebase?

**Findings**:

1. **`tdd_red_phase` flag on tasks** (src/db/schema.ts:89)
   - Boolean flag already exists on the `tasks` table
   - Used to mark tasks as TDD red-phase tasks

2. **Pre-signal executor** (src/core/pre-signal-executor.ts)
   - Has `tddRedPhase?: boolean` in `PreSignalConfig`
   - Default test command uses negative lookahead to exclude tdd-red tests: `--testNamePattern="^(?!.*\\[tdd-red\\])"`
   - Already handles dual-command verification (tagged tests must fail)

3. **TDD cleanup functions** (src/core/tdd-cleanup.ts)
   - `cleanupTddRedMarkers()` function exists
   - Currently called unconditionally in `prepare_task` - THIS IS THE PROBLEM
   - Handles Dart tags and TypeScript directory moves

**Decision**: Extend existing infrastructure rather than replacing. The foundation is solid; we need to add tracking/enforcement.

---

### RQ-002: Drizzle Schema Patterns

**Question**: What patterns are used for new database tables?

**Findings**:

1. **Table definition pattern**:

   ```typescript
   export const tableName = sqliteTable(
     "table_name",
     {
       id: integer("id").primaryKey({ autoIncrement: true }),
       foreign_id:
         text /
         integer()
           .notNull()
           .references(() => other.id, { onDelete: "cascade" }),
       created_at: text("created_at").notNull(),
     },
     (table) => ({
       someIdx: index("some_idx").on(table.column),
     }),
   );
   ```

2. **JSON storage**: Use `text` type with JSON serialization (e.g., `dependencies: text("dependencies").notNull()`)

3. **Enum-like values**: Use `text` type with validation at application layer

4. **Timestamps**: Use `text` with ISO 8601 format

**Decision**: Follow established drizzle patterns. Use foreign keys with cascade delete to `sprints` and `tasks` tables.

---

### RQ-003: MCP Tool Registration Pattern

**Question**: How are new MCP tools added?

**Findings**:

1. **Define tool in `TOOLS_WITH_ROLES` array** (src/mcp-server/tools.ts)
   - Includes `role: "orchestrator" | "implementor" | "shared"`
   - Full JSON Schema for `inputSchema`

2. **Create handler file** (src/mcp-server/handlers/{tool-name}.ts)
   - Export function matching pattern: `handle{ToolName}(args, context)`
   - Context includes `db`, `workspacePath`, etc.

3. **Register in tool dispatcher** (src/mcp-server/tools.ts switch statement)

**Decision**: Follow exact pattern for `register_tdd_red_test` tool with `role: "implementor"`.

---

### RQ-004: Test Marker Scanning Patterns

**Question**: How are tdd-red markers detected in different languages?

**Findings**:

**Dart patterns**:

- Library-level: `@Tags(['tdd-red-task-N'])` annotation before `void main()`
- Inline: `tags: ['tdd-red-task-N']` parameter in `test()` call
- Regex: `/@Tags\(\s*\[\s*['"]tdd-red-task-(\d+)['"]\s*\]\s*\)|tags:\s*\[\s*['"]tdd-red-task-(\d+)['"]\s*\]/`

**TypeScript patterns**:

- Name-based: `[tdd-red-task-N]` in test/describe description
- Regex: `/\[tdd-red-task-(\d+)\]/` in test strings

**Decision**: Create `scanForTddRedMarkers()` function that detects both patterns and returns structured results with `test_identifier` and `marker_type`.

---

### RQ-005: Pre-Signal Integration Points

**Question**: Where should TDD validation hook into the pre-signal flow?

**Findings**:

1. **Current flow** (src/mcp-server/handlers/signal-completion.ts):
   - Validate signal structure
   - Run pre-signal executor (build, test, lint)
   - Create signal record
   - Update task status

2. **Integration point**: After signal structure validation, before pre-signal executor
   - New: Check if task is `tdd_red_phase`
   - New: Run bidirectional validation (registered ↔ marked)
   - New: Verify registered tests are failing

3. **Alternative considered**: Integrate into pre-signal executor
   - Rejected: Pre-signal executor is command-focused; this is registry-focused

**Decision**: Add TDD validation as separate step in signal-completion handler, before pre-signal executor runs.

---

## Alternatives Considered

### Alternative 1: Automatic Discovery Only (Rejected)

**Approach**: Scan for tdd-red markers at red task completion, automatically register.

**Rejected because**:

- No implementor accountability
- Silent failures if scan misses tests
- Can't validate test is actually failing at registration time

### Alternative 2: File-Level Tracking (Rejected)

**Approach**: Track files containing tdd-red markers rather than individual tests.

**Rejected because**:

- Less precise: "9 of 10 tests greened but file still red"
- Harder to assign different green tasks to tests in same file
- Less actionable error messages

### Alternative 3: Orchestrator Declaration (Rejected)

**Approach**: Orchestrator declares expected tests in handover.

**Rejected because**:

- Orchestrator doesn't have full context of what implementor will create
- Mismatch between declared and actual tests requires reconciliation
- More work for orchestrator with less accuracy

## Conclusions

1. **Extend existing infrastructure**: Use `tdd_red_phase` flag, pre-signal executor patterns
2. **Add two new tables**: `tdd_task_relationships` and `tdd_red_registry`
3. **Add one new MCP tool**: `register_tdd_red_test` (implementor-only)
4. **Modify three handlers**: `signal-completion`, `complete-task`, `configure-sprint`
5. **Create two core modules**: `tdd-registry.ts` (CRUD), `tdd-validation.ts` (validation logic)

All research questions resolved. Ready for Phase 1: Design & Contracts.
