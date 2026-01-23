# Orchestra Documentation Audit & Gap Analysis

**Date**: 2025-12-04  
**Scope**: Bible vs Specs vs Template Docs  
**Purpose**: Identify disparities, gaps, and reconciliation needs

---

## Executive Summary

After comprehensive review of all Orchestra documentation, I found:

| Category                          | Status | Count       |
| --------------------------------- | ------ | ----------- |
| **Aligned (no changes needed)**   | ✅     | 12 areas    |
| **Bible needs update from Specs** | ⬆️     | 5 items     |
| **Specs need update from Bible**  | ⬇️     | 14 items    |
| **Conflicts requiring decision**  | ⚠️     | 8 items     |
| **Outdated/Deprecated specs**     | 🗑️     | 6 documents |

**Key Finding**: The Bible (v0.7.0) is more current and authoritative, but several spec documents contain historical decisions and details not yet backported to the Bible.

---

## Document Inventory

### Source of Truth: The Bible

| Document                  | Version | Status                              |
| ------------------------- | ------- | ----------------------------------- |
| `docs/orchestra-bible.md` | v0.7.0  | ✅ Most current - **AUTHORITATIVE** |

### Spec Folder Structure

```
docs/
├── orchestra-bible.md        ← AUTHORITATIVE (moved from spec/)
├── readme.md                  ← Outdated index
├── tasks.md                   ← Unknown status
├── implementation-plan.md     ← Partially outdated
├── 01-product/                ← May contain historical decisions
├── 02-architecture/           ← May contain historical decisions
├── 03-components/             ← Needs sync with Bible
├── 04-processes/              ← Needs sync with Bible
├── 05-research/               ← Historical reference only
├── 06-appendices/             ← May duplicate Bible
└── implementation/            ← Phase 1 complete, Phase 2 planning
```

### Template Documentation

| Document                        | Purpose           | Status                     |
| ------------------------------- | ----------------- | -------------------------- |
| `docs/TEMPLATE_REGISTRY.md`     | Template mapping  | ✅ Current, detailed       |
| `docs/TEMPLATE_ARCHITECTURE.md` | HBS→Format design | ⚠️ Needs Bible integration |

### New Documentation Since Audit

- `specs/007-interface-contract-validation/*` (2026-01-22) — New feature documentation set (plan, research, data model, contracts, quickstart). Review for Bible integration and cross-links once stabilized.

---

## Section-by-Section Analysis

### 1. FOLDER STRUCTURE

#### Bible Section 6.1 vs `03-components/folder-structure.md`

| Aspect                 | Bible                                                     | Spec | Verdict    |
| ---------------------- | --------------------------------------------------------- | ---- | ---------- |
| Root files             | `manifest.yaml`, `progress.yaml` in `.orchestrator-only/` | Same | ✅ Aligned |
| Orchestrator-only path | `.orchestrator-only/verification/`                        | Same | ✅ Aligned |
| Implementor paths      | `handovers/`, `signals/`, `feedback/`                     | Same | ✅ Aligned |
| Common folder          | `common/scripts/`, `common/templates/`                    | Same | ✅ Aligned |
| Processes folder       | `orchestrator/processes/`                                 | Same | ✅ Aligned |

**~~GAP: Access Control Matrix~~** ✅ RESOLVED (2025-12-04)

| Item                       | Resolution                                        |
| -------------------------- | ------------------------------------------------- |
| `manifest.yaml` visibility | ✅ **RESOLVED** - Hidden in `.orchestrator-only/` |
| `progress.yaml` visibility | ✅ **RESOLVED** - Hidden in `.orchestrator-only/` |

**Decision Made**: `manifest.yaml` and `progress.yaml` are **hidden from implementor**.

- Location: `.orchestra/orchestrator/.orchestrator-only/manifest.yaml`
- Rationale: Implementor should only see current task via handover, not full sprint scope
- Bible updated: Sections 0.4, 6.1, and G.2 corrected to show hidden location

**Recommendation**: ⬇️ Fix Bible Section 6.3 to say "Orchestrator only" for manifest and progress.

---

### 2. FILE SPECIFICATIONS

#### Bible Section 6.3 vs `03-components/file-specifications.md`

| Aspect                   | Bible         | Spec                                 | Verdict                   |
| ------------------------ | ------------- | ------------------------------------ | ------------------------- |
| manifest.yaml schema     | Basic outline | **Detailed schema with all fields**  | ⬆️ Bible needs enrichment |
| progress.yaml schema     | Basic outline | **Detailed schema with metrics**     | ⬆️ Bible needs enrichment |
| verification.yaml schema | Basic outline | **Full schema with all check types** | ⬆️ Bible needs enrichment |

**GAP: Schema Details**

The Spec's `file-specifications.md` has MUCH more detailed schemas:

```yaml
# Example from Spec (not in Bible):
metrics:
  first_attempt_passes: 8
  total_attempts: 10
  test_count: 256
  baseline_tests: 262
```

```yaml
# Example from Spec - verification detail (not in Bible):
adversarial_checks:
  - id: "real_integration"
    description: "Normalizer is actually called, not just imported"
    severity: "BLOCKING"
    check: "grep for actual function invocation in pipeline"
```

**Recommendation**:

- ⬆️ Backport detailed schemas from Spec to Bible Appendix or new Section 6.5
- Keep Spec as "extended reference" for field-level detail

---

### 3. TEMPLATE SYSTEM

#### Bible Section 6.5 vs `docs/TEMPLATE_REGISTRY.md` vs `docs/TEMPLATE_ARCHITECTURE.md`

| Aspect            | Bible               | TEMPLATE_REGISTRY           | TEMPLATE_ARCHITECTURE  |
| ----------------- | ------------------- | --------------------------- | ---------------------- |
| Template location | `common/templates/` | `common/templates/`         | `common/templates/`    |
| Template format   | HBS (mentioned)     | HBS explicit                | HBS detailed           |
| Format decisions  | Brief table         | **Full decision matrix**    | Architecture rationale |
| Output mapping    | Brief table         | **Complete command→output** | Workflow diagrams      |
| Anti-patterns     | Not included        | **Detailed anti-patterns**  | Not included           |

**MAJOR GAP: Template Registry not referenced in Bible**

The Bible (Section 6.5) says:

> See `docs/TEMPLATE_REGISTRY.md` for complete template mapping

But this creates an external dependency. The Registry contains critical information:

1. **Command → Output Mapping** (missing from Bible):

   ```
   orchestra init → orchestra.yaml, manifest.yaml, AGENT_README.md
   orchestra prepare → current-task.md, task-context.yaml
   orchestra verify → verification-report.yaml
   ```

2. **Format Decision Matrix** (in Bible §6.5.3):
   - YAML = Agent fills out
   - Markdown = Agent reads
   - Template source = Implementation-specific

3. **Implementation Status** (missing from Bible):
   - `agent-readme` - **MISSING** (HIGH PRIORITY)
   - `completion-signal` - **BUG** (generated by prepare, shouldn't be)
   - `manifest` - Needs SpecKit format update

**~~Conflict: Template naming conventions~~** ✅ RESOLVED (2025-12-04)

| Resolution                                                                  |
| --------------------------------------------------------------------------- |
| Bible now uses **abstract template names** without file extensions          |
| Implementation chooses extensions (`.hbs`, `.md.template`, `.jinja2`, etc.) |
| Bible updated: Section 6.5.2 registry table now extension-agnostic          |

**Remaining Recommendation**:

- ⬇️ Update `03-components/templates.md` to match abstract naming
- ⬆️ Add implementation status table to Bible or merge Registry into Bible

---

### 4. SCRIPTS

#### Bible Section 8 vs `03-components/scripts.md`

| Aspect              | Bible         | Spec        | Verdict    |
| ------------------- | ------------- | ----------- | ---------- |
| Script inventory    | Complete list | Same list   | ✅ Aligned |
| Mandatory matrix    | Section 7.3   | Duplicated  | ✅ Aligned |
| Script attributes   | Full detail   | Same detail | ✅ Aligned |
| Lifecycle positions | Full detail   | Same detail | ✅ Aligned |

**GAP: `validate-verification-paths` script**

| Document     | Status              |
| ------------ | ------------------- |
| Bible        | **NOT MENTIONED**   |
| `scripts.md` | **Fully specified** |

The Spec includes `validate-verification-paths` as a MANDATORY script:

> After creating verification YAML, before handover begins (Process 1, Step 6a)

**Recommendation**: ⬆️ Add this script to Bible Section 8 and update Section 7.3 matrix.

---

### 5. TASK LIFECYCLE

#### Bible Section 7 vs `04-processes/task-lifecycle.md`

| Aspect            | Bible    | Spec      | Verdict    |
| ----------------- | -------- | --------- | ---------- |
| Lifecycle diagram | Complete | Duplicate | ✅ Aligned |
| Phase definitions | Complete | Duplicate | ✅ Aligned |
| Script mappings   | Complete | Duplicate | ✅ Aligned |

**Verdict**: `task-lifecycle.md` is a **pure duplicate** of Bible Section 7.

**Recommendation**:

- 🗑️ Mark as deprecated OR
- Convert to "Quick Reference Card" format

---

### 6. VERIFICATION PROTOCOL

#### Bible Section 9 vs `04-processes/verification-protocol.md`

| Aspect                | Bible       | Spec                  | Verdict              |
| --------------------- | ----------- | --------------------- | -------------------- |
| Verification layers   | Section 9.1 | Not explicit          | Bible more complete  |
| Gate vs Hidden        | Section 9.2 | Step-by-step workflow | ⚠️ Different focus   |
| Designing criteria    | Section 9.3 | Not included          | Bible more complete  |
| Preventing gaming     | Section 9.4 | Not included          | Bible more complete  |
| Script execution      | Brief       | **Detailed commands** | Spec more actionable |
| Evidence requirements | Brief       | **Explicit protocol** | Spec more actionable |

**GAP: Severity levels**

| Document | Severity Levels              | Decision Rules       |
| -------- | ---------------------------- | -------------------- |
| Bible    | Not explicitly defined       | Not included         |
| Spec     | BLOCKING, MAJOR, MINOR, INFO | Full rules in Step 8 |

The Spec has:

```
For each check:
  IF severity == BLOCKING and status == FAIL:
    Task FAILS
  IF severity == MAJOR and status == FAIL:
    Task FAILS
  IF severity == MINOR and status == FAIL:
    Task PASSES with note
```

**Recommendation**:

- ⬆️ Backport severity levels and decision rules to Bible Section 9
- ⬇️ Update Spec to reference Bible for principles, keep workflow detail

---

### 7. VISUAL VERIFICATION

#### Bible vs `04-processes/visual-verification.md`

| Aspect              | Bible                      | Spec                       |
| ------------------- | -------------------------- | -------------------------- |
| Visual verification | Mentioned in examples      | **Full protocol document** |
| Screenshot workflow | Brief mention in templates | **Detailed step-by-step**  |
| Chrome DevTools MCP | Not mentioned              | **Explicit tool usage**    |
| flutter_agent.py    | Not mentioned              | **Full command reference** |

**MAJOR GAP**: Visual verification is a significant process not adequately covered in Bible.

**Recommendation**:

- ⬆️ Add Bible Section 9.5 "Visual Verification" with summary
- Keep Spec `visual-verification.md` as extended reference

---

### 8. IMPLEMENTATION PLAN

#### Bible vs `implementation-plan.md` vs `implementation/`

| Aspect            | Bible                 | implementation-plan.md | implementation/       |
| ----------------- | --------------------- | ---------------------- | --------------------- |
| Phase roadmap     | Not included          | 4 phases outlined      | Detailed per phase    |
| CLI commands      | References in scripts | Listed                 | Full spec per command |
| MCP tools         | Not included          | Listed                 | Phase 2 spec exists   |
| VS Code extension | Not included          | Planned                | Not started           |

**Status Assessment**:

| Phase              | implementation-plan.md | implementation/phase-X/ | Reality     |
| ------------------ | ---------------------- | ----------------------- | ----------- |
| Phase 1: CLI       | "Not Started"          | ✅ Complete             | ✅ Complete |
| Phase 2: MCP       | "Not Started"          | Has readme, tasks.md    | In planning |
| Phase 3: Extension | "Not Started"          | Not created             | Not started |
| Phase 4: RAG       | "Not Started"          | Not created             | Not started |

**Recommendation**:

- ⬇️ Update `implementation-plan.md` status (Phase 1 complete)
- Keep `implementation/` as source of truth for implementation details
- Bible should not duplicate implementation specifics

---

### 9. TEMPLATE REGISTRY ISSUES

#### Registry's Own Issues (Internal Inconsistencies)

| Issue                       | Severity | Details                                          |
| --------------------------- | -------- | ------------------------------------------------ |
| Missing `agent-readme.hbs`  | HIGH     | Agents have no onboarding document               |
| `completion-signal.hbs` bug | HIGH     | Generated by prepare (should be reference only)  |
| `manifest.hbs` format       | HIGH     | Needs SpecKit format update                      |
| Bible reference incorrect   | MEDIUM   | Points to `docs/ORCHESTRA_BIBLE.md` (wrong path) |

**From Registry Implementation Status**:

```
| Template | Source Exists | Generation Works | Format Correct |
|----------|---------------|------------------|----------------|
| agent-readme.hbs | ❌ | ❌ | N/A |
| manifest.hbs | ⚠️ | ⚠️ | ❌ |
| completion-signal.hbs | ✅ | ❌ | ✅ |
```

---

## Outdated/Deprecated Documents

| Document                                   | Status                                         | Action                                   |
| ------------------------------------------ | ---------------------------------------------- | ---------------------------------------- |
| `spec/readme.md`                           | Points to 21 documents; Bible consolidates all | 🗑️ Deprecate or update as Bible intro    |
| `spec/tasks.md`                            | Unknown purpose                                | 🗑️ Review and likely remove              |
| `04-processes/task-lifecycle.md`           | Pure duplicate of Bible Section 7              | 🗑️ Deprecate or convert to quick ref     |
| `04-processes/handover-lifecycle.md`       | Subset of Bible                                | 🗑️ Merge into Bible or deprecate         |
| Parts of `01-product/`, `02-architecture/` | May contain historical decisions               | 📋 Review for unique content             |
| `05-research/`                             | Historical case studies                        | 📋 Keep as reference, mark as historical |

---

## Conflicts Requiring Decision

### Conflict 1: manifest.yaml visibility

- **Bible Section 6.3**: "Visibility: Public (both roles)"
- **Bible Section 4.2**: "You MUST NOT read: The manifest.yaml file"
- **Spec folder-structure.md**: "Orchestrator only"

**Decision**: Manifest is **Orchestrator only**. Fix Bible 6.3.

### Conflict 2: Template naming convention

- **Bible Appendix D**: `handover-template.md`, `signal-template.md`
- **TEMPLATE_REGISTRY**: `handover.hbs`, `completion-signal.hbs`
- **Spec templates.md**: `current-task.md.template`

**Decision**: Standardize on `.hbs` per TEMPLATE_REGISTRY.

### ~~Conflict 3~~: Signal file location ✅ RESOLVED

- Using `.yaml` extension per resolved decision

### ~~Conflict 4~~: Current task file naming ✅ RESOLVED (2025-12-04)

- **Resolution**: Single-file model adopted
- `current-task.md` - Current task requirements (overwritten each task)
- `task-context.md` - Background and history
- Git history serves as archive
- Bible updated: Sections 0.5, 4.2, 6.1, 6.5.2, 7.2, 8.2, Appendix E

### ~~Conflict 5~~: Handover archive location ✅ RESOLVED (2025-12-04)

- **Resolution**: No explicit archiving needed - git history is the archive
- Previous content is overwritten when new task prepared
- If repo management process is followed, git provides full audit trail

### ~~Conflict 6~~: orchestra.yaml existence ✅ RESOLVED (2025-12-04)

- **Resolution**: Added new Bible Section 12 "Configuration" documenting `orchestra.yaml`
- Location: `.orchestra/orchestra.yaml`
- Full schema documented with all options
- Replaces environment variables for configuration
- Section 13 renumbered (was 12 - Adaptation Guidelines)

### ~~Conflict 7~~: SpecKit integration ✅ RESOLVED (2025-12-04)

- **Resolution**: Bible now mentions SpecKit as "current default" while remaining format-agnostic
- Added new section 6.4.2 "Format Agnosticism" explaining:
  - Orchestra is specification-format agnostic
  - SpecKit is the current default implementation
  - Future versions will support other formats
- Bible does NOT hard-code SpecKit dependency

### ~~Conflict 8~~: CLI command names ✅ RESOLVED (2025-12-04)

- **Resolution**: Added "CLI Command Mapping" section to Bible §8
- Table shows abstract script names → CLI subcommands
- Usage examples included
- Note clarifies CLI is one implementation, others may differ
- Bible remains abstract while providing practical reference

---

## Recommendations Summary

### High Priority (Do First)

| Action                                            | Type              | Status                 |
| ------------------------------------------------- | ----------------- | ---------------------- |
| 1. Fix Bible manifest/progress visibility         | ⬇️ Bible fix      | ✅ DONE                |
| 2. ~~Add `validate-verification-paths` to Bible~~ | ~~⬆️ Backport~~   | ✅ REMOVED - Redundant |
| 3. Add severity levels to Bible                   | ⬆️ Backport       | ⏳ Pending             |
| 4. Fix `current-task.md` naming in Bible          | ⬇️ Bible fix      | ✅ DONE                |
| 5. Add `orchestra.yaml` to Bible                  | ⬆️ Add            | ✅ DONE                |
| 6. Create `agent-readme` template                 | 🔧 Implementation | ⏳ Pending             |
| 7. Fix `completion-signal` generation             | 🔧 Implementation | ⏳ Pending             |

### Medium Priority

| Action                                      | Type         | Status         |
| ------------------------------------------- | ------------ | -------------- |
| 8. Add Visual Verification section to Bible | ⬆️ Backport  | ⏳ Pending     |
| 9. Abstract template naming (no extensions) | ⬇️ Bible fix | ✅ DONE        |
| 10. Update implementation-plan.md status    | ⬇️ Update    | ⏳ Pending     |
| 11. Add detailed schemas to Bible           | ⬆️ Backport  | ⏳ Pending     |
| 12. Merge TEMPLATE_REGISTRY key sections    | ⬆️ Merge     | Into Bible 6.5 |

### Low Priority

| Action                                 | Type       | Details                                   |
| -------------------------------------- | ---------- | ----------------------------------------- |
| 13. Mark deprecated docs               | 🗑️ Cleanup | task-lifecycle.md, etc.                   |
| 14. Review 01-product, 02-architecture | 📋 Audit   | Extract unique decisions                  |
| 15. Update spec/readme.md              | 🗑️ Cleanup | Either deprecate or update as Bible intro |

---

## Appendix: File-by-File Status

| File                                         | Status                | Action                         |
| -------------------------------------------- | --------------------- | ------------------------------ |
| `docs/orchestra-bible.md`                    | ✅ Authoritative      | Minor fixes needed             |
| `spec/readme.md`                             | 🗑️ Outdated           | Deprecate or update            |
| `spec/tasks.md`                              | ❓ Unknown            | Review                         |
| `spec/implementation-plan.md`                | ⚠️ Partially outdated | Update status                  |
| `spec/01-product/*`                          | 📋 Unchecked          | Review for unique content      |
| `spec/02-architecture/*`                     | 📋 Unchecked          | Review for unique content      |
| `spec/03-components/folder-structure.md`     | ⚠️ Has conflicts      | Fix visibility matrix          |
| `spec/03-components/file-specifications.md`  | ✅ Good detail        | Backport to Bible              |
| `spec/03-components/scripts.md`              | ✅ Good detail        | Backport new script            |
| `spec/03-components/templates.md`            | ⚠️ Naming conflict    | Update to .hbs                 |
| `spec/04-processes/task-lifecycle.md`        | 🗑️ Duplicate          | Deprecate                      |
| `spec/04-processes/verification-protocol.md` | ✅ Good detail        | Backport severity levels       |
| `spec/04-processes/visual-verification.md`   | ✅ Unique content     | Add summary to Bible           |
| `spec/04-processes/failure-handling.md`      | 📋 Unchecked          | Review                         |
| `spec/04-processes/handover-lifecycle.md`    | 📋 Unchecked          | Review                         |
| `spec/05-research/*`                         | 📋 Historical         | Keep as reference              |
| `spec/06-appendices/*`                       | 📋 Unchecked          | May duplicate Bible appendices |
| `spec/implementation/readme.md`              | ✅ Current            | Phase 1 complete               |
| `spec/implementation/phase-1-cli/*`          | ✅ Current            | Implementation reference       |
| `spec/implementation/phase-2-mcp/*`          | ✅ Current            | Planning docs                  |
| `docs/TEMPLATE_REGISTRY.md`                  | ✅ Authoritative      | Merge key parts to Bible       |
| `docs/TEMPLATE_ARCHITECTURE.md`              | ✅ Good design doc    | Reference from Bible           |

---

## Next Steps

1. **Human Decision**: Resolve the 8 conflicts listed above
2. **Apply High Priority fixes** to Bible
3. **Backport unique content** from Specs to Bible
4. **Mark deprecated documents** with header notices
5. **Create implementation tasks** for missing templates

---

_Generated by documentation audit on 2025-12-04_
