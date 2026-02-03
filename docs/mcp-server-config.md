# Orchestra MCP Server Configuration

This document explains how to configure and use the Orchestra MCP servers with role-based access control.

## Overview

Orchestra uses **three MCP server instances** with role-based tool filtering:

| Server           | Role         | Tools | Purpose                                        |
| ---------------- | ------------ | ----- | ---------------------------------------------- |
| `orchestra-orc`  | orchestrator | 20    | Task preparation, verification, judgment       |
| `orchestra-imp`  | implementor  | 10    | Task execution, signaling, feedback            |
| `orchestra-ctrl` | controller   | 10    | Sprint/handover review, specification auditing |

This structural separation ensures:

- Implementor cannot see verification criteria
- Implementor cannot submit judgments
- Orchestrator cannot signal completion
- Controller reviews orchestrator work for spec alignment
- Each role has only the tools they need

## Installation

### 1. Install Orchestra

```bash
npm install orchestra
# or
npm install -g orchestra
```

### 2. Configure MCP Servers

Copy the template configuration to your project:

**For VS Code with Copilot (`.vscode/mcp.json`):**

```json
{
  "servers": {
    "orchestra-orc": {
      "type": "stdio",
      "command": "node",
      "args": [
        "node_modules/orchestra/dist/mcp-server/index.js",
        "--role=orchestrator"
      ],
      "env": {
        "ORCHESTRA_WORKSPACE": "${workspaceFolder}"
      }
    },
    "orchestra-imp": {
      "type": "stdio",
      "command": "node",
      "args": [
        "node_modules/orchestra/dist/mcp-server/index.js",
        "--role=implementor"
      ],
      "env": {
        "ORCHESTRA_WORKSPACE": "${workspaceFolder}"
      }
    },
    "orchestra-ctrl": {
      "type": "stdio",
      "command": "node",
      "args": [
        "node_modules/orchestra/dist/mcp-server/index.js",
        "--role=controller"
      ],
      "env": {
        "ORCHESTRA_WORKSPACE": "${workspaceFolder}"
      }
    }
  }
}
```

**For Claude Desktop (`claude_desktop_config.json`):**

```json
{
  "mcpServers": {
    "orchestra-orc": {
      "command": "node",
      "args": [
        "/path/to/orchestra/dist/mcp-server/index.js",
        "--role=orchestrator"
      ],
      "env": {
        "ORCHESTRA_WORKSPACE": "/path/to/your/project"
      }
    },
    "orchestra-imp": {
      "command": "node",
      "args": [
        "/path/to/orchestra/dist/mcp-server/index.js",
        "--role=implementor"
      ],
      "env": {
        "ORCHESTRA_WORKSPACE": "/path/to/your/project"
      }
    },
    "orchestra-ctrl": {
      "command": "node",
      "args": [
        "/path/to/orchestra/dist/mcp-server/index.js",
        "--role=controller"
      ],
      "env": {
        "ORCHESTRA_WORKSPACE": "/path/to/your/project"
      }
    }
  }
}
```

### 3. Configure Agent Files (Optional but Recommended)

Copy the agent definition files to your project:

```
.github/agents/
├── orchestra.orchestrator.md    # Orchestrator agent instructions
├── orchestra.implementor.md     # Implementor agent instructions
└── orchestra.controller.md      # Controller agent instructions (Sprint 004)
```

These files provide role-specific instructions and tool restrictions.

## Usage

### With Custom Agents (Copilot)

```
@orchestra.orchestrator prepare the next task for implementation
@orchestra.implementor show me my current task
```

### Manual Role Switching

If not using custom agents, specify which MCP server to use:

```
Use the orchestra-orc tools to verify task 5
Use the orchestra-imp tools to signal completion
```

## Role Tool Reference

### Orchestrator (20 tools)

**Sprint Configuration:**

- `configure_sprint`, `add_task`, `update_task`, `update_verification`
- `get_task`, `get_tasks`, `remove_task`
- `resubmit_sprint`, `resubmit_handover`

**Spec Review Revisions:**

- After a Controller rejection (`SPEC_REVIEW_FAILED`), `add_task` and `update_verification` are permitted for sprint revisions.
- These tools remain blocked while the sprint is in `PENDING_SPEC_REVIEW`.

**Handover:**

- `prepare_task`, `update_handover`

**Verification:**

- `run_verification_checks`, `get_verification_results`, `submit_verification_judgment`

**Feedback & Completion:**

- `enhance_feedback`, `complete_task`

**Audit & Amendments:**

- `get_amendments`

**Shared:**

- `get_signal`, `escalate_task`, `get_progress`, `get_sprint_status`, `get_task_history`, `set_config`, `get_sprint_config`

### Implementor (10 tools)

**Task Execution:**

- `get_current_task`, `signal_completion`, `get_feedback`

**Code Review Fixes:**

- `fix_code_review`
  - `action: "GET_ISSUES"` (discover assigned issues)
  - `action: "RESOLVE_ISSUE"` with `issue_id`, `fix_summary`
  - `action: "SUBMIT_FIXES"` with `summary`, `files_changed`, `tests_run`

**Shared:**

- `get_signal`, `escalate_task`, `get_progress`, `get_sprint_status`, `get_task_history`, `get_sprint_config`

**TDD Red Phase:**

- `register_tdd_red_test`

### Controller (10 tools)

**Sprint 004 Feature:** The Controller is a specification auditor agent that reviews orchestrator work for alignment with specifications.

**Sprint Review:**

- `review_sprint_config` - Review sprint task breakdown against specification
- `approve_sprint` - Approve sprint configuration
- `reject_sprint` - Reject sprint and require revisions

**Handover Review:**

- `review_handover` - Review task handover against specification
- `approve_handover` - Approve task handover
- `reject_handover` - Reject handover and require revisions

**Utilities:**

- `get_sprint_status`, `get_task`, `get_amendments`, `get_task_history`

**Purpose:**

- Validates orchestrator task breakdowns cover all spec requirements
- Ensures handovers are faithful to specification intent
- Prevents "no-op" implementations and deferred functionality
- Creates accountability for specification adherence

**How It Works:**

1. Orchestrator calls `configure_sprint` → Sprint enters `PENDING_SPEC_REVIEW`
2. Controller reviews (separate chat) → Calls `approve_sprint` or `reject_sprint`
3. If rejected: Orchestrator uses `resubmit_sprint` after addressing issues
4. Same flow for `prepare_task` → `PENDING_HANDOVER_REVIEW` → `review_handover`

See "Specification Review Gates" in the Orchestrator agent documentation for workflow details.

## TDD Red-Green Enforcement

Orchestra includes built-in TDD enforcement that ensures all failing tests created during "red phase" tasks are eventually made to pass in corresponding "green phase" tasks. This prevents sprints from closing with incomplete functionality.

### How It Works

The TDD workflow consists of two phases:

1. **Red Phase** (Implementor): Create failing tests that define expected behavior
2. **Green Phase** (Implementor): Implement functionality to make those tests pass

The orchestrator declares the relationship between red and green tasks, and the system enforces that:

- Red phase tasks cannot be completed without a green task assignment
- Sprints cannot close until all registered tests are GREEN
- Test markers are validated against registrations at signal time

### Configuration (Orchestrator)

#### Declaring Relationships Upfront

When configuring a sprint with `configure_sprint`, include the `environment` field and `tdd_relationships` array:

```json
{
  "sprint": {
    "id": "sprint-016",
    "name": "Widget Implementation Sprint"
  },
  "environment": {
    "test_command": "npm test",
    "test_file_pattern": "test/**/*.test.ts",
    "source_base_dir": "src"
  },
  "tasks": [
    {
      "task_id": 1,
      "phase_id": "phase-1",
      "title": "Write widget tests",
      "tdd_red_phase": true,
      "...": "other task fields"
    },
    {
      "task_id": 2,
      "phase_id": "phase-1",
      "title": "Implement widget",
      "...": "other task fields"
    }
  ],
  "tdd_relationships": [{ "red_task_id": 1, "green_task_id": 2 }]
}
```

Key fields:

- **`environment`**: **REQUIRED** when any task has `tdd_red_phase: true`. Specifies test command, file patterns, and source directory. This eliminates guessing about test frameworks and ensures TDD verification checks use correct commands.
  - `test_command`: Base command to run tests (e.g., `"npm test"`, `"flutter test"`, `"pytest"`)
  - `test_file_pattern`: Glob pattern for test files (e.g., `"test/**/*.test.ts"`, `"test/**/*_test.dart"`)
  - `source_base_dir`: Base directory for source code (e.g., `"src"`, `"lib"`, `"app"`)
- **`tdd_red_phase`**: Boolean flag on tasks that marks them as red-phase tasks
- **`tdd_relationships`**: Array of `{red_task_id, green_task_id}` pairs declaring which green task will make which red task's tests pass

Benefits of upfront declaration:

- Clear intent from sprint start
- Implementor doesn't need to specify at completion time
- Better sprint planning visibility

### Implementation (Implementor)

#### Red Phase: Registering Tests

When working on a task with `tdd_red_phase: true`:

1. Write failing tests with appropriate markers (e.g., `@Tags(['tdd-red'])`, `it.skip`, or place in `test/tdd-red/` directory)
2. Register each test using `register_tdd_red_test`:

```json
{
  "task_id": 5,
  "test_identifier": "test/widget_test.dart::WidgetTests::shows loading spinner",
  "description": "Verifies spinner appears during load",
  "marker_type": "@Tags(['tdd-red'])"
}
```

3. Signal completion as normal - the system will validate that all registered tests have markers in the codebase

#### Green Phase: Making Tests Pass

When working on the corresponding green task:

1. Implement functionality to make the tests pass
2. Remove the tdd-red markers (e.g., change `it.skip` to `it`, remove `@Tags(['tdd-red'])`)
3. Verify all tests pass locally
4. Signal completion - the system will verify tests are passing and markers are removed

### Sprint Closeout Gate

The orchestrator can check TDD status via `get_sprint_status`:

```json
{
  "sprint": { "id": "sprint-016", "name": "..." },
  "phases": [...],
  "tasks_summary": {...},
  "tdd_summary": {
    "total_registered": 5,
    "by_status": {
      "GREEN": 3,
      "PENDING_GREEN": 2
    },
    "blocking_closeout": true,
    "orphaned_count": 0
  }
}
```

The sprint **cannot close** if `blocking_closeout` is `true`, which happens when any tests are not in GREEN status.

### Test Status Lifecycle

| Status          | Meaning                           | Set By                            |
| --------------- | --------------------------------- | --------------------------------- |
| `REGISTERED`    | Test registered by implementor    | `register_tdd_red_test`           |
| `VALIDATED`     | Marker found in codebase          | Pre-signal validation (red phase) |
| `PENDING_GREEN` | Red task complete, awaiting green | `signal_completion` (red phase)   |
| `GREEN`         | Test passes, markers removed      | `signal_completion` (green phase) |

### Test Identifier Format

Format: `{file_path}::{group}::{test_name}`

Examples:

- `test/widget_test.dart::WidgetTests::shows loading spinner`
- `src/features/auth/__tests__/login.test.ts::LoginForm::validates email format`

Rules:

- Use `::` as separator
- File path relative to project root
- Group = describe/group name
- Test = individual test/it name

## Security Model

The role separation is **structural, not advisory**:

1. **Tool Filtering**: Each server only exposes tools for its role
2. **Access Denied**: Attempting to call a restricted tool returns `ROLE_ACCESS_DENIED`
3. **No Discovery**: Restricted tools don't appear in `tools/list`

This prevents:

- Implementor seeing verification criteria via `get_task`
- Implementor bypassing verification via `submit_verification_judgment`
- Accidental cross-role tool usage

## Development Mode

For development/testing, use `--role=full` to access all 23 tools:

```bash
node dist/mcp-server/index.js --role=full
```

**Warning**: Full mode bypasses role separation. Use only for development.

## Troubleshooting

### "Tool not available for role"

You're calling a tool not available for your current role. Check which MCP server you're connected to.

### "No active sprint"

Initialize a sprint first using the orchestrator role:

```
configure_sprint with your sprint definition
```

### "ORCHESTRA_WORKSPACE not set"

Ensure the `ORCHESTRA_WORKSPACE` environment variable points to your project root.
