# MCP Tool Contracts: Sprint Management

**Feature Branch**: `008-sprint-management`  
**Created**: 2026-01-23

## Overview

This document defines the MCP tool contracts for sprint archive management.

---

## Tool: `archive_sprint`

Archive a sprint to hide it from the default Sprint Explorer view.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "sprint_id": {
      "type": "string",
      "description": "The ID of the sprint to archive (e.g., 'sprint-001')"
    }
  },
  "required": ["sprint_id"]
}
```

### Output Schema

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the operation succeeded"
    },
    "message": {
      "type": "string",
      "description": "Human-readable result message"
    },
    "sprint": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "is_archived": { "type": "boolean" }
      }
    }
  }
}
```

### Error Conditions

| Error Code              | Condition                  | Message                                                                     |
| ----------------------- | -------------------------- | --------------------------------------------------------------------------- |
| `SPRINT_NOT_FOUND`      | Sprint ID doesn't exist    | "Sprint '{sprint_id}' not found"                                            |
| `CANNOT_ARCHIVE_ACTIVE` | Sprint is currently active | "Cannot archive the active sprint. Set a different sprint as active first." |

### Example

```json
// Request
{ "sprint_id": "sprint-007" }

// Success Response
{
  "success": true,
  "message": "Sprint 'sprint-007' has been archived",
  "sprint": {
    "id": "sprint-007",
    "name": "Legacy Feature",
    "is_archived": true
  }
}

// Error Response
{
  "success": false,
  "error": {
    "code": "CANNOT_ARCHIVE_ACTIVE",
    "message": "Cannot archive the active sprint. Set a different sprint as active first."
  }
}
```

---

## Tool: `unarchive_sprint`

Unarchive a sprint to make it visible in the default Sprint Explorer view.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "sprint_id": {
      "type": "string",
      "description": "The ID of the sprint to unarchive (e.g., 'sprint-001')"
    }
  },
  "required": ["sprint_id"]
}
```

### Output Schema

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the operation succeeded"
    },
    "message": {
      "type": "string",
      "description": "Human-readable result message"
    },
    "sprint": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "is_archived": { "type": "boolean" }
      }
    }
  }
}
```

### Error Conditions

| Error Code         | Condition               | Message                          |
| ------------------ | ----------------------- | -------------------------------- |
| `SPRINT_NOT_FOUND` | Sprint ID doesn't exist | "Sprint '{sprint_id}' not found" |

### Example

```json
// Request
{ "sprint_id": "sprint-007" }

// Success Response
{
  "success": true,
  "message": "Sprint 'sprint-007' has been unarchived",
  "sprint": {
    "id": "sprint-007",
    "name": "Legacy Feature",
    "is_archived": false
  }
}
```

---

## Tool: `get_sprints` (UPDATED)

Get all sprints with optional archive filter.

### Input Schema (Updated)

```json
{
  "type": "object",
  "properties": {
    "filter": {
      "type": "string",
      "enum": ["active", "archived", "all"],
      "default": "active",
      "description": "Filter sprints by archive status"
    }
  },
  "required": []
}
```

### Output Schema

```json
{
  "type": "object",
  "properties": {
    "sprints": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "name": { "type": "string" },
          "status": { "type": "string" },
          "workflow_step": { "type": "string" },
          "is_active": { "type": "boolean" },
          "is_archived": { "type": "boolean" },
          "created_at": { "type": "string" },
          "updated_at": { "type": "string" }
        }
      }
    },
    "filter": {
      "type": "string",
      "description": "The filter that was applied"
    },
    "count": {
      "type": "number",
      "description": "Number of sprints returned"
    }
  }
}
```

### Example

```json
// Request - show only archived
{ "filter": "archived" }

// Response
{
  "sprints": [
    {
      "id": "sprint-001",
      "name": "Initial Sprint",
      "status": "COMPLETE",
      "workflow_step": "SPRINT_COMPLETE",
      "is_active": false,
      "is_archived": true,
      "created_at": "2025-12-01T10:00:00Z",
      "updated_at": "2026-01-15T14:30:00Z"
    }
  ],
  "filter": "archived",
  "count": 1
}
```

---

## Tool: `set_active_sprint` (UPDATED)

Set a sprint as the active sprint. **Auto-unarchives if the sprint is archived.**

### Input Schema (Unchanged)

```json
{
  "type": "object",
  "properties": {
    "sprint_id": {
      "type": "string",
      "description": "The ID of the sprint to set as active"
    }
  },
  "required": ["sprint_id"]
}
```

### Output Schema (Updated)

```json
{
  "type": "object",
  "properties": {
    "success": { "type": "boolean" },
    "message": { "type": "string" },
    "sprint": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "is_active": { "type": "boolean" },
        "is_archived": { "type": "boolean" },
        "was_unarchived": {
          "type": "boolean",
          "description": "True if the sprint was automatically unarchived"
        }
      }
    }
  }
}
```

### Behavior Change

When setting an archived sprint as active:

1. The sprint is set as active
2. The sprint is automatically unarchived
3. Response includes `was_unarchived: true`

### Example

```json
// Request - setting archived sprint as active
{ "sprint_id": "sprint-007" }

// Response (sprint was archived)
{
  "success": true,
  "message": "Sprint 'sprint-007' is now active and has been unarchived",
  "sprint": {
    "id": "sprint-007",
    "name": "Legacy Feature",
    "is_active": true,
    "is_archived": false,
    "was_unarchived": true
  }
}
```

---

## Role Assignments

| Tool                | Orchestrator | Implementor | Controller |
| ------------------- | ------------ | ----------- | ---------- |
| `archive_sprint`    | ✅           | ❌          | ❌         |
| `unarchive_sprint`  | ✅           | ❌          | ❌         |
| `get_sprints`       | ✅           | ✅          | ✅         |
| `set_active_sprint` | ✅           | ❌          | ❌         |
