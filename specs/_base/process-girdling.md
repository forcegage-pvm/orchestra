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
6. **Anti-Stub Detection**: Known stub patterns must be actively detected and rejected.
7. **Evidence-Based Judgment**: Every verification judgment must cite specific, verifiable evidence of functional behavior.

---

## 3) Anti-Stub Pattern Catalog

### 3.1 Definition of a Stub

A **stub** is an implementation that satisfies structural/compilation requirements but does not perform the required functional behavior. Stubs are characterized by:

- Returning placeholder values (hardcoded strings, empty collections, default objects)
- Missing integration with target APIs/libraries
- Containing TODO/FIXME/NotImplementedError markers
- Displaying placeholder UI text instead of dynamic content

### 3.2 Anti-Stub Patterns (Detection Rules)

**All patterns are BLOCKING with no escape. If detected, implementation must be fixed.**

| Pattern ID | Description                           | Detection Rule                                        | Severity                          |
| ---------- | ------------------------------------- | ----------------------------------------------------- | --------------------------------- | --------------------- | -------------- | -------- |
| STUB-001   | Placeholder text in UI                | `grep -rE '(placeholder                               | preview                           | coming soon)' <file>` | BLOCKING       |
| STUB-002   | NotImplementedError                   | `grep -rE '(NotImplementedError                       | throw.*not.*implemented)' <file>` | BLOCKING              |
| STUB-003   | Empty method body                     | `pattern: { }` or `=> null` or `=> {}`                | BLOCKING                          |
| STUB-004   | Hardcoded return values               | `return "..."` without dynamic logic                  | BLOCKING                          |
| STUB-005   | Missing target imports (bridge types) | Expected import not present (e.g., `BravenChartPlus`) | BLOCKING                          |
| STUB-006   | TODO/FIXME markers                    | `grep -rE '(TODO                                      | FIXME                             | XXX                   | HACK)' <file>` | BLOCKING |
| STUB-007   | Pass-through without transformation   | Method returns input unchanged                        | BLOCKING                          |

**Note**: These patterns apply to BOTH red-phase (tests) and green-phase (implementation). Tests with TODO markers or expecting placeholder text are incomplete tests.

### 3.3 Anti-Stub Quality Checks (Required)

For any task with bridge/renderer/adapter deliverables, verification criteria MUST include:

```json
{
  "quality_checks": [
    {
      "description": "No placeholder text patterns",
      "command": "! grep -rE '(placeholder|preview|coming soon)' <target_files>",
      "severity": "BLOCKING"
    },
    {
      "description": "No NotImplementedError",
      "command": "! grep -rE 'NotImplementedError|throw.*not.*implemented' <target_files>",
      "severity": "BLOCKING"
    },
    {
      "description": "No TODO/FIXME markers",
      "command": "! grep -rE '(TODO|FIXME|XXX|HACK)' <target_files>",
      "severity": "BLOCKING"
    },
    {
      "description": "No empty method bodies",
      "command": "! grep -rE '=>\\s*null|=>\\s*\\{\\s*\\}|\\{\\s*\\}' <target_files>",
      "severity": "BLOCKING"
    }
  ]
}
```

---

## 4) Roles & Responsibilities (RACI)

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

## 5) Deliverable ↔ Test Mapping (Enforced)

### 5.1 Deliverable Type System

Every deliverable MUST have an explicit `type` field. Schema requirements vary by type.

**Deliverable Types**:

| Type         | Description                          | Full Schema Required? |
| ------------ | ------------------------------------ | --------------------- |
| `bridge`     | Integrates with external library/API | YES                   |
| `renderer`   | Transforms data to visual output     | YES                   |
| `adapter`    | Adapts one interface to another      | YES                   |
| `converter`  | Transforms data format               | YES                   |
| `mapper`     | Maps between data structures         | YES                   |
| `translator` | Translates between formats/protocols | YES                   |
| `widget`     | UI component                         | NO                    |
| `service`    | Business logic service               | NO                    |
| `model`      | Data model/entity                    | NO                    |
| `util`       | Utility function/class               | NO                    |
| `test`       | Test file                            | NO                    |
| `config`     | Configuration file                   | NO                    |

**Single type per deliverable**: Each deliverable has one type. If implementation creates both a renderer and its test, use two separate deliverables.

### 5.2 Deliverable Registry Schema

**Full schema (bridge types)**: All fields required.

```json
{
  "id": "DEL-001",
  "file": "lib/src/agentic/services/chart_renderer.dart",
  "type": "renderer",
  "description": "Chart rendering bridge to BravenChartPlus",
  "test_file": "test/unit/agentic/services/chart_renderer_test.dart",
  "target_api": "BravenChartPlus",
  "behavioral_requirement": "Transforms ChartConfiguration to BravenChartPlus widget with mapped series/data"
}
```

**Minimal schema (non-bridge types)**: Only `file`, `type`, `description` required.

```json
{
  "id": "DEL-002",
  "file": "lib/src/agentic/widgets/chart_card.dart",
  "type": "widget",
  "description": "ChartCard widget with action bar"
}
```

### 5.3 Enforcement Point

**Decision**: Enforce at `prepare_task` time (handover preparation).

**Rationale**:

- `configure_sprint` may not have full detail on test file paths
- `prepare_task` is the last Orchestrator gate before implementation
- Allows red-phase tasks to create tests first, then green-phase handover references them

### 5.4 Validation Rules

| Rule ID     | Description                                        | Applies To        | Enforcement |
| ----------- | -------------------------------------------------- | ----------------- | ----------- |
| DEL-VAL-001 | `type` field is required                           | All deliverables  | BLOCKING    |
| DEL-VAL-002 | `test_file` is required                            | Bridge types only | BLOCKING    |
| DEL-VAL-003 | `target_api` is required                           | Bridge types only | BLOCKING    |
| DEL-VAL-004 | `behavioral_requirement` is required               | All deliverables  | BLOCKING    |
| DEL-VAL-005 | `test_file` must exist (validated by TDD workflow) | Bridge types only | BLOCKING    |

---

## 6) Behavior Evidence Taxonomy

### 6.1 Definition

**Behavior Evidence** is verifiable proof that a deliverable performs its required function, not just that it exists.

### 6.2 Evidence Types by Task Category

| Task Category  | Required Evidence                                              | Optional Evidence         |
| -------------- | -------------------------------------------------------------- | ------------------------- |
| INFRASTRUCTURE | Unit tests pass; target API imported and used                  | Integration test coverage |
| INTEGRATION    | Unit + integration tests pass; target API used in ≥N locations | Contract tests            |
| VISUAL         | Widget tests pass; snapshot/widget-tree assertion              | Screenshot comparison     |
| REFACTOR       | Existing tests still pass; behavior unchanged                  | Performance benchmarks    |

### 6.3 Evidence Hierarchy

1. **CRITICAL** (Must have at least one):
   - Dedicated unit test for the deliverable passes
   - Target API/library is imported and instantiated

2. **HIGH** (Should have):
   - Integration test asserts on output type (not just existence)
   - No anti-stub patterns detected

3. **MEDIUM** (Nice to have):
   - Widget-tree snapshot matches expected structure
   - Code coverage ≥80% for deliverable

### 6.4 Evidence Citation Format

When submitting verification judgment or code review, evidence MUST be cited:

```json
{
  "behavior_evidence": [
    {
      "deliverable_id": "DEL-001",
      "evidence_type": "unit_test_pass",
      "location": "test/unit/agentic/services/chart_renderer_test.dart",
      "assertion": "expect(result, isA<BravenChartPlus>())"
    },
    {
      "deliverable_id": "DEL-001",
      "evidence_type": "target_api_usage",
      "location": "lib/src/agentic/services/chart_renderer.dart:42",
      "code": "return BravenChartPlus(series: mappedSeries, ...)"
    }
  ]
}
```

---

## 7) Handover Acceptance Criteria Schema

### 7.1 Schema Requirements by Deliverable Type

Acceptance criteria schema requirements are **inherited from the referenced deliverable's type**.

**Full schema (references bridge-type deliverable)**: All fields required.

```json
{
  "id": "AC-001",
  "criterion": "ChartRenderer.render returns BravenChartPlus widget",
  "verification": "Unit test asserts isA<BravenChartPlus>()",
  "deliverable_ref": "DEL-001",
  "spec_ref": "T025",
  "behavior_type": "output_type",
  "expected_evidence": "test_pass + target_api_usage"
}
```

**Minimal schema (references non-bridge deliverable or no deliverable)**: Only `criterion` and `verification` required.

```json
{
  "id": "AC-002",
  "criterion": "ChartCard displays title from ChartConfiguration",
  "verification": "Widget test verifies title text"
}
```

### 7.2 Inheritance Rules

1. Parse acceptance criterion's `deliverable_ref`
2. Look up deliverable's `type`
3. If type is bridge/renderer/adapter/converter/mapper/translator → require `spec_ref`, `behavior_type`, `expected_evidence`
4. Otherwise → `criterion` + `verification` is sufficient

### 7.3 Behavior Types

| Type                  | Description                               | Required Evidence                  |
| --------------------- | ----------------------------------------- | ---------------------------------- |
| `output_type`         | Deliverable returns/renders specific type | Test assertion on type             |
| `data_transformation` | Deliverable transforms input to output    | Test assertion on transformation   |
| `api_integration`     | Deliverable calls external API            | Mock/stub test or integration test |
| `state_mutation`      | Deliverable modifies state                | Before/after state assertions      |
| `side_effect`         | Deliverable triggers observable effect    | Effect verification test           |

---

## 8) Enforcement Mechanisms

### 8.1 Pre-Handover Validation (System)

**Trigger**: `prepare_task` tool invocation

**Validation Rules**:

1. All deliverables have `type` field
2. Bridge-type deliverables have `test_file`, `target_api`, `behavioral_requirement`
3. Non-bridge deliverables have `behavioral_requirement`
4. Acceptance criteria referencing bridge-type deliverables have `spec_ref`, `behavior_type`, `expected_evidence`
5. Anti-stub quality checks are included in verification criteria for bridge-type deliverables

**On Failure**: Block handover; return validation errors to Orchestrator

### 8.2 Pre-Signal Validation (System)

**Trigger**: `signal_completion` tool invocation

**Validation Rules**:

1. All referenced test files exist
2. Anti-stub pattern scan passes (ALL patterns BLOCKING)
3. All tests pass

**On Failure**: Block signal; return specific failures. No escape mechanism.

### 8.3 Pre-Judgment Validation (System)

**Trigger**: `submit_verification_judgment` tool invocation

**Validation Rules**:

1. Verification checks have been executed
2. All BLOCKING checks passed
3. Anti-stub scan passed

**Note**: Evidence citation format is agent instruction guidance (Section 12), not system-validated schema.

**On Failure**: Block judgment; return validation errors

### 8.4 Pre-Approval Validation (System)

**Trigger**: Code review submission

**Validation Rules**:

1. Review summary has minimum length (current: 30 chars)
2. At least one file reviewed
3. No BLOCKING issues remain open

**Note**: Spec-to-code trace is agent instruction guidance (Section 12.3), not system-validated. Existing validation is sufficient.

**On Failure**: Block approval; require additional review notes

---

## 9) Required Changes (Process & Workflow)

### 9.1 Verification Design (Orchestrator)

**Change**: Add "Bridge Component Verification" checklist for tasks containing "bridge", "adapter", "renderer", "converter", "mapper", or "translator."

**Mandatory Verification Criteria**:

- **Structural**: Target type usage (e.g., `BravenChartPlus`, `ChartSeries`).
- **Behavioral**: Dedicated unit test for the bridge component.
- **Quality**: Minimum pattern matches for target API usage (to detect stubs).
- **Anti-Stub**: Include anti-stub quality checks from Section 3.3.

**Impact**:

- Prevents existence-only criteria from passing stubs.
- Forces behavior evidence at verification time.

### 9.2 Red Phase Coverage (Implementor / Orchestrator)

**Change**: Every deliverable requires a red-phase test file or a documented reason for exclusion (rare, requires Controller approval).

**Examples**:

- `ChartRenderer` → `test/unit/agentic/services/chart_renderer_test.dart`
- Assertions must check output type and transformation logic.

**Impact**:

- Stubs will fail red-phase tests automatically.

### 9.3 Handover Acceptance Criteria (Orchestrator)

**Change**: Handover acceptance criteria must specify the required transformation/output behavior.

**Required Language**:

- “`ChartRenderer.render` returns `BravenChartPlus` with mapped series/data.”
- “`_renderConfiguration` uses `ChartSeries` and renders non-placeholder output.”

**Impact**:

- Removes ambiguity and prevents misinterpretation of “bridge.”

### 9.4 Handover Review (Controller)

**Change**: Controller must validate that acceptance criteria explicitly map to spec requirements and include functional evidence requirements.

**Impact**:

- Blocks ambiguous handovers before implementation.

### 9.5 Pre-Verification Gate (System + Orchestrator)

**Change**: Add a pre-verification gate for ALL task categories (not just VISUAL/INTEGRATION):

| Category       | Required Pre-Verification                                |
| -------------- | -------------------------------------------------------- |
| INFRASTRUCTURE | Unit tests for all deliverables pass                     |
| INTEGRATION    | Unit + integration tests pass; target API usage verified |
| VISUAL         | Widget tests pass; widget-type assertions verified       |
| REFACTOR       | All existing tests pass; no behavioral regression        |

**Widget-Tree Assertion Decision**: For VISUAL/INTEGRATION tasks, require **type-check assertion** as the minimum:

- `expect(find.byType(BravenChartPlus), findsOneWidget)`
- Snapshot and pixel-diff are optional enhancements

**Impact**:

- Catch UI/renderer stubs before verify/complete.

### 9.6 Code Review (Controller)

**Change**: Require spec-to-code trace notes in review summary and evidence of behavior (not just file presence).

**Impact**:

- Prevents approval of stubs when earlier gates missed them.

---

## 10) Post-Detection Amendment Workflow (Feedback Loop)

### 10.1 Trigger

When a stub or non-functional implementation is detected at code review or later stages.

### 10.2 Amendment Actions

1. **Create Amendment Record**:
   - Document the escaped stub (file, pattern, detection point)
   - Link to task and deliverable

2. **Update Anti-Stub Catalog**:
   - Add newly detected stub pattern to Section 3.2
   - Create quality check rule for future detection

3. **Update Verification Criteria Template**:
   - Add structural/behavioral check that would have caught this stub
   - Add to bridge component checklist

4. **Retrospective Task**:
   - Create follow-up task to review similar components in codebase
   - Verify no other stubs exist with same pattern

### 10.3 Amendment Record Schema

```json
{
  "amendment_id": "AMEND-001",
  "detection_point": "code_review",
  "task_id": 9,
  "deliverable": "lib/src/agentic/services/chart_renderer.dart",
  "stub_pattern": "Placeholder text 'Chart preview' instead of BravenChartPlus widget",
  "root_cause": "Verification criteria checked existence only",
  "corrective_actions": [
    "Added STUB-001 pattern to anti-stub catalog",
    "Added BravenChartPlus structural check to bridge component template",
    "Added chart_renderer_test.dart requirement to red-phase coverage"
  ],
  "prevention_rule": "All bridge components require target_api structural check"
}
```

---

## 11) Workflow Changes (Step-by-Step)

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

## 12) Agent Instruction Updates (Concrete Rules)

### 12.1 Orchestrator Agent Instructions

**Add to `orchestra.orchestrator.agent.md`:**

```markdown
## Bridge Component Verification (MANDATORY)

When preparing tasks containing "bridge", "adapter", "renderer", "converter", "mapper", or "translator":

### Before `configure_sprint`:

1. Identify all bridge/adapter deliverables
2. For each, define:
   - `target_api`: The external library/type the bridge integrates with
   - `test_file`: Dedicated unit test file path
   - `behavioral_requirement`: What the bridge DOES, not what it IS

### Before `prepare_task`:

1. Verify red-phase created test file exists
2. Verify test includes assertion on output type: `expect(result, isA<TargetType>())`
3. Include acceptance criteria with:
   - `spec_ref`: Link to specification requirement
   - `expected_evidence`: What proves this works

### Before `submit_verification_judgment`:

1. Verify target API is imported in deliverable file
2. Verify target API is instantiated (not just imported)
3. Run anti-stub pattern scan (STUB-001 through STUB-007)
4. Cite specific behavior evidence per deliverable:
   - File and line where target API is used
   - Test assertion that proves output type

### Anti-Stub Checklist (run for all bridge components):

- [ ] No placeholder text patterns ("preview", "coming soon", "TODO")
- [ ] No NotImplementedError or equivalent
- [ ] No empty method bodies
- [ ] Target API imported AND used (not just imported)
- [ ] At least N usages of target API (where N ≥ 1 for simple bridges)
```

### 12.2 Implementor Agent Instructions

**Add to `orchestra.implementor.agent.md`:**

````markdown
## Stub Prevention (MANDATORY)

Before signaling completion:

### Self-Verification Checklist:

1. **Target API Usage**: For any bridge/adapter/renderer deliverable:
   - [ ] I have imported the target library
   - [ ] I have instantiated and returned the target type
   - [ ] My implementation transforms input data to the target format
   - [ ] I am NOT returning placeholder text, hardcoded values, or empty containers

2. **Test Validation**:
   - [ ] The red-phase test passes with my implementation
   - [ ] The test asserts on the OUTPUT TYPE, not just existence
   - [ ] If the test only checks existence, I will flag this to Orchestrator

3. **Anti-Stub Self-Check**:
   - [ ] Search my code for: "TODO", "FIXME", "placeholder", "preview", "coming soon"
   - [ ] If found, REMOVE or IMPLEMENT before signaling
   - [ ] Search for `NotImplementedError` - must not exist in shipped code

### Signal Completion Format:

When signaling, include implementation evidence:

```json
{
  "implementation_notes": {
    "deliverables_completed": [
      {
        "file": "lib/src/.../chart_renderer.dart",
        "target_api_usage": "BravenChartPlus instantiated at line 42",
        "test_passing": "chart_renderer_test.dart - all assertions pass"
      }
    ]
  }
}
```
````

````

### 12.3 Controller Agent Instructions

**Add to `orchestra.controller.agent.md`:**

```markdown
## Spec-to-Code Traceability (MANDATORY)

### Handover Review:
1. For each acceptance criterion, verify:
   - [ ] `spec_ref` points to actual specification requirement
   - [ ] `expected_evidence` is specific and verifiable
   - [ ] `behavioral_requirement` describes WHAT it does, not WHAT it is

2. Reject handovers that:
   - Use existence language ("ChartRenderer exists") without behavior ("ChartRenderer returns BravenChartPlus")
   - Missing test_file for bridge/adapter deliverables
   - Missing target_api for integration components

### Code Review:
1. For each deliverable, verify BEHAVIOR not EXISTENCE:
   - [ ] Open the file and READ the implementation
   - [ ] Verify target API is USED (not just imported)
   - [ ] Verify output is FUNCTIONAL (not placeholder)

2. Evidence Citation (REQUIRED in review summary):
   - For each bridge/adapter deliverable, cite:
     - Line number where target API is instantiated
     - Test assertion that verifies output type

3. Red Flags (require explanation or rejection):
   - File contains "preview", "placeholder", "TODO" text
   - Method returns hardcoded string/value
   - Target API imported but never instantiated
   - Test only checks `findsOneWidget` without type assertion

### Review Summary Format:
```json
{
  "spec_trace": [
    {
      "spec_ref": "T025",
      "requirement": "Chart rendering bridge to BravenChartPlus",
      "implementation": "chart_renderer.dart:42 - BravenChartPlus(...)",
      "test": "chart_renderer_test.dart:15 - expect(result, isA<BravenChartPlus>())"
    }
  ],
  "behavior_verified": true,
  "anti_stub_check": "PASSED - no placeholder patterns found"
}
````

````

---

## 13) Verification Criteria Templates

### 13.1 Bridge Component Template

```json
{
  "template_id": "bridge-component",
  "applies_when": ["bridge", "adapter", "renderer", "converter", "mapper", "translator"],
  "structural_checks": [
    {
      "description": "{{component_name}} class exists",
      "pattern": "class {{component_name}}",
      "path": "{{deliverable_path}}",
      "severity": "BLOCKING"
    },
    {
      "description": "{{component_name}} imports {{target_api}}",
      "pattern": "import.*{{target_api_package}}",
      "path": "{{deliverable_path}}",
      "severity": "BLOCKING"
    },
    {
      "description": "{{component_name}} uses {{target_api}}",
      "pattern": "{{target_api}}",
      "path": "{{deliverable_path}}",
      "min_matches": 1,
      "severity": "BLOCKING"
    }
  ],
  "behavioral_checks": [
    {
      "description": "{{component_name}} unit tests pass",
      "command": "{{test_command}} {{test_file}}",
      "severity": "BLOCKING"
    }
  ],
  "quality_checks": [
    {
      "description": "No placeholder text patterns",
      "command": "! grep -rE '(placeholder|preview|coming soon)' {{deliverable_path}}",
      "severity": "BLOCKING"
    },
    {
      "description": "No TODO/FIXME markers",
      "command": "! grep -rE '(TODO|FIXME|XXX)' {{deliverable_path}}",
      "severity": "MAJOR"
    },
    {
      "description": "No NotImplementedError",
      "command": "! grep -rE 'NotImplementedError' {{deliverable_path}}",
      "severity": "BLOCKING"
    }
  ]
}
````

### 13.2 Template Variable Reference

| Variable                 | Description         | Example                                        |
| ------------------------ | ------------------- | ---------------------------------------------- |
| `{{component_name}}`     | Class/function name | `ChartRenderer`                                |
| `{{deliverable_path}}`   | File path           | `lib/src/agentic/services/chart_renderer.dart` |
| `{{target_api}}`         | Target library type | `BravenChartPlus`                              |
| `{{target_api_package}}` | Import package path | `braven_chart_plus`                            |
| `{{test_file}}`          | Test file path      | `test/unit/.../chart_renderer_test.dart`       |
| `{{test_command}}`       | Test runner command | `flutter test`                                 |

---

## 14) Acceptance Criteria (Process)

1. Any task with a bridge/renderer deliverable has a dedicated unit test in the red phase.
2. Verification criteria include behavior-focused structural and behavioral checks.
3. Handover acceptance criteria explicitly require transformation/output behavior.
4. Pre-verification checks are executed for ALL task categories before verification judgment.
5. Controller reviews include spec-to-code traceability evidence with line-level citations.
6. Anti-stub quality checks are included for all bridge/adapter deliverables.
7. Post-detection amendments are created when stubs escape to later gates.
8. All enforcement mechanisms (Section 8) are implemented and active.

---

## 15) Implementation Notes (Phased Rollout)

### Phase 1: Agent Instructions (Immediate)

- Update `orchestra.orchestrator.agent.md` with Section 12.1
- Update `orchestra.implementor.agent.md` with Section 12.2
- Update `orchestra.controller.agent.md` with Section 12.3
- Add anti-stub pattern catalog (Section 3) to shared knowledge

### Phase 2: Schema Validation (Short-term)

- Implement deliverable type system in `prepare_task` handler
- Implement conditional schema validation based on deliverable type
- Add `type` field to deliverable schema

### Phase 3: Enforcement Mechanisms (Medium-term)

- Implement pre-handover validation (Section 8.1) with type-aware rules
- Implement pre-signal anti-stub scan (Section 8.2) - ALL patterns BLOCKING
- Update pre-judgment validation (Section 8.3) - agent instruction, not schema enforcement

### Phase 4: Templates & Tooling (Medium-term)

- Create verification criteria templates (Section 13)
- Add template auto-application based on deliverable type
- Add anti-stub pattern scan tooling

### Phase 5: Feedback Loop (Long-term)

- Implement amendment workflow (Section 10)
- Add pattern learning from escaped stubs
- Add retrospective task auto-generation

---

## 16) Resolved Questions

| Question                               | Decision                                                            | Rationale                                                                            |
| -------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Widget-tree assertion type?            | **Type-check assertion** (`expect(find.byType(X), findsOneWidget)`) | Balances coverage with implementation cost; snapshot/pixel-diff are optional         |
| Enforce test mapping when?             | **`prepare_task` time**                                             | Allows red-phase to create tests first; last Orchestrator gate before implementation |
| Sufficient evidence in reviews?        | **Agent instruction** (prose in summary)                            | Existing validation (30 chars + files_reviewed) is sufficient; trace is guidance     |
| How to identify bridge types?          | **Explicit `type` field** on deliverables                           | Forces Orchestrator to classify; clear trigger for schema requirements               |
| test_file/target_api required for all? | **Bridge types only**                                               | Non-bridge deliverables don't need full schema; reduces overhead                     |
| Anti-stub pattern severity?            | **ALL BLOCKING**                                                    | No escape mechanism; if detected, must be fixed. Applies to red and green phases.    |

---

## 17) Risk Mitigations Applied

| Original Risk                                             | Mitigation Applied                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| Pre-Handover blocking on full schema for all deliverables | Full schema required ONLY for bridge types; minimal schema for others |
| Pre-Signal blocking on TODO/FIXME with no escape          | ALL patterns BLOCKING (per design decision); no escape needed         |
| Pre-Judgment blocking on evidence JSON schema             | Evidence citation is agent instruction; no system schema validation   |
| Pre-Approval blocking on structured trace format          | Prose trace in summary; existing validation sufficient                |
| Deliverable schema too verbose for simple tasks           | Explicit type field; schema requirements vary by type                 |
| Acceptance criteria schema overkill                       | Inherits requirements from referenced deliverable type                |
| Test file TBD mechanism                                   | DISCARDED - TDD workflow already ensures tests exist                  |

---

## 18) Gap Analysis Summary

| Gap ID | Description                                     | Resolution                           | Section |
| ------ | ----------------------------------------------- | ------------------------------------ | ------- |
| GAP-1  | No enforcement of verification criteria quality | Pre-handover validation (type-aware) | 8.1     |
| GAP-2  | No anti-stub pattern definition                 | Anti-stub catalog (ALL BLOCKING)     | 3       |
| GAP-3  | Deliverable ↔ test mapping not enforced         | Deliverable type system              | 5       |
| GAP-4  | "Behavior evidence" undefined                   | Evidence taxonomy (agent guidance)   | 6       |
| GAP-5  | No runtime validation for non-visual tasks      | Extended pre-verify gate             | 9.5     |
| GAP-6  | Acceptance criteria lack schema                 | Type-inherited schema                | 7       |
| GAP-7  | No feedback loop for escaped stubs              | Amendment workflow                   | 10      |
| GAP-8  | Agent instructions too vague                    | Concrete rules with examples         | 12      |
| GAP-9  | No verification criteria templates              | Templates                            | 13      |
| GAP-10 | Open questions are blockers                     | Resolved questions                   | 16      |

---

## 19) References

- [docs/case-study/post-mortem-task-009-chartrenderer-stub.md](../docs/case-study/post-mortem-task-009-chartrenderer-stub.md)
- [docs/workflow/prepare.md](../docs/workflow/prepare.md)
- [docs/workflow/verify.md](../docs/workflow/verify.md)
- [docs/workflow/implement.md](../docs/workflow/implement.md)
- [docs/mcp-server-config.md](../docs/mcp-server-config.md)
- [extension/agents/orchestra.orchestrator.agent.md](../extension/agents/orchestra.orchestrator.agent.md)
- [extension/agents/orchestra.implementor.agent.md](../extension/agents/orchestra.implementor.agent.md)
- [extension/agents/orchestra.controller.agent.md](../extension/agents/orchestra.controller.agent.md)

---

## 20) Stub Hunter Mode (Experimental)

### 20.1 Background

Post-mortem analysis revealed a class of defects that structural checks cannot catch: **semantic stubs**. A semantic stub is code that:

- Compiles and runs without errors
- Passes structural/existence checks
- Shows an error dialog or notification instead of performing the actual work
- Returns default/empty values instead of computed results

Example: A file upload button that shows `showErrorMessage("File upload not supported")` instead of actually uploading files. This passes all structural checks (function exists, button is wired, handler is called) but functionally does nothing.

### 20.2 Root Cause Analysis

The same AI model that approved a stub can find the flaw when asked differently:

| Question Asked                 | Model Response      |
| ------------------------------ | ------------------- |
| "Is this implementation done?" | "Yes, looks good"   |
| "Why doesn't this work?"       | "Well, actually..." |

This is **attention direction**, not capability limitation. The solution is to flip the default assumption during verification.

### 20.3 Stub Hunter Mode Definition

Stub Hunter Mode is an **adversarial verification stance** where:

1. **Default assumption**: Code is GUILTY until proven INNOCENT
2. **Goal**: Find the ONE way this is broken, not confirm it's complete
3. **Mindset**: Pen-tester hunting for fraud, not reviewer approving work
4. **Reward structure**: Stubs FOUND is success; stubs ESCAPED is failure

### 20.4 Mandatory Stub Hunt Protocol

Both Orchestrator (verification) and Controller (code review) MUST complete these steps:

1. **User Action Trace**: Trace from user trigger → function call → actual work → result
2. **Semantic Stub Detection**: Check for error dialogs, default returns, log-and-return patterns
3. **API Integration Verification**: Verify API calls use parameters and process responses
4. **Spec Requirement Interrogation**: Document what code actually DOES vs. what spec requires
5. **Test Fraud Detection**: Verify tests exercise real code, not mocks/stubs

### 20.5 Automatic Rejection Criteria

**REJECT if ANY are true:**

1. Cannot trace feature from user trigger to working result
2. Success path shows error/warning to user
3. Feature "works" by returning empty/null/default
4. Tests pass but don't actually test the implementation
5. API responses are ignored or discarded
6. Code contains "TODO", "FIXME", "not implemented" strings
7. Functions claim to do work but actually log and return
8. Mock/stub in production code (not just tests)

### 20.6 Implementation

Stub Hunter Mode is implemented in:

- **Orchestrator Agent**: `extension/agents/orchestra.orchestrator.agent.md` (Stub Hunter Mode section)
- **Controller Agent**: `extension/agents/orchestra.controller.agent.md` (Stub Hunter Mode section)
- **Verification Prompt**: `extension/src/prompts/PromptBuilder.ts` (`buildVerifyPrompt()` method)

### 20.7 Status: EXPERIMENTAL

This is an experimental approach. Results should be monitored for:

1. Whether agents actually follow the protocol
2. Whether legitimate implementations are incorrectly rejected (false positives)
3. Whether the protocol successfully catches semantic stubs
4. Whether the verbosity is excessive or appropriate

Adjustments will be made based on real-world testing.
