# Information Isolation Principle

> **Navigation**: [Index](../readme.md) | **Prev**: [Verification Protocol](verification-protocol.md) | **Next**: [Visual Verification](visual-verification.md)
>
> Aligned with Orchestra Bible v0.7.0 - Section 6 (Information Architecture)

---

## Overview

The Information Isolation Principle is a **CRITICAL** security and trust boundary that prevents implementation theater. It ensures that Implementors work only from the context provided in handovers, never from sprint internals or task lists.

**Core Mandate**: The Implementor MUST have ZERO access to:
- Task lists or sprint manifests
- Internal Orchestra task definitions
- Specification files referenced by "See spec file"
- Verification criteria (hidden or visible)
- Other tasks in the sprint

---

## Why Information Isolation Matters

### The Problem: Context Leakage

When implementors can access:
- **Task lists**: They see the full scope and may cut corners or over-engineer
- **Sprint manifests**: They understand the "game" and can game acceptance criteria
- **Spec files**: They may cherry-pick requirements or misinterpret scope
- **Verification criteria**: They can satisfy checks without understanding intent

### The Solution: Complete Extraction

The Orchestrator's **PRIMARY JOB** is to:

1. **READ** the specification files, task definitions, and requirements
2. **EXTRACT** exactly what the Implementor needs to know
3. **WRITE** a complete, self-contained handover document
4. **NEVER** reference external documents the Implementor cannot access

---

## The Extraction Mandate

### Orchestrator Responsibilities

| What Orchestrator MUST Do | Why |
|---------------------------|-----|
| Extract exact requirements into handover | Implementor has single source of truth |
| Include all file paths with full context | No guessing about locations |
| Provide complete acceptance criteria | Clear success definition |
| Include test cases with sample data | Implementor knows exactly what to test |
| Provide code scaffolds where helpful | Reduces ambiguity |
| Document all constraints and edge cases | Prevents scope creep |

### Forbidden Patterns

| Pattern | Why It's Forbidden | Correct Alternative |
|---------|-------------------|---------------------|
| "See spec file for details" | Implementor cannot access spec | Extract details into handover |
| "Refer to task list for context" | Implementor cannot access manifest | Provide context directly |
| "As described in requirements.md" | Implementor cannot access spec folder | Copy relevant requirements |
| "Check other tasks for examples" | Implementor cannot see other tasks | Include examples in handover |
| Empty template sections | Provides no guidance | Fill or remove section |

---

## Handover Completeness Criteria

A handover is **COMPLETE** only when:

### 1. Self-Contained
- [ ] No external references that Implementor cannot access
- [ ] All requirements extracted and written explicitly
- [ ] All file paths are absolute or relative to project root
- [ ] All acceptance criteria are measurable

### 2. Specific
- [ ] File operations table with exact paths and purposes
- [ ] Test cases with sample inputs and expected outputs
- [ ] Code scaffolds showing function signatures
- [ ] Error handling requirements documented

### 3. Actionable
- [ ] Clear "Definition of Done" the Implementor can verify
- [ ] Commands to run for testing
- [ ] Success indicators that can be checked

### 4. Isolated
- [ ] No mentions of sprint manifest or task list
- [ ] No references to `.orchestra/` internal files
- [ ] No "see specification" or "per requirements" references
- [ ] No task IDs beyond the current task

---

## Enforcement

### Pre-Flight Validation

The `orchestra validate-handover` command checks for:

1. **Forbidden References**: Scans for "see spec", "refer to", "as per" patterns
2. **External Dependencies**: Checks for paths outside Implementor scope
3. **Empty Sections**: Validates all sections have content
4. **Self-Containment**: Verifies handover stands alone

### Orchestrator Agent Rules

```
CRITICAL: Information Isolation

When preparing handovers:
- NEVER say "see spec file" or "refer to requirements"
- NEVER mention sprint manifests or task lists  
- NEVER reference other tasks by ID
- ALWAYS extract requirements into the handover
- ALWAYS provide complete context within the handover document

The handover IS the specification. There is no external reference.
```

### Implementor Agent Rules

```
CRITICAL: Information Boundary

You MUST NOT:
- Read .orchestra/manifest.yaml
- Read .orchestra/progress.yaml
- Read spec/ folder files
- Read .orchestrator-only/ files
- Access any file not explicitly mentioned in your handover

You MUST:
- Work ONLY from the handover document
- Ask clarifying questions via signal if handover is incomplete
- Document any missing context in your signal
```

---

## Example: Good vs Bad Handovers

### ❌ BAD: References External Documents

```markdown
## Requirements
See `spec/03-components/scripts.md` for the full specification.

## Acceptance Criteria
As defined in the task requirements.

## Testing
Per the testing requirements in the spec file.
```

### ✅ GOOD: Self-Contained Extraction

```markdown
## Requirements

Create a new CLI command `orchestra validate-handover` that:
1. Reads the current handover from `.orchestra/handover/current-task.md`
2. Validates required sections exist: Objective, Deliverables, TDD
3. Checks for forbidden patterns: "see spec", "refer to"
4. Returns exit code 0 for valid, 1 for invalid

## Acceptance Criteria

| # | Criterion | Verification Method |
|---|-----------|---------------------|
| 1 | Command exists and is callable | Run `orchestra validate-handover --help` |
| 2 | Validates section presence | Test with handover missing sections |
| 3 | Detects forbidden patterns | Test with handover containing "see spec" |
| 4 | Returns correct exit codes | Assert exit code matches validation result |

## Testing

### Test Structure
```typescript
describe('validate-handover command', () => {
  it('should return 0 for valid handover', async () => {
    // Setup: Create valid handover in temp directory
    // Execute: Run command
    // Assert: Exit code is 0
  });
  
  it('should return 1 when sections missing', async () => {
    // Setup: Create handover missing Objective section
    // Execute: Run command  
    // Assert: Exit code is 1, error mentions missing section
  });
});
```
```

---

## Integration Points

### Workflow: prepare.md

The prepare workflow (A-PREP-08) requires the Orchestrator to:
- Fill in `objective` - extracted from spec, not referenced
- Fill in `acceptance_criteria` - written explicitly
- Fill in `file_operations` - complete paths and purposes
- Fill in `test_cases` - sample data included
- Fill in `implementation_files` - no external references

### Template: current-task.md.hbs

The template provides structure but **MUST NOT** include fallback text like:
- "See spec file for details"
- "Refer to requirements"
- "To be determined"

Empty sections must be filled by Orchestrator or removed.

### Validation: validate-handover

The validation command enforces Information Isolation by:
- Scanning for forbidden reference patterns
- Validating all sections have substantive content
- Checking file paths are within Implementor scope

---

## Summary

| Principle | Implementation |
|-----------|----------------|
| **Complete Extraction** | Orchestrator extracts all requirements into handover |
| **No External References** | Handover never says "see X for details" |
| **Self-Contained** | Handover stands alone as the complete specification |
| **Strict Boundary** | Implementor cannot access spec/, manifest, or other tasks |
| **Validation Enforced** | CLI validates handovers before delivery |

**The handover IS the specification. There is no "see also."**
