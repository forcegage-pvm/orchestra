# TD-013: Technical Debt Register in Orchestra

**Created**: 2025-12-10
**Status**: OPEN
**Priority**: Medium
**Sprint**: (future)

## Problem

Technical debt is currently tracked via markdown files in `technical-debt/` folder. This requires manual file creation and has no MCP integration.

## Proposed Solution

Add a technical debt tracking system to Orchestra:

### Database Table
```sql
CREATE TABLE technical_debt (
  id INTEGER PRIMARY KEY,
  debt_id TEXT UNIQUE,        -- e.g., "TD-013"
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL,     -- LOW | MEDIUM | HIGH | CRITICAL
  status TEXT NOT NULL,       -- OPEN | IN_PROGRESS | RESOLVED | WONT_FIX
  category TEXT,              -- ARCHITECTURE | PERFORMANCE | SECURITY | MAINTAINABILITY
  related_task_id INTEGER,    -- Optional link to originating task
  related_sprint_id TEXT,     -- Sprint where debt was identified
  resolution_sprint_id TEXT,  -- Sprint where debt was resolved
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);
```

### MCP Tools
- `add_technical_debt` - Log new debt item
- `list_technical_debt` - Query debt by status/priority
- `update_technical_debt` - Change status, add notes
- `resolve_technical_debt` - Mark as resolved with resolution notes

### Benefits
- Single source of truth in database
- Queryable via MCP tools
- Links to tasks/sprints for context
- Visible in extension dashboard

## Related Files

- `technical-debt/*.md` - Current manual tracking
- `src/db/schema.ts` - Would add new table
- `src/mcp-server/handlers/` - Would add new handlers
