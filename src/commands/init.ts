/**
 * Orchestra Init Command
 *
 * Aligned with Orchestra Bible v0.7.0
 * Initializes the Orchestra folder structure in a project.
 */

import chalk from "chalk";
import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import ora from "ora";
import { findOrchestraRoot, saveConfig } from "../core/config.js";
import * as output from "../core/output.js";
import { DEFAULT_CONFIG } from "../core/types.js";

/**
 * Init command options
 */
export interface InitOptions {
  /** Path to SpecKit spec file */
  spec?: string;
  /** Overwrite existing configuration */
  force?: boolean;
  /** Output as JSON */
  json?: boolean;
  /** Show what would be created without creating */
  dryRun?: boolean;
  /** Override Orchestra root directory (for testing) */
  orchestraRoot?: string;
}

/**
 * Folders to create during initialization
 */
const DEFAULT_FOLDERS = [
  "common/templates",
  "orchestrator/.orchestrator-only/verification",
  "orchestrator/processes",
  "orchestrator/results",
  "handover",
  "implementor/.implementor-only",
  "implementor/artifacts",
];

/**
 * Template content for current-task.md.hbs
 */
const CURRENT_TASK_TEMPLATE = `# Task {{id}}: {{title}}

## Objective

{{description}}

## Deliverables

{{#each deliverables}}
- [ ] {{this}}
{{/each}}

## Dependencies

{{#if dependencies.length}}
{{#each dependencies}}
- {{id}}: {{title}} {{#if completed}}✓{{else}}○{{/if}}
{{/each}}
{{else}}
No dependencies.
{{/if}}

## Notes

<!-- Add implementation notes here -->
`;

/**
 * Template content for completion-signal.md.hbs
 */
const COMPLETION_SIGNAL_TEMPLATE = `# Completion Signal

## Task
{{id}}: {{title}}

## Summary
<!-- Describe what you implemented -->

## Artifacts Created
{{#each deliverables}}
- [ ] {{this}}
{{/each}}

## Tests
- [ ] All tests passing
- [ ] Test file: <!-- path to test file -->

## Notes
<!-- Any implementation notes or decisions -->
`;

/**
 * Template content for task-context.md.hbs
 */
const TASK_CONTEXT_TEMPLATE = `# Sprint Context

## Sprint Info
- **ID**: {{sprint.id}}
- **Title**: {{sprint.title}}
- **Branch**: {{sprint.branch}}

## Current Task
- **Task**: {{currentTask.id}} - {{currentTask.title}}
- **Status**: {{currentTask.status}}

## Progress

| Status | Count |
|--------|-------|
| Completed | {{stats.completed}} |
| In Progress | {{stats.inProgress}} |
| Not Started | {{stats.notStarted}} |

## Completed Tasks

{{#each completedTasks}}
- {{id}}: {{title}} ✓
{{/each}}
`;

/**
 * Agent README template content
 */
const AGENT_README_TEMPLATE = `# Orchestra Implementor Guide

## Your Role

You are an **Implementor Agent**.

Your job is to complete the task described in \`current-task.md\` following the requirements exactly.

---

## 📂 File Locations

### Files You Should Read

| File | Location | Purpose |
|------|----------|----------|
| **Your Task** | \`.orchestra/handover/current-task.md\` | Complete task requirements, acceptance criteria |
| **This Guide** | \`.orchestra/handover/agent_readme.md\` | Workflow reference (this file - immutable) |

### Files You Should NOT Touch

| Location | Purpose | Who Manages |
|----------|---------|-------------|
| \`.orchestra/.orchestrator-only/*\` | Orchestrator workspace | Orchestrator only |
| \`.orchestra/handover/agent_readme.md\` | This guide | Immutable (do not edit) |
| \`.orchestra/orchestra.yaml\` | Project configuration | Orchestrator only |

---

## 🔄 Workflow

### Step 1: Read Your Task

Open and read: **\`.orchestra/handover/current-task.md\`**

This file contains:
- Task objectives
- Acceptance criteria
- File operations required
- Verification steps
- SpecKit task references

### Step 2: Implement Requirements

- Follow ALL acceptance criteria exactly
- If TDD is required, write tests FIRST
- Use quality patterns from previous phases
- Stay focused on THIS task only

### Step 3: Verify Your Work

Run all verification steps listed in \`handover/current-task.md\`.

### Step 4: Signal Completion

When implementation is complete and all tests pass:

1. **Copy the completion signal template**:
   \`\`\`powershell
   Copy-Item ".orchestra/common/templates/completion-signal.md.hbs" ".orchestra/completion-signal.yaml"
   \`\`\`

2. **Fill out the completion signal** with:
   - Task summary
   - Files created/modified
   - Test results
   - Any notes or concerns

3. **Save the file** as \`.orchestra/completion-signal.yaml\`

4. **Notify**: Say **"ready for review"** and STOP

---

## 🚫 Important Rules

1. **ONE task only** - Do not look at manifest or other tasks
2. **Follow the spec** - SpecKit references are in \`handover/current-task.md\`
3. **No orchestrator files** - Stay out of \`.orchestrator-only/\`
4. **Signal when done** - Complete the signal file and notify
5. **Do not modify this file** - agent_readme.md is immutable

**Ready to implement? Start with \`.orchestra/handover/current-task.md\`** 🚀
`;

/**
 * Orchestrator README template content
 */
const ORCHESTRATOR_README_TEMPLATE = `# Orchestrator Role

⚠️ **THIS FOLDER IS FOR ORCHESTRATOR ONLY** ⚠️

The implementor agent should NEVER read files in this folder.

---

## 🎯 THE THREE ORCHESTRATOR PROCESSES

| Process | Document | When | CLI Command |
|---------|----------|------|-------------|
| **Process 0** | [Sprint Initialization](./processes/00-sprint-initialization.md) | Starting a new sprint | \`orchestra init --spec <path>\` |
| **Process 1** | [Handover Creation](./processes/01-handover-creation.md) | Before each task | \`orchestra prepare --task <N>\` |
| **Process 2** | [Task Verification](./processes/02-task-verification.md) | After implementor signals | \`orchestra verify --task <N>\` |

---

## 📂 Folder Structure

\`\`\`
orchestrator/
├── readme.md                    # This file (entry point)
├── processes/                   # Detailed process documentation
│   ├── 00-sprint-initialization.md
│   ├── 01-handover-creation.md
│   └── 02-task-verification.md
├── .orchestrator-only/          # HIDDEN from implementor
│   └── verification/            # Per-task verification criteria
└── results/                     # Verification results and archives
    └── task-NNN/                # Archived task artifacts
\`\`\`

---

## 🔧 Quick Reference: CLI Commands

| Command | Purpose |
|---------|---------|
| \`orchestra status\` | Show current orchestra state |
| \`orchestra init --spec <path>\` | Initialize from spec file |
| \`orchestra closeout\` | Verify previous task is closed out |
| \`orchestra prepare --task <N>\` | Generate handover for task N |
| \`orchestra accept-signal\` | Check if implementor signal exists |
| \`orchestra verify --task <N>\` | Run verification checks |
| \`orchestra complete --task <N>\` | Archive and close out task |

---

## 🚫 Key Rules

1. **Never show verification criteria to implementor** - Prevents gaming
2. **Fresh context for each task** - Prevents learning patterns  
3. **Signals trigger verification, not claims** - "I'm done" means nothing without artifacts
4. **Feedback guides without revealing** - Say what's wrong, not how you detected it
5. **CLI commands are authoritative** - Always use \`orchestra\` commands, not manual scripts

---

## 📋 Hidden Files (.orchestrator-only/)

| File | Purpose |
|------|---------|
| \`verification/task-NNN.yaml\` | Hidden acceptance criteria per task |

**Why hidden?** Prevents implementors from "gaming" the verification criteria.

---

## See Also

- [Agent README](../handover/agent_readme.md) - Implementor workflow guide
- [Process 0: Sprint Init](./processes/00-sprint-initialization.md)
- [Process 1: Handover Creation](./processes/01-handover-creation.md)
- [Process 2: Task Verification](./processes/02-task-verification.md)
`;

/**
 * Process 00: Sprint Initialization template
 */
const PROCESS_00_SPRINT_INIT_TEMPLATE = `# Process 00: Sprint Initialization

## Overview

This process initializes a new sprint from a SpecKit specification. It creates the manifest.yaml, verification criteria, and progress tracking.

---

## 🎯 When to Execute

- Starting a brand new project with Orchestra
- Beginning a new sprint from a spec file
- Reinitializing after major spec changes

---

## ✅ Prerequisites

Before running this process:

1. **Spec file exists**: A SpecKit-compatible spec at the expected path
2. **Project workspace**: Clean working directory
3. **Orchestra CLI**: \`orchestra\` command available

---

## 📋 Process Steps

### Step 1: Initialize Orchestra

\`\`\`powershell
# Initialize Orchestra with spec file
orchestra init --spec path/to/spec.md
\`\`\`

**What this creates:**
- \`.orchestra/\` directory structure
- \`manifest.yaml\` with tasks parsed from spec
- Default templates in \`common/templates/\`
- This process documentation

### Step 2: Review Generated Manifest

Open \`.orchestra/manifest.yaml\` and verify:

\`\`\`yaml
spec_path: "path/to/spec.md"
tasks:
  - id: 1
    title: "Task title from spec"
    description: "Task description"
    status: "pending"
    deliverables:
      - "Deliverable 1"
      - "Deliverable 2"
\`\`\`

**Checklist:**
- [ ] All tasks from spec are present
- [ ] Task IDs are sequential
- [ ] Descriptions are accurate
- [ ] Deliverables are correct

### Step 3: Create Verification Criteria

For each task, create hidden verification criteria:

**Location:** \`.orchestra/orchestrator/.orchestrator-only/verification/task-NNN.yaml\`

\`\`\`yaml
# Example: task-001.yaml
task_id: 1
verification:
  files_exist:
    - path/to/expected/file.dart
    - path/to/another/file.dart
  tests_pass:
    - test/unit/feature_test.dart
  code_quality:
    - no_errors: true
    - no_warnings: true
  visual_verification:
    required: false
    screenshot_path: null
\`\`\`

**Important:** These criteria are HIDDEN from the implementor!

### Step 4: Verify Initialization

\`\`\`powershell
# Check orchestra status
orchestra status
\`\`\`

**Expected output:**
- Orchestra root found
- Manifest loaded
- Current task: 1 (or none if not started)
- Total tasks shown

---

## 🔄 After Initialization

Proceed to **Process 01: Handover Creation** to prepare the first task:

\`\`\`powershell
orchestra prepare --task 1
\`\`\`

---

## ⚠️ Common Issues

| Issue | Solution |
|-------|----------|
| "Already initialized" | Use \`orchestra init --force\` to reinitialize |
| "Spec file not found" | Check the path, ensure file exists |
| Missing tasks in manifest | Check spec format, ensure proper headers |

---

## 📁 Files Created

| File | Purpose |
|------|---------|
| \`.orchestra/manifest.yaml\` | Sprint task manifest |
| \`.orchestra/config.json\` | Orchestra configuration |
| \`.orchestra/common/templates/*.hbs\` | Handlebars templates |
| \`.orchestra/orchestrator/readme.md\` | This folder's readme |
| \`.orchestra/handover/agent_readme.md\` | Implementor instructions |
`;

/**
 * Process 01: Handover Creation template
 */
const PROCESS_01_HANDOVER_CREATION_TEMPLATE = `# Process 01: Handover Creation

## Overview

This process prepares the handover package for the next task. It verifies the previous task is closed out, generates task context, and creates the handover documents.

---

## 🎯 When to Execute

- After completing Process 00 (Sprint Init)
- After completing Process 02 (Task Verification) for previous task
- Before delegating to implementor agent

---

## ✅ Prerequisites

Before running this process:

1. **Previous task closed** (if not first task)
2. **Manifest exists** with task definitions
3. **Verification criteria created** for target task

---

## 📋 Process Steps

### Step 1: Run Closeout Check (Skip for First Task)

If this is NOT the first task:

\`\`\`powershell
# Verify previous task is properly closed
orchestra closeout
\`\`\`

**Expected:** "Previous task properly closed" or similar success message

**If closeout fails:**
- Return to Process 02 to complete verification
- Do NOT proceed until previous task is archived

### Step 2: Prepare Handover

\`\`\`powershell
# Generate handover for next task
orchestra prepare --task <N>
\`\`\`

**Replace \`<N>\` with the task number (1, 2, 3, etc.)**

**What this creates:**
- \`.orchestra/handover/current-task.md\` - Task details for implementor
- \`.orchestra/handover/task-context.md\` - Additional context (optional)

### Step 3: Validate Handover Package

Check the generated files:

\`\`\`powershell
# View the current task file
Get-Content .orchestra/handover/current-task.md
\`\`\`

**Checklist:**
- [ ] Task title matches manifest
- [ ] Description is clear
- [ ] Deliverables are listed
- [ ] Dependencies noted (if any)

### Step 4: Review Hidden Verification Criteria

As orchestrator, verify the criteria file exists:

\`\`\`powershell
# Check verification criteria (DO NOT share with implementor!)
Test-Path .orchestra/orchestrator/.orchestrator-only/verification/task-<NNN>.yaml
\`\`\`

**This file is HIDDEN from the implementor.** Do not reveal its contents.

### Step 5: Update Manifest Status

The \`orchestra prepare\` command should update the manifest:

\`\`\`yaml
tasks:
  - id: N
    status: "in-progress"  # Changed from "pending"
\`\`\`

Verify this change occurred.

---

## 🚀 Delegating to Implementor

### Start New Session

**CRITICAL:** Start a FRESH session for the implementor agent.

Do NOT use the same session as the orchestrator - this prevents:
- Implementor seeing verification criteria
- Pattern learning across tasks
- Context contamination

### Invocation Script

Tell the implementor:

> Read \`.orchestra/handover/agent_readme.md\` and begin Task N.

Or if more context needed:

> Read \`.orchestra/handover/agent_readme.md\` first, then \`.orchestra/handover/current-task.md\`. 
> Complete all deliverables and signal when ready for verification.

---

## ⚠️ Common Issues

| Issue | Solution |
|-------|----------|
| "Previous task not closed" | Run \`orchestra complete --task <prev>\` first |
| "Task not found" | Check manifest.yaml for task ID |
| "Template not found" | Run \`orchestra init\` to regenerate templates |

---

## 🔄 After Handover

Wait for implementor to:
1. Read agent_readme.md
2. Read current-task.md
3. Implement deliverables
4. Generate completion-signal.md

When implementor signals completion, proceed to **Process 02: Task Verification**.

---

## 📁 Files Modified

| File | Change |
|------|--------|
| \`.orchestra/handover/current-task.md\` | Created/updated |
| \`.orchestra/handover/task-context.md\` | Created (optional) |
| \`.orchestra/manifest.yaml\` | Task status → "in-progress" |
`;

/**
 * Process 02: Task Verification template
 */
const PROCESS_02_TASK_VERIFICATION_TEMPLATE = `# Process 02: Task Verification

## Overview

This process verifies an implementor's completed work against hidden criteria, accepts or rejects the submission, and archives completed tasks.

---

## 🎯 When to Execute

- Implementor says "ready for review" or "task complete"
- Completion signal file exists
- All deliverables claimed complete

---

## ✅ Prerequisites

Before running this process:

1. **Completion signal exists**: \`.orchestra/handover/completion-signal.md\`
2. **Implementor claims complete**: Deliverables checklist filled
3. **Verification criteria exist**: Hidden YAML for this task

---

## 📋 Process Steps

### Step 1: Check for Completion Signal

\`\`\`powershell
# Verify completion signal exists
orchestra accept-signal
\`\`\`

**Expected:** "Completion signal found" or similar success

**If signal missing:**
- Tell implementor to generate completion-signal.md
- They may have said "done" without actually signaling
- Do NOT proceed without the signal file

### Step 2: Load Hidden Verification Criteria

As orchestrator, read the hidden criteria:

\`\`\`powershell
# Read verification criteria (NEVER show to implementor!)
Get-Content .orchestra/orchestrator/.orchestrator-only/verification/task-<NNN>.yaml
\`\`\`

**Keep this information HIDDEN.** You will verify against it without revealing what you're checking.

### Step 3: Run Verification

\`\`\`powershell
# Execute verification checks
orchestra verify --task <N>
\`\`\`

**This command checks:**
- Files exist as specified
- Tests pass (if specified)
- Code quality (if specified)

### Step 4: Execute Each Criterion

For each item in the verification criteria:

#### 4a. File Existence Checks

\`\`\`powershell
# Check each required file exists
Test-Path path/to/expected/file.dart
\`\`\`

#### 4b. Test Execution

\`\`\`powershell
# Run specified tests
flutter test test/unit/feature_test.dart
\`\`\`

#### 4c. Code Quality

\`\`\`powershell
# Run analyzer on touched files
flutter analyze lib/path/to/files/
\`\`\`

**Required:** No errors, no warnings

#### 4d. Visual Verification (if required)

If verification criteria specify visual verification:

1. Check screenshot exists at specified path
2. Open screenshot via Chrome DevTools MCP:
   \`\`\`
   mcp_chrome-devtoo_new_page(url: "file:///path/to/screenshot.png")
   mcp_chrome-devtoo_take_screenshot()
   \`\`\`
3. Analyze returned image against visual criteria
4. Close browser page when done

---

## ✅ PASS Decision

If ALL criteria pass:

### Step 5a: Complete the Task

\`\`\`powershell
# Archive and close out the task
orchestra complete --task <N>
\`\`\`

**What this does:**
- Moves task status to "completed"
- Archives artifacts to \`orchestrator/results/task-NNN/\`
- Removes completion-signal.md from handover/
- Updates manifest.yaml

### Step 5b: Proceed to Next Task

Return to **Process 01: Handover Creation** for the next task:

\`\`\`powershell
orchestra prepare --task <N+1>
\`\`\`

---

## ❌ FAIL Decision

If ANY criterion fails:

### Step 5a: Provide Feedback

Tell the implementor WHAT failed, but NOT HOW you detected it:

**Good feedback examples:**
- "The feature doesn't handle edge case X"
- "Test coverage is incomplete for Y scenario"
- "Visual appearance doesn't match requirements"

**Bad feedback examples (reveals criteria):**
- "The file at path/to/specific/file.dart is missing" ❌
- "The verification YAML says you need X" ❌
- "You failed check #3 in my hidden criteria" ❌

### Step 5b: Request Retry

Tell implementor:

> Some issues were found. Please address the feedback and signal completion again when ready.

### Step 5c: Wait for New Signal

Do NOT re-verify until:
- Implementor acknowledges the feedback
- Implementor makes changes
- Implementor generates NEW completion-signal.md

---

## ⚠️ Common Issues

| Issue | Solution |
|-------|----------|
| "Completion signal not found" | Tell implementor to create it |
| "Verification criteria missing" | Create criteria in Process 00 |
| Partial pass | Fail the whole task, provide feedback |
| Implementor disputes result | Verify again, check criteria are fair |

---

## 🔐 Security Reminders

1. **NEVER reveal verification criteria** - Prevents gaming
2. **NEVER show file paths from criteria** - Use general descriptions
3. **NEVER share the .orchestrator-only folder** - Keep it hidden
4. **Fresh session for next task** - Prevent pattern learning

---

## 📁 Files Modified on PASS

| File | Change |
|------|--------|
| \`.orchestra/manifest.yaml\` | Task status → "completed" |
| \`.orchestra/handover/completion-signal.md\` | Deleted (archived) |
| \`.orchestra/orchestrator/results/task-NNN/\` | Created with archives |

---

## 🔄 Verification Complete

After verification:
- **PASS**: Proceed to Process 01 for next task
- **FAIL**: Wait for implementor retry, then re-verify

The cycle continues until all tasks in the manifest are completed.
`;

/**
 * Implementor folder README template content
 */
const IMPLEMENTOR_README_TEMPLATE = `# Implementor Role

This folder contains implementor-specific files and artifacts.

> **START HERE**: Read \`.orchestra/handover/agent_readme.md\` for full workflow instructions.
> This readme is a folder structure overview only.

## Folder Structure

\`\`\`
implementor/
├── readme.md                    # This file
├── .implementor-only/           # Private implementor workspace
│   └── scripts/                 # Validation scripts (future)
└── artifacts/                   # Implementation artifacts
\`\`\`

## Workflow Summary

1. Read \`.orchestra/handover/agent_readme.md\`
2. Read \`.orchestra/handover/current-task.md\`
3. Implement the requirements
4. Signal completion
5. Wait for orchestrator verification

## See Also

- [Agent README](../handover/agent_readme.md) - Full workflow instructions
`;

/**
 * Default files to create with their content
 */
const DEFAULT_FILES: Record<string, string> = {
  "common/templates/current-task.md.hbs": CURRENT_TASK_TEMPLATE,
  "common/templates/completion-signal.md.hbs": COMPLETION_SIGNAL_TEMPLATE,
  "common/templates/task-context.md.hbs": TASK_CONTEXT_TEMPLATE,
  "handover/agent_readme.md": AGENT_README_TEMPLATE,
  "handover/.gitkeep": "",
  "orchestrator/readme.md": ORCHESTRATOR_README_TEMPLATE,
  "orchestrator/processes/00-sprint-initialization.md":
    PROCESS_00_SPRINT_INIT_TEMPLATE,
  "orchestrator/processes/01-handover-creation.md":
    PROCESS_01_HANDOVER_CREATION_TEMPLATE,
  "orchestrator/processes/02-task-verification.md":
    PROCESS_02_TASK_VERIFICATION_TEMPLATE,
  "implementor/readme.md": IMPLEMENTOR_README_TEMPLATE,
};

/**
 * Create the init command
 */
export function initCommand(): Command {
  return new Command("init")
    .description("Initialize Orchestra in this project")
    .option("--spec <path>", "Path to SpecKit spec file")
    .option("-f, --force", "Overwrite existing configuration")
    .option("--json", "Output as JSON")
    .option("--dry-run", "Show what would be created without creating")
    .action(async (options: InitOptions) => {
      await runInit(options);
    });
}

/**
 * Execute the init command
 */
export async function runInit(options: InitOptions): Promise<void> {
  const cwd = options.orchestraRoot ?? process.cwd();
  const orchestraDir = path.join(cwd, ".orchestra");

  // Check if already initialized
  const existingRoot = findOrchestraRoot(cwd);
  if (existingRoot && !options.force) {
    if (options.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: "Already initialized",
          hint: "Use --force to reinitialize",
          path: path.join(existingRoot, ".orchestra"),
        })
      );
    } else {
      output.print.error("Orchestra already initialized in this directory.");
      output.print.info("Use --force to reinitialize.");
    }
    process.exit(1);
  }

  // Dry run mode
  if (options.dryRun) {
    showDryRun(orchestraDir);
    return;
  }

  const spinner = options.json
    ? null
    : ora("Initializing Orchestra...").start();

  try {
    // Create directory structure
    for (const folder of DEFAULT_FOLDERS) {
      const folderPath = path.join(orchestraDir, folder);
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Create default files
    for (const [relativePath, content] of Object.entries(DEFAULT_FILES)) {
      const filePath = path.join(orchestraDir, relativePath);
      // Ensure parent directory exists
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, "utf-8");
    }

    // Create configuration with spec_path if provided
    const config = { ...DEFAULT_CONFIG };
    if (options.spec) {
      (config as Record<string, unknown>).spec_path = options.spec;
    }
    saveConfig(cwd, config);

    // Create manifest template
    const manifestPath = path.join(orchestraDir, "manifest.yaml");
    const manifestContent = generateManifestTemplate(options.spec);
    fs.writeFileSync(manifestPath, manifestContent, "utf-8");

    spinner?.succeed("Orchestra initialized successfully");

    if (options.json) {
      console.log(
        JSON.stringify({
          success: true,
          path: orchestraDir,
          folders: DEFAULT_FOLDERS,
          files: [...Object.keys(DEFAULT_FILES), "manifest.yaml"],
          spec_path: options.spec,
        })
      );
    } else {
      showSuccess(orchestraDir, options.spec);
    }
  } catch (error) {
    spinner?.fail("Failed to initialize Orchestra");

    if (options.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    } else {
      output.print.error(
        error instanceof Error ? error.message : String(error)
      );
    }
    process.exit(1);
  }
}

/**
 * Show dry run output
 */
function showDryRun(orchestraDir: string): void {
  output.print.header("Dry Run - Would Create:");

  console.log(chalk.bold("\nFolders:"));
  for (const folder of DEFAULT_FOLDERS) {
    console.log(`  ${chalk.green("+")} ${path.join(orchestraDir, folder)}`);
  }

  console.log(chalk.bold("\nFiles:"));
  for (const file of Object.keys(DEFAULT_FILES)) {
    console.log(`  ${chalk.green("+")} ${path.join(orchestraDir, file)}`);
  }

  console.log(chalk.bold("\nConfiguration:"));
  console.log(
    `  ${chalk.green("+")} ${path.join(orchestraDir, "orchestra.yaml")}`
  );
}

/**
 * Generate manifest template content with SpecKit format
 */
function generateManifestTemplate(specPath?: string): string {
  const today = new Date().toISOString().split("T")[0];
  const specNote = specPath
    ? `# SpecKit Root: ${specPath}\n# This manifest tracks implementation of SpecKit tasks\n`
    : "# TODO: Add speckit.root to orchestra.yaml\n";

  return `# Orchestra Manifest - Generated ${today}
${specNote}
version: "1.0.0"

sprint:
  id: "sprint-001"           # REQUIRED: Unique sprint identifier
  name: "Sprint Name"        # REQUIRED: Human-readable sprint name
  status: ACTIVE             # ACTIVE | COMPLETE
  created_at: "${today}"

# SpecKit-aligned phase structure
# Each phase groups related tasks from SpecKit specs
phases:
  - phase_id: "foundation"
    phase_name: "Foundation Phase"
    status: ACTIVE           # ACTIVE | COMPLETE
    speckit_tasks:           # SpecKit task IDs implemented in this phase
      - "T001"
      - "T002"
    tasks:
      - task_id: 1
        title: "First Task"
        description: "TODO: Describe what needs to be done"
        status: PENDING      # PENDING | IMPLEMENT | COMPLETE | BLOCKED
        category: INFRASTRUCTURE  # INFRASTRUCTURE | INTEGRATION | VISUAL | REFACTOR
        dependencies: []     # Array of task_ids this depends on
        speckit_task_ref: "001-foundation/tasks.md#T001"  # Path to SpecKit task

      - task_id: 2
        title: "Second Task"
        description: "TODO: Describe what needs to be done"
        status: PENDING
        category: INTEGRATION
        dependencies: [1]    # Depends on task 1
        speckit_task_ref: "001-foundation/tasks.md#T002"

# Task consolidation tracking
# When multiple SpecKit tasks are combined into one implementation task
consolidations: []
  # Example:
  # - consolidated_task_id: 1
  #   speckit_tasks: ["T001", "T002", "T003"]
  #   consolidation_rationale: "All three tasks modify the same module"
  #   verification_coverage:
  #     T001: "Covered by unit tests in test_module.dart"
  #     T002: "Integration test in test_integration.dart"
  #     T003: "Visual verification screenshot in screenshots/"
`;
}

/**
 * Show success message with created structure
 */
function showSuccess(orchestraDir: string, specPath?: string): void {
  console.log("");
  output.print.success("Orchestra initialized!");
  console.log("");
  console.log(chalk.bold("Created structure:"));
  console.log(`  ${orchestraDir}/`);
  console.log("    ├── orchestra.yaml      # Configuration");
  console.log("    ├── manifest.yaml       # Sprint/task definitions");
  console.log("    ├── common/templates/   # Handover templates");
  console.log("    ├── orchestrator/       # Orchestrator workspace");
  console.log("    │   ├── readme.md       # Orchestrator entry point");
  console.log("    │   ├── processes/      # Workflow documentation");
  console.log("    │   ├── .orchestrator-only/  # Hidden verification");
  console.log("    │   └── results/        # Task archives");
  console.log("    ├── implementor/        # Implementor workspace");
  console.log("    │   ├── readme.md       # Points to agent_readme");
  console.log("    │   └── artifacts/      # Implementation artifacts");
  console.log("    └── handover/           # Active handover folder");
  console.log("        └── agent_readme.md # Implementor instructions");
  console.log("");

  console.log(chalk.bold("Next steps:"));
  console.log("");
  console.log(
    "  1. " +
      chalk.bold("Read orchestrator guide:") +
      " " +
      chalk.cyan(".orchestra/orchestrator/readme.md")
  );
  console.log("");
  console.log(
    "  2. " +
      chalk.bold("Follow sprint init:") +
      "   " +
      chalk.cyan(".orchestra/orchestrator/processes/00-sprint-initialization.md")
  );
  if (specPath) {
    console.log(
      chalk.dim("     Your spec is at: ") + chalk.cyan(specPath)
    );
  }
  console.log("");
  console.log(
    "  3. " +
      chalk.bold("Verify setup:") +
      "        " +
      chalk.cyan("orchestra status")
  );
  console.log("");
}

export { initCommand as createInitCommand };
