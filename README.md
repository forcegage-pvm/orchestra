# Orchestra CLI

AI Agent Task Orchestration System - Preventing "implementation theater" through structured workflows and hidden verification.

## Overview

Orchestra implements a **file-based orchestrator/implementor pattern** where:
- **Orchestrator** prepares tasks with hidden verification criteria
- **Implementor** works on tasks and signals completion
- **Verification** happens against criteria the implementor never sees

This prevents AI agents from gaming acceptance criteria while still providing clear task definitions.

## Installation

```bash
cd tools/orchestra
npm install
npm run build
npm link  # Makes 'orchestra' command available globally
```

## MCP Server Configuration

Orchestra includes an MCP (Model Context Protocol) server for AI agent integration. 

### VS Code Configuration

Add to your user or workspace MCP settings (`.vscode/mcp.json` or VS Code settings):

```json
{
  "mcpServers": {
    "orchestra": {
      "command": "node",
      "args": [
        "/path/to/orchestra/dist/mcp-server/index.js",
        "--workspace",
        "${workspaceFolder}"
      ],
      "env": {
        "ORCHESTRA_WORKSPACE": "${workspaceFolder}"
      }
    }
  }
}
```

**⚠️ CRITICAL**: The `--workspace` argument or `ORCHESTRA_WORKSPACE` environment variable **MUST** be set to the project workspace path. This ensures each project uses its own `.orchestra/db/orchestra.db` database. Without this, all projects would share a global database in the user's home directory!

### Alternative: Environment Variable

You can also set the workspace path via environment variable:

```bash
ORCHESTRA_WORKSPACE=/path/to/your/project node dist/mcp-server/index.js
```

## Quick Start

```bash
# 1. Initialize Orchestra in your project
orchestra init

# 2. Create manifest.yaml manually (see Manifest Format below)
#    Place in: .orchestra/manifest.yaml

# 3. Prepare first task
orchestra prepare --task 1

# 4. [Implementor works on task...]

# 5. Check status anytime
orchestra status

# 6. Accept completion signal
orchestra accept-signal

# 7. Run verification
orchestra verify

# 8. Complete the task
orchestra complete
```

## Commands

### `orchestra init`

Initialize Orchestra folder structure in current directory.

```bash
orchestra init [--force]
```

**Creates:**
```
.orchestra/
├── orchestra.yaml          # Configuration
├── common/
│   ├── templates/          # Handover templates
│   └── scripts/            # Shared scripts
├── orchestrator/
│   ├── .orchestrator-only/ # Private orchestrator files
│   └── results/            # Task archives
├── implementor/
│   ├── .implementor-only/  # Private implementor files
│   └── artifacts/          # Implementation artifacts
└── handover/               # Active handover folder
```

---

### `orchestra status`

Show current sprint/task status.

```bash
orchestra status [--json]
```

**Output:**
- Sprint progress bar
- Current task details
- Recent activity log

---

### `orchestra prepare`

Prepare a task for implementation.

```bash
orchestra prepare [--task <id>] [--force] [--skip-closeout] [--dry-run]
```

**Options:**
| Option | Description |
|--------|-------------|
| `--task <id>` | Specific task ID (default: next pending) |
| `--force` | Prepare even if another task is in-progress |
| `--skip-closeout` | Skip closeout check for previous task |
| `--dry-run` | Show what would be generated |
| `--format <fmt>` | Output format: yaml, markdown, or both |

**Creates:**
- `.orchestra/handover/current-task.md` - Task details for implementor
- `.orchestra/handover/completion-signal.md` - Template for implementor to fill
- `.orchestra/handover/task-context.md` - Additional context
- Updates `manifest.yaml` task status to `IMPLEMENT`
- Creates entry in `progress.yaml`

---

### `orchestra accept-signal`

Verify implementor has properly signaled completion.

```bash
orchestra accept-signal [--task <id>] [--max-age <minutes>] [--force]
```

**Checks:**
1. Pre-signal artifact exists at `.orchestra/handover/verification/pre-signal.yaml`
2. Pre-signal status is PASSED
3. Task ID matches
4. Artifact is fresh (not stale)
5. Completion signal is filled out
6. Deliverables check passed

**Pre-signal artifact format:**
```yaml
task_id: 1
timestamp: "2025-12-04T10:30:00Z"
status: "PASSED"
checks:
  typecheck:
    status: "PASSED"
  tests:
    status: "PASSED"
    count: 42
  deliverables:
    status: "PASSED"
```

---

### `orchestra verify`

Run verification checks against hidden criteria.

```bash
orchestra verify [--task <id>] [--continue-on-error] [--skip-accept]
```

**Requires:**
- Verification criteria at `.orchestra/handover/verification/task-{NNN}.yaml`

**Verification criteria format:**
```yaml
task_id: 1
task_title: "Create Widget"
checks:
  - id: F1
    type: file_exists
    description: "Main file exists"
    path: "src/widget.ts"
    severity: critical
    
  - id: P1
    type: pattern_match
    description: "Export exists"
    file: "src/widget.ts"
    pattern: "export.*Widget"
    severity: warning
    
  - id: C1
    type: command
    description: "Tests pass"
    command: "npm test"
    expected_exit_code: 0
    severity: critical
```

**Check types:**
- `file_exists` - File exists at path
- `dir_exists` - Directory exists at path
- `pattern_match` - Regex matches in file
- `command` - Command exits with expected code
- `screenshot_exists` - Screenshot file exists
- `json_valid` - JSON file is valid
- `yaml_valid` - YAML file is valid
- `export_exists` - TypeScript export exists

**Saves reports to:**
- `.orchestra/reports/verification/task-{id}-{timestamp}.json` (audit trail)
- `.orchestra/orchestrator/results/task-{id}-verification.yaml` (for complete)

---

### `orchestra complete`

Complete a task after verification passes.

```bash
orchestra complete [--task <id>] [--commit] [--push] [--force]
```

**Options:**
| Option | Description |
|--------|-------------|
| `--task <id>` | Task ID to complete |
| `--commit` | Commit changes to git |
| `--push` | Push after commit |
| `--force` | Complete without verification check |

**Actions:**
1. Validates verification passed
2. Creates archive in `.orchestra/orchestrator/results/task-{NNN}/`
3. Updates `progress.yaml` with COMPLETE entry
4. Updates `manifest.yaml` status to COMPLETE
5. Clears handover folder
6. Optionally commits and pushes

---

### `orchestra closeout`

Check that previous task is properly closed out before preparing next.

```bash
orchestra closeout [--fix] [--task <id>]
```

**Checks:**
- No uncommitted changes
- Previous task completed
- Handover folder clean

---

## File Locations

### Manifest
`.orchestra/manifest.yaml` - Sprint and task definitions

```yaml
version: "1.0.0"

sprint:
  id: "sprint-001"
  name: "My Sprint"
  status: "ACTIVE"
  created_at: "2025-12-04T00:00:00Z"

tasks:
  - id: 1
    title: "Create Widget"
    description: "Implement the widget component"
    status: "PENDING"  # PENDING | IMPLEMENT | COMPLETE
    category: "FEATURE"
    
  - id: 2
    title: "Add Tests"
    description: "Write unit tests"
    status: "PENDING"
    dependencies: [1]  # Must complete task 1 first
```

### Progress
`.orchestra/progress.yaml` - Task progress log

```yaml
sprint_id: "sprint-001"
updated_at: "2025-12-04T10:30:00Z"
entries:
  - task_id: 1
    status: "PREPARE"
    timestamp: "2025-12-04T10:00:00Z"
    notes: "Task 1 prepared for implementation"
  - task_id: 1
    status: "COMPLETE"
    timestamp: "2025-12-04T10:30:00Z"
```

### Handover Files
| File | Purpose |
|------|---------|
| `.orchestra/handover/current-task.md` | Task details for implementor |
| `.orchestra/handover/completion-signal.md` | Implementor fills this when done |
| `.orchestra/handover/task-context.md` | Additional context |
| `.orchestra/handover/verification/pre-signal.yaml` | Pre-signal check result |
| `.orchestra/handover/verification/task-{NNN}.yaml` | Verification criteria (hidden) |

### Results
| File | Purpose |
|------|---------|
| `.orchestra/orchestrator/results/task-{NNN}/` | Task archive |
| `.orchestra/orchestrator/results/task-{NNN}-verification.yaml` | Verification result |
| `.orchestra/reports/verification/task-{id}-{timestamp}.json` | Audit trail |

---

## Workflow

### Full Task Cycle

```
┌─────────────────┐
│ 1. PREPARE      │  Orchestrator: orchestra prepare --task N
│                 │  Creates handover files, updates manifest
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. IMPLEMENT    │  Implementor: Works on task
│                 │  Runs pre-signal-check.ps1 when done
│                 │  Fills out completion-signal.md
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. ACCEPT       │  Orchestrator: orchestra accept-signal
│                 │  Verifies pre-signal artifact exists
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. VERIFY       │  Orchestrator: orchestra verify
│                 │  Runs hidden verification checks
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. COMPLETE     │  Orchestrator: orchestra complete --commit
│                 │  Archives task, clears handover
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 6. CLOSEOUT     │  Orchestrator: orchestra closeout
│                 │  (Or use: orchestra prepare for next)
└─────────────────┘
```

---

## Implementor Scripts

The implementor should run these before signaling completion:

```powershell
# Run pre-signal checks
.\.orchestra\implementor\.implementor-only\scripts\pre-signal-check.ps1
```

This creates:
- `.orchestra/handover/verification/pre-signal.yaml` (for CLI)
- `.orchestra/implementor/artifacts/pre-signal/task-{id}-{timestamp}.yaml` (audit trail)

---

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run dev
```

## License

MIT
