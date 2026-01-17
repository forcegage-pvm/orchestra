# Research: Controller Agent

**Date**: 2026-01-17  
**Feature**: 004-controller-agent  
**Status**: Complete

---

## Research Tasks

### 1. Database Migration Pattern

**Question**: How do we add the new `spec_reviews` table?

**Finding**: Orchestra uses a migrations system defined in `src/db/migrations.ts`. 

**Pattern**:
```typescript
const MIGRATIONS: Migration[] = [
  {
    id: "YYYYMMDD_NNN_description",
    description: "Human-readable description",
    up: async () => {
      const db = getDb();
      // Check if exists (idempotent)
      // Create table with sql`` template
      // Create indexes
    },
  },
];
```

**Decision**: Create migration `20260117_007_add_spec_reviews_table` following this pattern.

**Rationale**: Consistent with existing migrations. Idempotency check ensures safe re-runs.

---

### 2. Tool Registration for Controller Role

**Question**: How do we add a new role (`controller`) for tool filtering?

**Finding**: In `src/mcp-server/tools.ts`, tools are defined with a `role` property:
- `orchestrator` - Only available to orchestrator agent
- `implementor` - Only available to implementor agent  
- `shared` - Available to both

The `ServerRole` type is: `"orchestrator" | "implementor" | "full"`

**Decision**: 
1. Extend `ServerRole` to include `"controller"`
2. Extend `ToolRole` to include `"controller"` 
3. Add new Controller tools with `role: "controller"`
4. Share read-only tools (get_sprint_status, get_task, etc.) as `role: "shared"`

**Rationale**: Minimal change to existing pattern. Controller gets dedicated tools plus shared read-only tools.

**Alternative Considered**: Create entirely separate tool namespace (`orchestra-ctrl/*`). Rejected because it would require significant refactoring of MCP server initialization.

---

### 3. VS Code Chat API for Agent Model Selection

**Question**: How do we specify Claude Opus 4.5 for the Controller agent?

**Finding**: In `extension/src/chat/SessionManager.ts`, model selection uses:
```typescript
await vscode.commands.executeCommand("workbench.action.chat.open", {
  query: prompt,
  isPartialQuery: false,
  mode: agentMode,
  modelSelector: { id: model },  // ← Model selection here
  attachFiles: files,
});
```

The model ID is retrieved from configuration:
```typescript
const model = this._configService.getModelForRole("implementor");
```

**Decision**: 
1. Add `"controller"` role to ConfigService
2. Set default model to `"claude-opus-4-5"` for controller role
3. Create `invokeController()` method in SessionManager following the `invokeImplementor()` pattern

**Rationale**: Follows existing architecture. Model selection is configurable per role.

---

### 4. Amendment Logging Pattern

**Question**: How do we log handover amendments when handover is updated after rejection?

**Finding**: In `src/mcp-server/handlers/update-verification.ts`, amendments are recorded:

```typescript
if (isAmendment) {
  // Capture BEFORE state
  const existingChecks = await db.select()...
  
  // After modification, create amendment record
  const [insertedAmendment] = await db.insert(amendments).values({
    sprint_id: sprint.id,
    task_id: task.id,
    tool_name: "update_verification",
    amendment_type: "VERIFICATION",
    workflow_step_at_amendment: sprint.workflow_step,
    rationale: input.rationale || "Verification updated",
    before_state: JSON.stringify(beforeState),
    after_state: JSON.stringify(afterState),
    changed_fields: JSON.stringify(changedFields),
    amended_by: "orchestrator",
    amended_at: now,
  }).returning();
}
```

**Decision**: Apply the same pattern to `update-handover.ts`:
1. Check if in amendment-worthy state (not CONFIGURE)
2. Capture before state before modification
3. Insert amendment record after modification
4. Use `amendment_type: "HANDOVER"`

**Rationale**: Consistent with existing amendment tracking. Enables audit trail for handover revisions after Controller rejection.

---

### 5. Sprint Status Field Location

**Question**: Where is sprint status stored and how do we extend it?

**Finding**: 
- **Database**: `sprints` table has no explicit `status` column - status is derived from `workflow_step`
- **Technical Spec**: Proposes adding explicit `status` field with values: `PENDING_SPEC_REVIEW`, `ACTIVE`, `SPEC_REVIEW_FAILED`, `COMPLETE`, `CLOSED`

**Decision**: Add `status` column to `sprints` table via migration:
```sql
ALTER TABLE sprints ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
```

Create Zod schema:
```typescript
export const SprintStatusSchema = z.enum([
  "PENDING_SPEC_REVIEW",
  "ACTIVE",
  "SPEC_REVIEW_FAILED",
  "COMPLETE",
  "CLOSED",
]);
```

**Rationale**: Separates "what phase of work" (workflow_step) from "is this blocked" (status). Cleaner state management for review gates.

---

## Summary of Decisions

| Area | Decision | Key Files |
|------|----------|-----------|
| Migration | Add migration `20260117_007` | `src/db/migrations.ts` |
| Tool Roles | Extend ServerRole to include `controller` | `src/mcp-server/tools.ts` |
| Model Selection | Add controller to ConfigService with Opus 4.5 | `extension/src/config/ConfigService.ts` |
| Amendment Logging | Copy pattern from update-verification.ts | `src/mcp-server/handlers/update-handover.ts` |
| Sprint Status | Add `status` column to sprints table | `src/db/schema.ts`, `src/db/migrations.ts` |

---

## Outstanding Questions (for Phase 1)

1. **Escalation limit tracking**: Where should the 3-rejection counter be stored? Options:
   - In `spec_reviews` table (count via query)
   - Separate column on sprint/task tables
   - **Recommendation**: Query-based count from `spec_reviews` table

2. **Human supervisor bypass**: Not in scope for this feature, but the status/workflow separation will make it easy to add later (supervisor can force status to ACTIVE).
