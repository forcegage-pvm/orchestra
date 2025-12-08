# Process 1: Handover Creation

> **Your Role**: Orchestrator Agent  
> **Your Mission**: Create a handover so complete that ANY agent can execute it perfectly  
> **Success Metric**: Zero clarification questions from the implementor

---

## 🎯 The Golden Rule

> **"If the implementor has to guess, the handover has failed."**

Every path must be explicit. Every expectation must be written. Every edge case must be addressed.

---

## Quick Reference

| Step | Action | Command | Output |
|------|--------|---------|--------|
| 0 | Check current state | `orchestra status` | Know where you are |
| 1 | Verify previous task closed | `orchestra closeout` | Clean slate |
| 2 | Generate handover files | `orchestra prepare --task N` | Scaffolded handover |
| 3 | Complete handover content | Edit `current-task.md` | Filled TODO markers |
| 4 | Create verification criteria | Create `task-N.yaml` | Hidden test spec |
| 5 | Complete pre-flight checklist | Fill `preflight-checklist.yaml` | Self-validation |
| 6 | Commit changes | `git add -A && git commit` | Version control |
| 7 | Hand off | Direct to `agent_readme.md` | Implementor starts |

---

## Before You Begin

### Know Your Location

All paths in this document are relative to the `.orchestra/` folder:

```
.orchestra/                          ← Orchestra root
├── manifest.yaml                    ← Task definitions (READ THIS FIRST)
├── progress.yaml                    ← Runtime state tracking
├── handover/                        ← Where you CREATE handover files
│   ├── agent_readme.md              ← Implementor entry point
│   ├── current-task.md              ← Main handover (you fill this)
│   └── completion-signal.md         ← For implementor to signal done
└── orchestrator/
    └── .orchestrator-only/          ← HIDDEN from implementor
        ├── verification/            ← Secret acceptance tests
        │   └── task-N.yaml          ← You create this
        └── preflight/               ← Your quality checklists
            └── task-N-checklist.yaml ← You create this
```

### Prerequisites Checklist

Before starting, verify ALL of these:

| Check | How to Verify | If Not Ready |
|-------|---------------|--------------|
| Previous task complete (or first task) | `orchestra status` | Complete previous task first |
| Manifest exists | `cat .orchestra/manifest.yaml` | Run `orchestra init` |
| You know which task to prepare | Read `manifest.yaml` tasks section | Decide task ID |
| You are the **Orchestrator** | You're creating work, not doing it | Switch roles if needed |

**First task of a sprint?** Skip to Step 2 — Step 1 will auto-pass.

---

## Step-by-Step Instructions

---

### STEP 0: Orient Yourself

**Before doing anything else**, understand the current state:

```bash
orchestra status
```

This shows:
- Current sprint ID and status
- Which tasks are PENDING, IMPLEMENT, or COMPLETE
- Current workflow position
- Any blocking issues

**Read the output carefully.** It tells you exactly what to do next.

---

### STEP 1: Verify Previous Task Closed

**⛔ BLOCKING — DO NOT SKIP**

```bash
orchestra closeout
```

**What this checks:**

| Check | What It Validates | Why It Matters |
|-------|-------------------|----------------|
| C1 | No uncommitted changes | Clean git state |
| C2 | Previous task status = COMPLETE | Task lifecycle complete |
| C3 | Commit hash in progress.yaml | Traceability |
| C4 | SpecKit tasks marked done | External tracking sync |
| C5 | Completion signal cleared | No stale signals |
| C6 | Handover archived | Audit trail exists |

**Expected outcomes:**

| Scenario | What Happens | Your Action |
|----------|--------------|-------------|
| First task of sprint | All checks pass (no previous task) | Proceed to Step 2 |
| Previous task complete | All checks pass | Proceed to Step 2 |
| Checks fail | Error message with details | Fix each issue |

**If checks fail:**

```bash
# See detailed failure information
orchestra closeout --verbose

# Attempt automatic fixes for common issues
orchestra closeout --fix
```

**⛔ DO NOT PROCEED until `orchestra closeout` shows all checks passing.**

---

### STEP 2: Generate Handover Files

```bash
orchestra prepare --task N
```

Replace `N` with the task ID from `manifest.yaml`, or omit to auto-select:

```bash
# Auto-select next PENDING task (respects dependencies)
orchestra prepare

# Prepare specific task by ID
orchestra prepare --task 3

# Preview what would be generated (no changes)
orchestra prepare --task 3 --dry-run
```

**What this command does:**

| Action | Details |
|--------|---------|
| **Creates** `.orchestra/handover/current-task.md` | Main handover with TODO markers |
| **Creates** `.orchestra/handover/completion-signal.md` | Template for implementor |
| **Creates** `.orchestra/handover/task-context.md` | Background context |
| **Creates** `.orchestra/handover/preflight-checklist.yaml` | Your quality checklist |
| **Updates** `manifest.yaml` | Task status → `IMPLEMENT` |
| **Updates** `progress.yaml` | Adds PREPARE timestamp |

**Verify generation succeeded:**

```bash
ls .orchestra/handover/
```

You should see all four files listed above.

---

### STEP 3: Complete the Handover Content

**This is the most important step.** A rushed handover creates a confused implementor.

Open the main handover file:

```bash
# Open in your editor
code .orchestra/handover/current-task.md
```

#### Find and Fill ALL TODO Markers

Search for `# TODO:` — every single one must be replaced with real content.

```markdown
<!-- BEFORE (generated) -->
# TODO: Write clear objective statement

<!-- AFTER (your work) -->
Create a new CLI command `orchestra validate` that checks handover 
completeness before finalization. The command should parse current-task.md 
and verify all TODO markers are filled, all file paths exist or are marked 
as CREATE, and all test requirements have concrete examples.
```

#### Required Sections Checklist

| Section | What You MUST Include | Bad Example | Good Example |
|---------|----------------------|-------------|--------------|
| **Objective** | One clear sentence of what to achieve | "Fix the bug" | "Fix the off-by-one error in `calculateTotal()` that causes negative totals when cart has exactly 10 items" |
| **Acceptance Criteria** | Visible, testable conditions | "It should work" | "• `npm test` passes all 47 tests<br>• `calculateTotal([...10 items])` returns positive number<br>• No TypeScript errors" |
| **File Operations** | Full paths + action + purpose | "Update the utils" | "**MODIFY** `src/utils/cart.ts` → Fix line 42: change `< 10` to `<= 10`" |
| **Test Requirements** | File path + test name + sample data | "Add tests" | "**CREATE** `test/cart.test.ts`<br>Test: `handles exactly 10 items`<br>Input: `[{price: 10, qty: 1}, ...]` (10 items)<br>Expected: `100`" |

#### File Operation Format

Be explicit about every file the implementor will touch:

```markdown
## File Operations

### CREATE (new files)
| File Path | Purpose | Exports |
|-----------|---------|---------|
| `src/commands/validate.ts` | CLI command implementation | `createValidateCommand()` |
| `src/core/validate.ts` | Core validation logic | `runValidate()`, `ValidationResult` |
| `test/commands/validate.test.ts` | Command tests | — |

### MODIFY (existing files)
| File Path | Change Description |
|-----------|-------------------|
| `src/cli.ts` | Add `import { createValidateCommand }` and register with `program.addCommand()` |
| `src/core/index.ts` | Add export for validate module |

### DELETE (remove files)
| File Path | Reason |
|-----------|--------|
| `src/legacy/old-validate.ts` | Replaced by new implementation |
```

#### Test Requirements Format

Don't just name tests — provide concrete data:

```markdown
## Test Requirements

**Test file**: `test/commands/validate.test.ts`

| Test Name | Input | Expected Output |
|-----------|-------|-----------------|
| `detects missing TODO markers` | Handover with `# TODO:` on line 5 | `{ valid: false, errors: ["TODO marker at line 5"] }` |
| `passes valid handover` | Complete handover, no TODOs | `{ valid: true, errors: [] }` |
| `reports multiple errors` | 3 TODOs, 1 missing file | `{ valid: false, errors: [4 items] }` |

**Sample test object:**
```typescript
const validHandover = {
  objective: "Create validate command",
  criteria: ["Tests pass", "No TODOs"],
  files: { create: ["src/validate.ts"], modify: [] }
};
```
```

---

### STEP 4: Create Hidden Verification Criteria

**This is what makes Orchestra work.** The implementor cannot see these criteria, so they cannot game the acceptance tests.

Create the verification file:

```bash
# Create the directory if needed
mkdir -p .orchestra/orchestrator/.orchestrator-only/verification

# Create the verification file
code .orchestra/orchestrator/.orchestrator-only/verification/task-N.yaml
```

Replace `N` with the task ID.

**Verification file structure:**

```yaml
# Hidden Verification Criteria - Task N
# ⛔ NEVER show this to the implementor

task_id: N
created_at: "2025-12-06"

verification_checks:
  - id: V1
    name: "Tests pass"
    command: "npm test"
    expected_exit_code: 0
    
  - id: V2
    name: "New command exists"
    command: "orchestra validate --help"
    expected_exit_code: 0
    expected_output_contains: "validate"
    
  - id: V3
    name: "Detects incomplete handover"
    command: "orchestra validate --file test/fixtures/incomplete.md"
    expected_output_contains: "TODO marker"
    
  - id: V4
    name: "No TypeScript errors"
    command: "npm run typecheck"
    expected_exit_code: 0

# For visual tasks, add screenshot verification
visual_verification:
  enabled: false
  # screenshots:
  #   - name: "Dashboard loaded"
  #     url: "http://localhost:3000/dashboard"
  #     selector: "#main-content"
```

**⛔ CRITICAL**: This file lives in `.orchestrator-only/` which the implementor must NEVER access. This separation is the core security model of Orchestra.

---

### STEP 5: Complete Pre-Flight Checklist

Create your quality checklist in the hidden orchestrator folder:

```bash
code .orchestra/orchestrator/.orchestrator-only/preflight/task-N-checklist.yaml
```

**Complete every item honestly:**

```yaml
# Pre-Flight Checklist - Task N
# Complete ALL items before finalizing handover

checklist:
  - id: PRE-01
    item: "Closeout check passed"
    status: PASS          # PASS | FAIL | N/A
    notes: ""
    
  - id: PRE-02
    item: "All TODO markers filled in current-task.md"
    status: PASS
    notes: ""
    
  - id: PRE-03
    item: "All file paths are relative to repo root"
    status: PASS
    notes: ""
    
  - id: PRE-04
    item: "CREATE files have: path + purpose + exports"
    status: PASS
    notes: ""
    
  - id: PRE-05
    item: "MODIFY files have: path + exact changes"
    status: PASS
    notes: ""
    
  - id: PRE-06
    item: "Test requirements have concrete sample data"
    status: PASS
    notes: ""
    
  - id: PRE-07
    item: "Hidden verification criteria created"
    status: PASS
    notes: "verification/task-3.yaml"
    
  - id: PRE-08
    item: "A fresh agent could complete this without questions"
    status: PASS
    notes: ""

# Sign-off
prepared_by: "orchestrator-agent"
prepared_at: "2025-12-06T10:30:00Z"
```

**Rules:**
- Every item must be `PASS` or `N/A` (with reason)
- If ANY item is `FAIL`, go back and fix it
- Be honest — this checklist protects YOU from failed handoffs

---

### STEP 6: Commit Changes

Stage and commit all handover files:

```bash
git add -A
git commit -m "chore(orchestra): prepare task N handover

- Generated handover for task N: [brief description]
- Created verification criteria
- Completed pre-flight checklist"
```

---

### STEP 7: Hand Off to Implementor

Direct the implementor agent to the entry point:

> **"Read `.orchestra/handover/agent_readme.md` and complete your assigned task."**

**⚠️ ALWAYS point to `agent_readme.md` first**, not directly to `current-task.md`.

**Why?**
- `agent_readme.md` provides orientation and workflow context
- Ensures implementor follows the correct process
- Prevents confusion from jumping into task details without context

**What you tell the implementor:**

```
You are the IMPLEMENTOR agent.

1. Read: .orchestra/handover/agent_readme.md
2. Follow its instructions to complete your task
3. Signal completion when done

Do NOT access any files in .orchestra/orchestrator/.orchestrator-only/
```

---

## Quality Standards

### The 100% Rule

> **85% complete is NOT complete.**

If the implementor might ask:
- "Where does this file go?"
- "What should this function return?"
- "Which test framework should I use?"

...then the handover is incomplete. Go back and add specifics.

### The Fresh Agent Test

Before handing off, ask yourself:

| Question | If No... |
|----------|----------|
| Could a brand new agent complete this? | Add more context |
| Are ALL file paths explicit? | Add full paths |
| Are test inputs/outputs concrete? | Add sample data |
| Are anti-patterns documented? | Add "Don't do X" section |
| Is the objective crystal clear? | Rewrite it simpler |

### What Makes a Good Handover

| Aspect | ❌ Bad | ✅ Good |
|--------|--------|---------|
| Objective | "Implement the feature" | "Create `orchestra validate` command that checks handover completeness" |
| Files | "Update the CLI" | "MODIFY `src/cli.ts` line 45: add import and register command" |
| Tests | "Add unit tests" | "CREATE `test/validate.test.ts` with 3 tests: [table of inputs/outputs]" |
| Criteria | "It should work" | "• `npm test` passes • `--help` shows validate • No TS errors" |

---

## Common Mistakes

| Mistake | Why It Fails | How to Fix |
|---------|--------------|------------|
| Skip Step 1 (closeout) | Previous task incomplete, state corrupted | Always run `orchestra closeout` first |
| Leave TODO markers | Implementor guesses wrong | Search and fill every `# TODO:` |
| Vague file paths | Implementor creates file in wrong place | Use full paths: `src/core/validate.ts` |
| "Add tests" without data | Implementor invents wrong test cases | Provide input → output tables |
| "Create a demo" only | Implementor doesn't know where to start | Provide full code scaffold |
| Skip verification criteria | No way to objectively verify completion | Always create `task-N.yaml` |
| Point directly to current-task.md | Implementor misses workflow context | Point to `agent_readme.md` |

---

## CLI Commands Reference

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `orchestra status` | Show current state | Step 0 - orientation |
| `orchestra closeout` | Verify previous task closed | Step 1 - before starting |
| `orchestra closeout --verbose` | Detailed failure info | When closeout fails |
| `orchestra closeout --fix` | Auto-fix common issues | When closeout fails |
| `orchestra prepare` | Generate next task handover | Step 2 - auto-select task |
| `orchestra prepare --task N` | Generate specific task handover | Step 2 - specific task |
| `orchestra prepare --dry-run` | Preview without changes | Before committing to task |
| `orchestra init --verify` | Validate verification YAML schemas | After creating verification YAMLs |

---

## Troubleshooting

### "Closeout check C2 failed: previous task not COMPLETE"

The previous task's implementor hasn't finished, or you forgot to run `orchestra complete`.

**Fix:** Complete the previous task workflow, or if it's truly done, manually update `manifest.yaml`.

### "No PENDING tasks available"

All tasks in the manifest are either IMPLEMENT or COMPLETE.

**Fix:** Add new tasks to `manifest.yaml`, or check if a task is stuck in IMPLEMENT status.

### "Handover file already exists"

You're trying to prepare a task that was already prepared.

**Fix:** Either continue with existing handover, or delete `.orchestra/handover/current-task.md` and re-run.

---

## Remember

> **Your handover quality directly determines implementation success.**

A 10-minute investment in handover clarity saves hours of failed attempts and confused back-and-forth.

The implementor agent has NO context except what you give them. Write for that agent.

---

## See Also

- [Process 0: Sprint Initialization](./00-sprint-initialization.md) — Before your first task
- [Process 2: Task Verification](./02-task-verification.md) — After implementor signals done
- [Orchestrator README](../readme.md) — Role overview