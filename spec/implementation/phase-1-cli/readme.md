# Phase 1: CLI Tool ⚠️ INCOMPLETE

> **Navigation**: [Implementation Index](../readme.md) | **Next**: [Phase 1.2: Technical Debt](../phase-1.2-cli/readme.md) | [Phase 2: MCP Server](../phase-2-mcp/readme.md)

---

## Status: ⚠️ Incomplete (Missing Failure-Path Commands)

**Core functionality complete** (2025-12-04): 7 commands, 346 tests, reusable `src/core/`

**Missing per Bible v0.7.0**:
- `orchestra feedback` - Generate feedback after verification failure
- `orchestra escalate` - Escalate to human supervisor

See **[Phase 1.2: CLI Technical Debt](../phase-1.2-cli/readme.md)** for completion plan.

---

## Deliverables (Current)

- 7 CLI commands: `init`, `status`, `prepare`, `accept-signal`, `verify`, `complete`, `closeout`
- Reusable `src/core/` library (no CLI dependencies)
- Full end-to-end workflow verified
- Comprehensive README documentation

---

## Overview

The Orchestra CLI is a command-line tool that automates orchestrator operations. It replaces manual file editing, verification running, and progress tracking with scriptable commands.

**Language**: TypeScript (Node.js) - shared codebase with VS Code extension

## Goals

1. **Eliminate manual translation** - Auto-generate handover from templates
2. **Automate verification** - Run all checks with single command
3. **Track progress reliably** - Update YAML files consistently
4. **Enable scripting** - All operations are non-interactive and composable
5. **Build reusable core** - `src/core/` used by CLI, MCP, and extension

## Success Criteria

- [x] All 7 commands implemented and tested
- [x] Works on Windows (PowerShell) and Unix (bash)
- [x] Exit codes for scripting (0=success, 1=failure)
- [x] Structured output (JSON option for parsing)
- [x] Idempotent operations (safe to retry)
- [x] `src/core/` has no CLI dependencies (reusable)

## Commands

The CLI commands map directly to the **two orchestrator processes** defined in `.orchestra/orchestrator/processes/`:

### Process 1: Handover Creation (Preparing Next Task)

| Command | Purpose | Document |
|---------|---------|----------|
| `orchestra closeout` | **NEW** Verify previous task fully closed | [closeout.md](commands/closeout.md) |
| `orchestra prepare` | Prepare task handover | [prepare.md](commands/prepare.md) |

### Process 2: Task Verification (Verifying Completion)

| Command | Purpose | Document |
|---------|---------|----------|
| `orchestra accept-signal` | **NEW** Verify implementor ran pre-signal check | [accept-signal.md](commands/accept-signal.md) |
| `orchestra verify` | Run verification checks | [verify.md](commands/verify.md) |
| `orchestra complete` | Complete task + post-verification closeout | [complete.md](commands/complete.md) |

### Supporting Commands

| Command | Purpose | Document |
|---------|---------|----------|
| `orchestra init` | Initialize sprint from spec | [init.md](commands/init.md) |
| `orchestra status` | Show current state | [status.md](commands/status.md) |

### Command Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROCESS 1: Handover Creation                 │
│                                                                 │
│   orchestra closeout  ──►  orchestra prepare                    │
│   (verify previous)       (generate handover)                   │
│                                                                 │
│   → Implementor works...                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PROCESS 2: Task Verification                 │
│                                                                 │
│   orchestra accept-signal ──► orchestra verify ──► orchestra    │
│   (check pre-signal)          (run checks)         complete     │
│                                                    (closeout)   │
│                                                                 │
│   If PASS → Loop to Process 1                                   │
│   If FAIL → Return to implementor                               │
└─────────────────────────────────────────────────────────────────┘
```

## Architecture

```
tools/orchestra/
├── package.json              # Dependencies, scripts, bin
├── tsconfig.json             # TypeScript configuration
├── README.md                 # User documentation
│
├── src/
│   ├── cli.ts                # CLI entry point (commander.js)
│   │
│   ├── commands/             # CLI command implementations
│   │   ├── init.ts           # orchestra init
│   │   ├── status.ts         # orchestra status
│   │   ├── closeout.ts       # orchestra closeout (NEW)
│   │   ├── prepare.ts        # orchestra prepare
│   │   ├── accept-signal.ts  # orchestra accept-signal (NEW)
│   │   ├── verify.ts         # orchestra verify
│   │   └── complete.ts       # orchestra complete
│   │
│   └── core/                 # REUSABLE SERVICES (no CLI deps!)
│       ├── index.ts          # Public API exports
│       ├── types.ts          # TypeScript interfaces
│       ├── config.ts         # Load .orchestra config
│       ├── manifest.ts       # Manifest operations
│       ├── progress.ts       # Progress tracking
│       ├── verification.ts   # Verification engine
│       ├── closeout.ts       # Closeout checks (NEW)
│       ├── signal.ts         # Signal validation (NEW)
│       ├── templates.ts      # Template rendering
│       ├── git.ts            # Git operations
│       └── output.ts         # Structured results
│
├── templates/                # Task type templates
│   ├── infrastructure.md.hbs
│   ├── integration.md.hbs
│   └── visual.md.hbs
│
└── tests/                    # Test suite
    ├── core/                 # Core library tests
    └── commands/             # CLI command tests
```

**Key Design**: `src/core/` has ZERO CLI dependencies. It exports pure functions and classes that can be imported by:
- CLI commands (`src/commands/`)
- MCP server (Phase 2)
- VS Code extension (Phase 3)

## Tasks

| ID | Task | Status | Document |
|----|------|--------|----------|
| 1.1 | Project setup (package.json, tsconfig, vitest) | Not Started | [tasks/1.1-project-setup.md](tasks/1.1-project-setup.md) |
| 1.2 | Core libraries (types, config, manifest, progress) | Not Started | [tasks/1.2-core-libraries.md](tasks/1.2-core-libraries.md) |
| 1.3 | `orchestra status` command | Not Started | [tasks/1.3-status-command.md](tasks/1.3-status-command.md) |
| 1.4 | `orchestra init` command | Not Started | [tasks/1.4-init-command.md](tasks/1.4-init-command.md) |
| **1.4a** | **`orchestra closeout` command (NEW)** | Not Started | [tasks/1.4a-closeout-command.md](tasks/1.4a-closeout-command.md) |
| 1.5 | `orchestra prepare` command | Not Started | [tasks/1.5-prepare-command.md](tasks/1.5-prepare-command.md) |
| **1.5a** | **`orchestra accept-signal` command (NEW)** | Not Started | [tasks/1.5a-accept-signal-command.md](tasks/1.5a-accept-signal-command.md) |
| 1.6 | `orchestra verify` command | Not Started | [tasks/1.6-verify-command.md](tasks/1.6-verify-command.md) |
| 1.7 | `orchestra complete` command | Not Started | [tasks/1.7-complete-command.md](tasks/1.7-complete-command.md) |
| 1.8 | Integration testing (E2E workflow tests) | Not Started | [tasks/1.8-integration-testing.md](tasks/1.8-integration-testing.md) |
| 1.9 | Documentation (README, guides, reference) | Not Started | [tasks/1.9-documentation.md](tasks/1.9-documentation.md) |

### Process Alignment

| Process | Steps | CLI Commands |
|---------|-------|--------------|
| **Process 1: Handover Creation** | Steps 0-12 | `closeout` → `prepare` |
| **Process 2: Task Verification** | Steps 1-7 | `accept-signal` → `verify` → `complete` |

## Dependencies

### npm Packages

```json
{
  "dependencies": {
    "commander": "^12.0.0",        // CLI framework
    "js-yaml": "^4.1.0",           // YAML parsing
    "handlebars": "^4.7.8",        // Template rendering
    "chalk": "^5.3.0",             // Colored output
    "simple-git": "^3.22.0",       // Git operations
    "zod": "^3.22.0"               // Schema validation
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "tsx": "^4.7.0",               // Run TS directly
    "vitest": "^1.2.0",            // Testing
    "@types/node": "^20.0.0"
  }
}
```

### External Requirements

- Node.js 20+
- Git (for git operations)
- Flutter (for verification checks)

## Configuration

The CLI reads configuration from `.orchestra/config.yaml`:

```yaml
# .orchestra/config.yaml
orchestra:
  version: "1.0"
  
  paths:
    manifest: "orchestrator/.orchestrator-only/manifest.yaml"
    progress: "orchestrator/.orchestrator-only/progress.yaml"
    verification: "orchestrator/.orchestrator-only/verification"
    handover: "handover"
    templates: "common/templates"
    
  verification:
    flutter_analyze: true
    flutter_test: true
    file_checks: true
    
  git:
    auto_commit: false
    commit_prefix: "orchestra"
```

## Output Formats

All commands support two output formats:

### Human-Readable (default)

```
$ orchestra status

Orchestra Status
────────────────────────────────────
Sprint: 011-multi-axis-normalization
Current Task: 16 of 16
Phase: Visual (4/4)

Task 16: Multi-axis demo verification
Status: in_progress
Attempts: 1
Started: 2025-12-01 10:30:00
```

### JSON (--json flag)

```json
$ orchestra status --json
{
  "sprint": "011-multi-axis-normalization",
  "current_task": 16,
  "total_tasks": 16,
  "phase": { "name": "Visual", "current": 4, "total": 4 },
  "task": {
    "id": 16,
    "title": "Multi-axis demo verification",
    "status": "in_progress",
    "attempts": 1,
    "started_at": "2025-12-01T10:30:00Z"
  }
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Configuration error |
| 3 | Verification failed |
| 4 | Git error |

## Installation

```bash
# From tools/orchestra directory
npm install

# Build
npm run build

# Link globally (optional)
npm link

# Verify installation
orchestra --version

# Or run directly without global install
npx orchestra --version
# Or with tsx for development
npx tsx src/cli.ts --version
```

## Usage Examples

```bash
# Initialize sprint from spec
orchestra init --spec specs/012-feature/spec.md

# ⚠️ CRITICAL: After init, validate verification YAML paths (MANDATORY)
# This must be done ONCE per task after creating verification YAMLs
# Run from orchestrator scripts directory:
.\.orchestra\orchestrator\scripts\validate-verification-paths.ps1 -TaskId 1
.\.orchestra\orchestrator\scripts\validate-verification-paths.ps1 -TaskId 2
# ... repeat for each task ...

# Or auto-fix all detected path errors:
.\.orchestra\orchestrator\scripts\validate-verification-paths.ps1 -TaskId 1 -Fix

# Why: Prevents false verification failures from spec path errors
# See: Orchestra Bible Section 7.2 (INITIALIZATION phase, Step 2)

# Check current status
orchestra status

# ══════════════════════════════════════════════════════════════
# PROCESS 1: Handover Creation (Preparing next task)
# ══════════════════════════════════════════════════════════════

# Step 0: Verify previous task is fully closed out (MANDATORY)
orchestra closeout
# Returns exit code 0 if all checks pass

# If closeout passes, prepare next task
orchestra closeout && orchestra prepare --task 1

# Or let prepare auto-run closeout
orchestra prepare --task 1  # Runs closeout first by default

# ══════════════════════════════════════════════════════════════
# PROCESS 2: Task Verification (After implementor signals done)
# ══════════════════════════════════════════════════════════════

# Step 1: Verify implementor actually ran pre-signal check (MANDATORY)
orchestra accept-signal
# Returns exit code 0 if pre-signal artifact exists and passed

# If accepted, run verification
orchestra accept-signal && orchestra verify

# If verification passes, complete the task
orchestra verify && orchestra complete --message "feat: add YAxisConfig"

# Or run the full verification pipeline
orchestra accept-signal && orchestra verify && orchestra complete

# ══════════════════════════════════════════════════════════════
# FULL WORKFLOW (scripted)
# ══════════════════════════════════════════════════════════════

orchestra init --spec specs/012/spec.md
for task in $(seq 1 16); do
    # Process 1: Prepare
    orchestra closeout && orchestra prepare --task $task
    
    # ... implementor does work and signals completion ...
    
    # Process 2: Verify and Complete
    orchestra accept-signal && orchestra verify && orchestra complete
done
```

## Core Library API

The `src/core/` module exports a clean API for reuse:

```typescript
// Importable by MCP server, VS Code extension, etc.
import {
  // Types
  Manifest,
  Progress,
  Task,
  VerificationResult,
  CloseoutResult,
  SignalResult,
  
  // Services
  loadConfig,
  loadManifest,
  loadProgress,
  updateProgress,
  
  // Process 1: Handover Creation
  runCloseoutCheck,      // NEW: Verify previous task closed
  prepareHandover,
  renderTemplate,
  validateHandover,
  
  // Process 2: Task Verification
  checkAcceptSignal,     // NEW: Verify pre-signal artifact
  runVerification,
  completeTask,
  
  // Git
  commitChanges,
  getGitStatus
} from '@orchestra/core';
```

## Detailed Documentation

- [Commands](commands/) - Detailed command specifications
- [Tasks](tasks/) - Implementation task breakdown
