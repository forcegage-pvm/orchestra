# Process Girdling (Base Spec)

**Status**: Draft (Base Spec)  
**Scope**: Process, workflow, and agent instruction changes to prevent stub/bridge escapes earlier than code review.  
**Related Case Study**: [docs/case-study/post-mortem-task-009-chartrenderer-stub.md](../docs/case-study/post-mortem-task-009-chartrenderer-stub.md)  
**Primary Goal**: Shift defect detection upstream (verification design, red phase, handover, and pre-verify gates) so “exists” is never mistaken for “works.”

---

## 1) Problem Statement

A placeholder stub implementation passed all gates because verification criteria and red-phase coverage focused on existence rather than behavior. Late-stage code review and visual verification detected the defect after task completion, causing downstream blockage and eroding trust in verification.

**Key Failure Pattern**:

- Bridge/adapter/renderer components are high-risk because stub implementations can satisfy existence checks and compile but do no real work.

---

## 2) Principles (Process Guardrails)

1. **Behavior over Existence**: Structural checks must prove functional intent (target types, key API usage), not just class/file presence.
2. **Deliverable ↔ Test Mapping**: Every deliverable requires a red-phase test that would fail against a stub.
3. **Traceable Acceptance**: Handover acceptance criteria must explicitly reference the required behavior and target integration.
4. **Early Visual/Integration Assertions**: UI/renderer tasks must add widget-tree or output-type assertions before verification judgment.
5. **No Trust Cascade**: Each gate validates independent evidence; upstream success is not assumed.

---

## 3) Roles & Responsibilities (RACI)

### Orchestrator

**Accountable** for verification design, handover acceptance criteria, and enforcing deliverable/test mapping.

- Must include behavior-focused checks for bridge components.
- Must require red-phase coverage for every deliverable.

### Implementor

**Responsible** for implementing functional behavior and writing tests (when assigned to red/green phases).

- Must not ship stubs; must provide evidence that output types and transformations are real.

### Controller

**Accountable** for review rigor and spec-to-code traceability.

- Must verify that behavior is implemented (not just existence).
- Must flag missing tests or missing behavioral evidence.

### System

**Responsible** for enforcing automated gates.

- Must add checks that fail on stubs when possible (e.g., required pattern usage and targeted tests).

---

## 4) Required Changes (Process & Workflow)

### 4.1 Verification Design (Orchestrator)

**Change**: Add “Bridge Component Verification” checklist for tasks containing “bridge”, “adapter”, “renderer”, “converter”, “mapper”, or “translator.”

**Mandatory Verification Criteria**:

- **Structural**: Target type usage (e.g., `BravenChartPlus`, `ChartSeries`).
- **Behavioral**: Dedicated unit test for the bridge component.
- **Quality**: Minimum pattern matches for target API usage (to detect stubs).

**Impact**:

- Prevents existence-only criteria from passing stubs.
- Forces behavior evidence at verification time.

### 4.2 Red Phase Coverage (Implementor / Orchestrator)

**Change**: Every deliverable requires a red-phase test file or a documented reason for exclusion (rare, requires Controller approval).

**Examples**:

- `ChartRenderer` → `test/unit/agentic/services/chart_renderer_test.dart`
- Assertions must check output type and transformation logic.

**Impact**:

- Stubs will fail red-phase tests automatically.

### 4.3 Handover Acceptance Criteria (Orchestrator)

**Change**: Handover acceptance criteria must specify the required transformation/output behavior.

**Required Language**:

- “`ChartRenderer.render` returns `BravenChartPlus` with mapped series/data.”
- “`_renderConfiguration` uses `ChartSeries` and renders non-placeholder output.”

**Impact**:

- Removes ambiguity and prevents misinterpretation of “bridge.”

### 4.4 Handover Review (Controller)

**Change**: Controller must validate that acceptance criteria explicitly map to spec requirements and include functional evidence requirements.

**Impact**:

- Blocks ambiguous handovers before implementation.

### 4.5 Pre-Verification Gate (System + Orchestrator)

**Change**: Add a pre-verification gate for VISUAL/INTEGRATION tasks:

- Widget-tree assertion or snapshot-based validation (or output-type checks).
- Must be executed before verification judgment is allowed.

**Impact**:

- Catch UI/renderer stubs before verify/complete.

### 4.6 Code Review (Controller)

**Change**: Require spec-to-code trace notes in review summary and evidence of behavior (not just file presence).

**Impact**:

- Prevents approval of stubs when earlier gates missed them.

---

## 5) Workflow Changes (Step-by-Step)

1. **Configure Sprint**

- Orchestrator must add verification criteria using Bridge Component Checklist when applicable.

2. **Red Phase**

- Implementor must create tests for each deliverable with failure against stubs.
- Orchestrator checks for coverage gaps before green phase starts.

3. **Prepare Handover**

- Orchestrator includes behavior-specific acceptance criteria and required target type usage.

4. **Handover Review**

- Controller rejects handovers missing behavioral acceptance criteria or test mapping.

5. **Implementation**

- Implementor validates functional behavior with tests and/or widget assertions.

6. **Pre-Verification Gate**

- System enforces visual/integration checks for relevant tasks.

7. **Verification & Judgment**

- Orchestrator validates behavior evidence and cross-checks spec-to-code mapping.

8. **Code Review**

- Controller verifies behavior evidence and confirms no stubs.

---

## 6) Agent Instruction Updates (Draft)

### Orchestrator Agent

- Add a **Bridge Component Checklist** (required):
  - Behavioral tests exist for each deliverable.
  - Structural checks include target API usage.
  - Handover acceptance criteria include transformation/output requirements.
- Require explicit spec-to-code mapping notes when submitting verification judgment.

### Implementor Agent

- Prohibit stub implementations for bridge/renderer components.
- Require tests that assert on final widget/output types and data transformations.
- Require evidence of target API usage in implementation notes.

### Controller Agent

- Enforce spec-to-code traceability in reviews.
- Block approvals when behavior is not demonstrated or tests are missing.
- Require mention of functional evidence in review summaries.

---

## 7) Acceptance Criteria (Process)

1. Any task with a bridge/renderer deliverable has a dedicated unit test in the red phase.
2. Verification criteria include behavior-focused structural and behavioral checks.
3. Handover acceptance criteria explicitly require transformation/output behavior.
4. Visual/integration assertions are executed before verification judgment on VISUAL/INTEGRATION tasks.
5. Controller reviews include spec-to-code traceability evidence.

---

## 8) Implementation Notes (Future Work)

- Extend verification criteria templates to support “bridge component” rules.
- Add enforcement in orchestration tooling to block handovers missing deliverable/test mapping.
- Add lint/quality rule for “placeholder text” detection in renderer outputs.
- Add UI-level snapshot verification harness for Flutter widget-tree checks.

---

## 9) Open Questions

- What is the minimal required widget-tree assertion for renderer tasks (snapshot, type-check, or pixel diff)?
- Should “deliverable ↔ test mapping” be enforced at configure_sprint time or prepare_task time?
- What constitutes sufficient evidence in Controller review notes?

---

## 10) References

- [docs/case-study/post-mortem-task-009-chartrenderer-stub.md](../docs/case-study/post-mortem-task-009-chartrenderer-stub.md)
- [docs/workflow/prepare.md](../docs/workflow/prepare.md)
- [docs/workflow/verify.md](../docs/workflow/verify.md)
- [docs/workflow/implement.md](../docs/workflow/implement.md)
- [docs/mcp-server-config.md](../docs/mcp-server-config.md)
