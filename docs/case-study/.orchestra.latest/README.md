# Orchestra Implementation for TypeScript Projects

This `.orchestra` folder is a **TypeScript-specific implementation** of the Orchestra pattern defined in the [Orchestra Bible](../../orchestra-bible.md).

## Quick Reference

| I need to... | Run this |
|--------------|----------|
| Start session | `. .\.orchestra\common\scripts\set-env.ps1` |
| Check environment | `.\.orchestra\common\scripts\environment-check.ps1` |
| See sprint status | `.\.orchestra\orchestrator\scripts\sprint-status.ps1` |
| **Before next task** | `.\.orchestra\orchestrator\scripts\task-closeout-check.ps1` |
| Prepare handover | `.\.orchestra\orchestrator\scripts\prepare-handover.ps1` |
| **Implementor pre-check** | `.\.orchestra\implementor\.implementor-only\scripts\pre-signal-check.ps1` |
| Signal completion | `.\.orchestra\implementor\.implementor-only\scripts\signal-complete.ps1` |
| Gate check | `.\.orchestra\orchestrator\scripts\gate-check.ps1` |
| Verify task | `.\.orchestra\orchestrator\scripts\verification-audit.ps1` |
| Accept completion | `.\.orchestra\orchestrator\scripts\accept-signal-check.ps1` |
| Generate feedback | `.\.orchestra\orchestrator\scripts\generate-feedback.ps1` |
| Escalate failure | `.\.orchestra\orchestrator\scripts\escalate-failure.ps1` |

## Directory Structure

```
.orchestra/
├── README.md                          # This file
│
├── common/                            # Shared resources
│   ├── scripts/
│   │   ├── set-env.ps1               # Environment setup (RUN FIRST)
│   │   ├── check-utils.ps1           # Shared utility functions
│   │   └── environment-check.ps1     # Validate setup
│   └── templates/
│       ├── handover-template.md      # Task handover template
│       ├── signal-template.md        # Completion signal template
│       ├── feedback-template.md      # Verification failure feedback
│       └── verification-criteria-template.yaml
│
├── orchestrator/                      # ORCHESTRATOR-ONLY ZONE
│   ├── .orchestrator-only/           # ⚠️ HIDDEN from implementor
│   │   ├── manifest.yaml             # Task definitions
│   │   ├── progress.yaml             # Sprint progress
│   │   ├── verification/             # Hidden verification criteria
│   │   └── templates/
│   ├── scripts/
│   │   ├── task-closeout-check.ps1   # Pre-handover validation
│   │   ├── prepare-handover.ps1      # Create task handover
│   │   ├── handover-validate.ps1     # Validate no criteria leaked
│   │   ├── gate-check.ps1            # Basic verification gates
│   │   ├── verification-audit.ps1    # Hidden criteria verification
│   │   ├── accept-signal-check.ps1   # Accept completion
│   │   ├── generate-feedback.ps1     # Create retry feedback
│   │   ├── escalate-failure.ps1      # Escalate to human
│   │   ├── sprint-init.ps1           # Initialize sprint (placeholder)
│   │   └── sprint-status.ps1         # Show sprint status
│   ├── results/                       # Verification results
│   └── processes/                     # Process documentation
│
├── implementor/                       # IMPLEMENTOR-ACCESSIBLE ZONE
│   ├── .implementor-only/
│   │   └── scripts/
│   │       ├── pre-signal-check.ps1  # Self-validation before signal
│   │       ├── signal-complete.ps1   # Signal task completion
│   │       └── validate-handover.ps1 # Validate handover received
│   ├── handovers/                     # Task handover documents
│   ├── signals/                       # Completion signals
│   ├── feedback/                      # Retry feedback
│   └── artifacts/
│       └── pre-signal/               # Pre-signal check artifacts
│
├── handover/                          # Active handover (legacy location)
│   ├── current-task.md               # Current task handover
│   ├── completion-signal.md          # Active completion signal
│   └── task-context.md               # Sprint context
│
└── docs/                              # Process documentation
```

## TypeScript-Specific Adaptations

This implementation is configured for **TypeScript/Node.js** projects:

| Setting | Value |
|---------|-------|
| Project Type | `typescript` |
| Build Command | `npm run build` |
| Test Command | `npm test` |
| Type Check | `npx tsc --noEmit` |
| Lint Command | `npm run lint` |
| Test Pattern | `**/*.test.ts` |

These are configured in `common/scripts/set-env.ps1`.

## Workflow

### Standard Task Cycle

```
1. ORCHESTRATOR: Source environment
   . .\.orchestra\common\scripts\set-env.ps1

2. ORCHESTRATOR: Verify previous task closed
   .\.orchestra\orchestrator\scripts\task-closeout-check.ps1

3. ORCHESTRATOR: Prepare handover
   .\.orchestra\orchestrator\scripts\prepare-handover.ps1

4. --- Context switch to new session ---

5. IMPLEMENTOR: Read handover and implement

6. IMPLEMENTOR: Self-validate
   .\.orchestra\implementor\.implementor-only\scripts\pre-signal-check.ps1

7. IMPLEMENTOR: Signal completion
   .\.orchestra\implementor\.implementor-only\scripts\signal-complete.ps1

8. --- Context switch back ---

9. ORCHESTRATOR: Gate check
   .\.orchestra\orchestrator\scripts\gate-check.ps1

10. ORCHESTRATOR: Verification
    .\.orchestra\orchestrator\scripts\verification-audit.ps1

11. ORCHESTRATOR: Accept or feedback
    - PASS: .\.orchestra\orchestrator\scripts\accept-signal-check.ps1
    - FAIL: .\.orchestra\orchestrator\scripts\generate-feedback.ps1
```

### On Persistent Failure (3+ attempts)

```
ORCHESTRATOR: Escalate to human
.\.orchestra\orchestrator\scripts\escalate-failure.ps1 -TaskId <id>

See Orchestra Bible Section 4.3.1 for Human Intervention Actions.
```

## Key Files

| File | Purpose | Who Accesses |
|------|---------|--------------|
| `manifest.yaml` | Task definitions, dependencies | Orchestrator only |
| `progress.yaml` | Sprint progress, task states | Orchestrator only |
| `current-task.md` | Active task handover | Both |
| `completion-signal.md` | Active completion signal | Both |
| `verification/*.yaml` | Hidden verification criteria | Orchestrator only |

## Differences from Bible Abstract

| Bible Spec | This Implementation | Reason |
|------------|---------------------|--------|
| `manifest.yaml` at root | In `.orchestrator-only/` | Stricter information hiding |
| `implementor/handovers/` | `handover/current-task.md` | Simpler for single active task |
| Platform-agnostic scripts | PowerShell (`.ps1`) | Windows + TypeScript project |
| Generic build commands | `npm run build`, `npm test` | TypeScript ecosystem |

## Bible Reference

This implementation follows the **Orchestra Bible v0.7.0**:

- **Section 6.1**: Folder Structure (adapted for TypeScript)
- **Section 8**: Script Specifications (all scripts implemented)
- **Section 12**: Adaptation Guidelines (platform-specific config)
- **Appendix D**: Templates (all templates included)

For the complete specification, see:
`docs/orchestra-bible.md`

---

*Orchestra TypeScript Implementation v1.0.0*
*Based on Orchestra Bible v0.7.0*
