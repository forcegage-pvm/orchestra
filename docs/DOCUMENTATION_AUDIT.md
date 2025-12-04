# Orchestra Documentation Audit & Gap Analysis

**Date**: 2025-12-04  
**Scope**: Bible vs Specs vs Template Docs  
**Purpose**: Identify disparities, gaps, and reconciliation needs

---

## Executive Summary

After comprehensive review of all Orchestra documentation, I found:

| Category | Status | Count |
|----------|--------|-------|
| **Aligned (no changes needed)** | ✅ | 12 areas |
| **Bible needs update from Specs** | ⬆️ | 5 items |
| **Specs need update from Bible** | ⬇️ | 14 items |
| **Conflicts requiring decision** | ⚠️ | 8 items |
| **Outdated/Deprecated specs** | 🗑️ | 6 documents |

**Key Finding**: The Bible (v0.7.0) is more current and authoritative, but several spec documents contain historical decisions and details not yet backported to the Bible.

---

## Document Inventory

### Source of Truth: The Bible
| Document | Version | Status |
|----------|---------|--------|
| `00-orchestra-bible.md` | v0.7.0 | ✅ Most current - **AUTHORITATIVE** |

### Spec Folder Structure
```
spec/
├── 00-orchestra-bible.md     ← AUTHORITATIVE
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
| Document | Purpose | Status |
|----------|---------|--------|
| `docs/TEMPLATE_REGISTRY.md` | Template mapping | ✅ Current, detailed |
| `docs/TEMPLATE_ARCHITECTURE.md` | HBS→Format design | ⚠️ Needs Bible integration |

---

## Section-by-Section Analysis

### 1. FOLDER STRUCTURE

#### Bible Section 6.1 vs `03-components/folder-structure.md`

| Aspect | Bible | Spec | Verdict |
|--------|-------|------|---------|
| Root files | `manifest.yaml`, `progress.yaml` at root | Same | ✅ Aligned |
| Orchestrator-only path | `.orchestrator-only/verification/` | Same | ✅ Aligned |
| Implementor paths | `handovers/`, `signals/`, `feedback/` | Same | ✅ Aligned |
| Common folder | `common/scripts/`, `common/templates/` | Same | ✅ Aligned |
| Processes folder | `orchestrator/processes/` | Same | ✅ Aligned |

**GAP: Access Control Matrix**

| Item | Bible | Spec | Action |
|------|-------|------|--------|
| `manifest.yaml` visibility | "Public (both roles)" in 6.3 | "Orchestrator only" in matrix | ⚠️ **CONFLICT** - Spec says Orchestrator-only, Bible says Public |
| `progress.yaml` visibility | "Public (both roles)" in 6.3 | "Orchestrator only" in matrix | ⚠️ **CONFLICT** - Same issue |

**Decision Needed**: Is `manifest.yaml` accessible to Implementor or not?
- Bible Section 4.2 (Implementor Scope Statement) says: "You MUST NOT read: The `manifest.yaml` file"
- This aligns with the Spec's matrix
- Bible Section 6.3 ("Visibility: Public") is **WRONG**

**Recommendation**: ⬇️ Fix Bible Section 6.3 to say "Orchestrator only" for manifest and progress.

---

### 2. FILE SPECIFICATIONS

#### Bible Section 6.3 vs `03-components/file-specifications.md`

| Aspect | Bible | Spec | Verdict |
|--------|-------|------|---------|
| manifest.yaml schema | Basic outline | **Detailed schema with all fields** | ⬆️ Bible needs enrichment |
| progress.yaml schema | Basic outline | **Detailed schema with metrics** | ⬆️ Bible needs enrichment |
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

| Aspect | Bible | TEMPLATE_REGISTRY | TEMPLATE_ARCHITECTURE |
|--------|-------|-------------------|----------------------|
| Template location | `common/templates/` | `common/templates/` | `common/templates/` |
| Template format | HBS (mentioned) | HBS explicit | HBS detailed |
| Format decisions | Brief table | **Full decision matrix** | Architecture rationale |
| Output mapping | Brief table | **Complete command→output** | Workflow diagrams |
| Anti-patterns | Not included | **Detailed anti-patterns** | Not included |

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

2. **Format Decision Matrix** (missing from Bible):
   - YAML = Agent fills out
   - Markdown = Agent reads
   - HBS = Template source only

3. **Implementation Status** (missing from Bible):
   - `agent-readme.hbs` - **MISSING** (HIGH PRIORITY)
   - `completion-signal.hbs` - **BUG** (generated by prepare, shouldn't be)
   - `manifest.hbs` - Needs SpecKit format update

**Conflict: Template naming conventions**

| Document | Convention | Example |
|----------|------------|---------|
| Bible (D.1, D.2) | `-template.md` | `handover-template.md` |
| TEMPLATE_REGISTRY | `.hbs` | `handover.hbs` |
| Spec templates.md | `.md.template` | `current-task.md.template` |

**Recommendation**:
- ⬇️ Update `03-components/templates.md` to match TEMPLATE_REGISTRY
- ⬆️ Add implementation status table to Bible or merge Registry into Bible
- **Decide on naming**: `.hbs` or `.md.template` - Registry uses `.hbs`, standardize on this

---

### 4. SCRIPTS

#### Bible Section 8 vs `03-components/scripts.md`

| Aspect | Bible | Spec | Verdict |
|--------|-------|------|---------|
| Script inventory | Complete list | Same list | ✅ Aligned |
| Mandatory matrix | Section 7.3 | Duplicated | ✅ Aligned |
| Script attributes | Full detail | Same detail | ✅ Aligned |
| Lifecycle positions | Full detail | Same detail | ✅ Aligned |

**GAP: `validate-verification-paths` script**

| Document | Status |
|----------|--------|
| Bible | **NOT MENTIONED** |
| `scripts.md` | **Fully specified** |

The Spec includes `validate-verification-paths` as a MANDATORY script:
> After creating verification YAML, before handover begins (Process 1, Step 6a)

**Recommendation**: ⬆️ Add this script to Bible Section 8 and update Section 7.3 matrix.

---

### 5. TASK LIFECYCLE

#### Bible Section 7 vs `04-processes/task-lifecycle.md`

| Aspect | Bible | Spec | Verdict |
|--------|-------|------|---------|
| Lifecycle diagram | Complete | Duplicate | ✅ Aligned |
| Phase definitions | Complete | Duplicate | ✅ Aligned |
| Script mappings | Complete | Duplicate | ✅ Aligned |

**Verdict**: `task-lifecycle.md` is a **pure duplicate** of Bible Section 7.

**Recommendation**: 
- 🗑️ Mark as deprecated OR
- Convert to "Quick Reference Card" format

---

### 6. VERIFICATION PROTOCOL

#### Bible Section 9 vs `04-processes/verification-protocol.md`

| Aspect | Bible | Spec | Verdict |
|--------|-------|------|---------|
| Verification layers | Section 9.1 | Not explicit | Bible more complete |
| Gate vs Hidden | Section 9.2 | Step-by-step workflow | ⚠️ Different focus |
| Designing criteria | Section 9.3 | Not included | Bible more complete |
| Preventing gaming | Section 9.4 | Not included | Bible more complete |
| Script execution | Brief | **Detailed commands** | Spec more actionable |
| Evidence requirements | Brief | **Explicit protocol** | Spec more actionable |

**GAP: Severity levels**

| Document | Severity Levels | Decision Rules |
|----------|-----------------|----------------|
| Bible | Not explicitly defined | Not included |
| Spec | BLOCKING, MAJOR, MINOR, INFO | Full rules in Step 8 |

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

| Aspect | Bible | Spec |
|--------|-------|------|
| Visual verification | Mentioned in examples | **Full protocol document** |
| Screenshot workflow | Brief mention in templates | **Detailed step-by-step** |
| Chrome DevTools MCP | Not mentioned | **Explicit tool usage** |
| flutter_agent.py | Not mentioned | **Full command reference** |

**MAJOR GAP**: Visual verification is a significant process not adequately covered in Bible.

**Recommendation**: 
- ⬆️ Add Bible Section 9.5 "Visual Verification" with summary
- Keep Spec `visual-verification.md` as extended reference

---

### 8. IMPLEMENTATION PLAN

#### Bible vs `implementation-plan.md` vs `implementation/`

| Aspect | Bible | implementation-plan.md | implementation/ |
|--------|-------|------------------------|-----------------|
| Phase roadmap | Not included | 4 phases outlined | Detailed per phase |
| CLI commands | References in scripts | Listed | Full spec per command |
| MCP tools | Not included | Listed | Phase 2 spec exists |
| VS Code extension | Not included | Planned | Not started |

**Status Assessment**:

| Phase | implementation-plan.md | implementation/phase-X/ | Reality |
|-------|------------------------|------------------------|---------|
| Phase 1: CLI | "Not Started" | ✅ Complete | ✅ Complete |
| Phase 2: MCP | "Not Started" | Has readme, tasks.md | In planning |
| Phase 3: Extension | "Not Started" | Not created | Not started |
| Phase 4: RAG | "Not Started" | Not created | Not started |

**Recommendation**:
- ⬇️ Update `implementation-plan.md` status (Phase 1 complete)
- Keep `implementation/` as source of truth for implementation details
- Bible should not duplicate implementation specifics

---

### 9. TEMPLATE REGISTRY ISSUES

#### Registry's Own Issues (Internal Inconsistencies)

| Issue | Severity | Details |
|-------|----------|---------|
| Missing `agent-readme.hbs` | HIGH | Agents have no onboarding document |
| `completion-signal.hbs` bug | HIGH | Generated by prepare (should be reference only) |
| `manifest.hbs` format | HIGH | Needs SpecKit format update |
| Bible reference incorrect | MEDIUM | Points to `docs/ORCHESTRA_BIBLE.md` (wrong path) |

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

| Document | Status | Action |
|----------|--------|--------|
| `spec/readme.md` | Points to 21 documents; Bible consolidates all | 🗑️ Deprecate or update as Bible intro |
| `spec/tasks.md` | Unknown purpose | 🗑️ Review and likely remove |
| `04-processes/task-lifecycle.md` | Pure duplicate of Bible Section 7 | 🗑️ Deprecate or convert to quick ref |
| `04-processes/handover-lifecycle.md` | Subset of Bible | 🗑️ Merge into Bible or deprecate |
| Parts of `01-product/`, `02-architecture/` | May contain historical decisions | 📋 Review for unique content |
| `05-research/` | Historical case studies | 📋 Keep as reference, mark as historical |

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

### Conflict 3: Signal file location
- **Bible**: `.orchestra/implementor/signals/task-{id}-signal.md`
- **Spec verification-protocol.md**: `.orchestra/implementor/signals/task-{id}-complete.signal`

**Decision**: Use `.md` extension per Bible (more common, consistent).

### Conflict 4: Current task file naming
- **Bible Appendix D**: `task-{id}-handover.md` (multiple files)
- **TEMPLATE_REGISTRY**: `current-task.md` (single file, replaced each task)

**Decision**: TEMPLATE_REGISTRY is more correct (single active file). Update Bible.

### Conflict 5: Handover archive location
- **Bible**: Archives in `artifacts/task-{id}/`
- **TEMPLATE_REGISTRY**: Timestamped in `.orchestrator-only/handover-T001-*.md`

**Decision**: Need to clarify - are these different files or same purpose?

### Conflict 6: orchestra.yaml existence
- **Bible**: Not mentioned (uses config.yaml in Section 12)
- **TEMPLATE_REGISTRY**: `orchestra.yaml` at `.orchestra/orchestra.yaml`

**Decision**: TEMPLATE_REGISTRY is current implementation. Add to Bible.

### Conflict 7: SpecKit integration
- **Bible**: No mention of SpecKit
- **TEMPLATE_REGISTRY**: Explicit SpecKit references, `speckit_task_ref` fields

**Decision**: SpecKit is current architecture. Add to Bible or create separate doc.

### Conflict 8: CLI command names
- **Bible scripts**: `prepare-handover`, `validate-handover`
- **Phase 1 CLI**: `orchestra prepare`, `orchestra verify`

**Decision**: CLI uses subcommands (correct). Update Bible to match.

---

## Recommendations Summary

### High Priority (Do First)

| Action | Type | Details |
|--------|------|---------|
| 1. Fix Bible 6.3 visibility | ⬇️ Bible fix | manifest/progress are Orchestrator-only |
| 2. Add `validate-verification-paths` to Bible | ⬆️ Backport | From Spec scripts.md |
| 3. Add severity levels to Bible | ⬆️ Backport | From Spec verification-protocol.md |
| 4. Fix `current-task.md` naming in Bible | ⬇️ Bible fix | Single file, not `task-{id}-handover.md` |
| 5. Add `orchestra.yaml` to Bible | ⬆️ Add | Per TEMPLATE_REGISTRY |
| 6. Create `agent-readme.hbs` template | 🔧 Implementation | Per TEMPLATE_REGISTRY |
| 7. Fix `completion-signal.hbs` generation | 🔧 Implementation | Per TEMPLATE_REGISTRY |

### Medium Priority

| Action | Type | Details |
|--------|------|---------|
| 8. Add Visual Verification section to Bible | ⬆️ Backport | From Spec |
| 9. Standardize template naming to `.hbs` | ⬇️ Update all | Per TEMPLATE_REGISTRY |
| 10. Update implementation-plan.md status | ⬇️ Update | Phase 1 complete |
| 11. Add detailed schemas to Bible | ⬆️ Backport | From file-specifications.md |
| 12. Merge TEMPLATE_REGISTRY key sections | ⬆️ Merge | Into Bible 6.5 |

### Low Priority

| Action | Type | Details |
|--------|------|---------|
| 13. Mark deprecated docs | 🗑️ Cleanup | task-lifecycle.md, etc. |
| 14. Review 01-product, 02-architecture | 📋 Audit | Extract unique decisions |
| 15. Update spec/readme.md | 🗑️ Cleanup | Either deprecate or update as Bible intro |

---

## Appendix: File-by-File Status

| File | Status | Action |
|------|--------|--------|
| `spec/00-orchestra-bible.md` | ✅ Authoritative | Minor fixes needed |
| `spec/readme.md` | 🗑️ Outdated | Deprecate or update |
| `spec/tasks.md` | ❓ Unknown | Review |
| `spec/implementation-plan.md` | ⚠️ Partially outdated | Update status |
| `spec/01-product/*` | 📋 Unchecked | Review for unique content |
| `spec/02-architecture/*` | 📋 Unchecked | Review for unique content |
| `spec/03-components/folder-structure.md` | ⚠️ Has conflicts | Fix visibility matrix |
| `spec/03-components/file-specifications.md` | ✅ Good detail | Backport to Bible |
| `spec/03-components/scripts.md` | ✅ Good detail | Backport new script |
| `spec/03-components/templates.md` | ⚠️ Naming conflict | Update to .hbs |
| `spec/04-processes/task-lifecycle.md` | 🗑️ Duplicate | Deprecate |
| `spec/04-processes/verification-protocol.md` | ✅ Good detail | Backport severity levels |
| `spec/04-processes/visual-verification.md` | ✅ Unique content | Add summary to Bible |
| `spec/04-processes/failure-handling.md` | 📋 Unchecked | Review |
| `spec/04-processes/handover-lifecycle.md` | 📋 Unchecked | Review |
| `spec/05-research/*` | 📋 Historical | Keep as reference |
| `spec/06-appendices/*` | 📋 Unchecked | May duplicate Bible appendices |
| `spec/implementation/readme.md` | ✅ Current | Phase 1 complete |
| `spec/implementation/phase-1-cli/*` | ✅ Current | Implementation reference |
| `spec/implementation/phase-2-mcp/*` | ✅ Current | Planning docs |
| `docs/TEMPLATE_REGISTRY.md` | ✅ Authoritative | Merge key parts to Bible |
| `docs/TEMPLATE_ARCHITECTURE.md` | ✅ Good design doc | Reference from Bible |

---

## Next Steps

1. **Human Decision**: Resolve the 8 conflicts listed above
2. **Apply High Priority fixes** to Bible
3. **Backport unique content** from Specs to Bible
4. **Mark deprecated documents** with header notices
5. **Create implementation tasks** for missing templates

---

*Generated by documentation audit on 2025-12-04*
