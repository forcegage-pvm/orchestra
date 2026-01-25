# TD-030: Specification Traceability Gap in Code Reviews

## Summary

The Controller agent, when performing code reviews, has **no structured way to determine the actual specification** that a sprint is based on or the specific spec task list that a task is implementing. This means code reviews are being done without reference to the authoritative requirements - a fundamental gap in Orchestra's quality assurance model.

## Severity: **CRITICAL**

This undermines the entire Controller review system. Reviews are supposed to verify work against the specification, but reviewers cannot reliably locate or reference the spec.

## Discovery Context

- **Discovered**: 2026-01-25
- **Sprint**: sprint-011 (Custom Agents Phase 5: User Controls)
- **Discovered by**: Orchestrator during post-sprint analysis

## The Problem

### What the Controller SHOULD be doing:

1. Receive a task for code review
2. Look up "what spec requirement does this implement?"
3. Read the spec requirement
4. Verify the code meets the requirement
5. Submit review decision with spec evidence

### What the Controller CAN actually do:

1. Receive a task for code review
2. See `speckit_task_ref: "T052,T053,T054,T055,T057"` (opaque string)
3. **NO WAY to know which spec file these refs come from**
4. **NO WAY to automatically locate the spec document**
5. Must guess based on sprint name or search manually
6. Submit review decision without spec evidence

## Technical Analysis

### Database Schema Gaps

**`sprints` table** (src/db/schema.ts#L27-L51):

```typescript
export const sprints = sqliteTable("sprints", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  // ... other fields ...
  // ❌ NO spec_path field
  // ❌ NO spec_version field
  // ❌ NO spec_hash field for integrity
});
```

**`tasks` table**:

- Has `speckit_task_ref: text("speckit_task_ref")` - just a string, no structure
- Not validated against actual spec task IDs
- No link to the spec file containing these tasks

**`phases` table**:

- Has `speckit_tasks: text("speckit_tasks")` - JSON array
- Also unvalidated, also no spec file link

### Tool Limitations

**`get_sprint_status`** - Returns sprint info but NO spec path
**`get_task_for_review`** - Returns `speckit_task_ref` but no context on where to find spec
**`read_spec_file`** - Can read files, but Controller must know the path first

### What `speckit_task_ref` looks like in practice:

```json
{
  "task_id": 3,
  "speckit_task_ref": "T052,T053,T054,T055,T057"
}
```

These IDs (`T052`, etc.) are completely opaque. The Controller has no way to:

- Know which spec file contains these task definitions
- Validate these IDs actually exist
- Look up the requirement text for each ID

## Evidence of the Gap

### Example: Sprint 011

Sprint name: "Custom Agents Phase 5: User Controls (US3)"

To review this sprint's tasks, the Controller would need to:

1. Parse the sprint name and guess it's part of `specs/002-custom-agents/`
2. Search that directory for user story files
3. Find the right file and locate task definitions
4. Hope the `T052` etc. IDs match something in the file

There's no programmatic path from sprint → spec file.

### spec_reviews Table

The `spec_reviews` table (src/db/schema.ts#L532) DOES have:

```typescript
spec_path: text("spec_path"), // Path to the specification document
```

But this is:

- Optional (`text()` not `text().notNull()`)
- Only populated AFTER a review is submitted
- Not linked to the sprint at configuration time

## Impact

### On Code Reviews

- Reviews done without spec reference
- "Implementation theater" can pass review
- No traceability from code → requirement
- Audits cannot verify spec compliance

### On Sprint Reviews

- Controller cannot verify task coverage against spec
- Orphaned tasks not detectable
- Missing requirements not detectable

### On Quality Assurance

- Orchestra's core promise is "hidden verification against spec"
- Without spec traceability, this is unenforceable
- Controller role becomes security theater

## Proposed Solution

### Phase 1: Schema Changes

Add to `sprints` table:

```typescript
spec_path: text("spec_path").notNull(), // Required: path to spec file
spec_version: text("spec_version"),      // Optional: version/hash for integrity
```

Add to `configure_sprint` input:

```typescript
spec_path: {
  type: "string",
  description: "Path to the specification document this sprint implements"
}
```

### Phase 2: Tool Enhancements

**`get_sprint_status`** should return:

```json
{
  "sprint_id": "sprint-011",
  "spec_path": "specs/002-custom-agents/us3-user-controls.md"
  // ... rest of status
}
```

**`get_task_for_review`** should return:

```json
{
  "task_id": 3,
  "speckit_task_ref": "T052,T053,T054,T055,T057",
  "spec_path": "specs/002-custom-agents/us3-user-controls.md",
  "spec_task_definitions": [
    { "id": "T052", "title": "...", "description": "..." }
    // ... extracted from spec file
  ]
}
```

### Phase 3: Validation

- `configure_sprint` validates `spec_path` exists
- `speckit_task_ref` values validated against actual spec task IDs
- Code review tools require spec evidence

## Workarounds (Current State)

Controllers can:

1. Look at sprint name for hints
2. Search `specs/` directory manually
3. Use `read_spec_file` with guessed paths
4. Reference `speckit_task_ref` without context

None of these are reliable or auditable.

## Related Files

- src/db/schema.ts - Database schema
- src/mcp-server/handlers/get-sprint-status.ts - Sprint status handler
- src/mcp-server/handlers/get-task-for-review.ts - Task review handler
- src/mcp-server/handlers/configure-sprint.ts - Sprint configuration
- src/mcp-server/handlers/read-spec-file.ts - Spec file reader
- extension/agents/orchestra.controller.agent.md - Controller agent prompt

## Migration Impact

- Existing sprints have no `spec_path` - need migration or backfill
- All `configure_sprint` calls need `spec_path` parameter
- Controller prompts need updates to use new spec info

## Priority Justification

This is CRITICAL because:

1. Controller code reviews are the last line of defense against spec drift
2. Without spec traceability, reviews are ungrounded
3. Orchestra's security model depends on spec-based verification
4. Every review done today lacks this foundation
