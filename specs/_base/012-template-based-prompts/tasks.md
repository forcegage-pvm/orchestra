# Spec 012: Template-Based Agent Prompts - Tasks

## Phase 1: Infrastructure

### Task 1: Create TemplateLoader class

- **Category**: FEATURE
- **Description**: Create a new `TemplateLoader` class that handles loading, caching, and rendering Handlebars templates from `.orchestra/templates/prompts/`.
- **Deliverables**:
  - `extension/src/prompts/TemplateLoader.ts`
  - Load templates from `.orchestra/templates/prompts/` (user-editable workspace location)
  - Template caching for performance (skip in dev mode for hot-reload)
  - `clearCache()` method for hot-reload during development
  - Partial registration from `_partials/` directory
  - Custom Handlebars helper registration (json, default)
- **Acceptance Criteria**:
  - [ ] TemplateLoader loads templates from `.orchestra/templates/prompts/`
  - [ ] Error handling for missing templates (clear error message)
  - [ ] Partials are registered and can be used with `{{> partialName}}`
  - [ ] Dev mode skips cache for hot-reload
  - [ ] Context schema validation (optional but recommended)

### Task 2: Create template directory structure and sync mechanism

- **Category**: SETUP
- **Description**: Create the directory structure for prompt templates and add `ensurePromptTemplates` function to sync templates during workspace initialization (following the same pattern as `ensureAgentFiles` in extension.ts).
- **Deliverables**:
  - `extension/templates/prompts/` directory (bundled with extension)
  - `extension/templates/prompts/_partials/` subdirectory
  - `extension/templates/prompts/_schema/context.schema.json` - JSON schema documenting context structure
  - Update `esbuild.config.js` to copy templates to dist
  - Add `ensurePromptTemplates()` function in `extension.ts` (like `ensureAgentFiles`)
  - Call `ensurePromptTemplates()` during workspace initialization
- **Acceptance Criteria**:
  - [ ] Directory structure created in extension bundle
  - [ ] Templates copied to `.orchestra/templates/prompts/` on workspace init
  - [ ] New templates synced on extension update (preserves user modifications)
  - [ ] JSON schema documents all context fields
  - [ ] Templates bundled with extension (verify in dist)

### Task 3: Extract shared content to partials

- **Category**: REFACTOR
- **Description**: Extract commonly reused prompt sections into Handlebars partials.
- **Deliverables**:
  - `_partials/stub-hunter-mode.hbs` - STUB HUNTER MODE section (~70 lines)
  - `_partials/spec-protocol.hbs` - Spec-first protocol instructions
  - `_partials/task-header.hbs` - Common task details block
  - `_partials/decision-guidance.hbs` - Common APPROVED/CHANGES_REQUESTED/REJECTED guidance
- **Acceptance Criteria**:
  - [ ] Each partial is self-contained and reusable
  - [ ] Partials use context variables correctly
  - [ ] No hardcoded task-specific values in partials

## Phase 2: Template Migration

### Task 4: Migrate prepare/implement/retry prompts

- **Category**: REFACTOR
- **Description**: Convert the basic workflow prompts to template files.
- **Deliverables**:
  - `prepare.hbs` - From `buildPreparePrompt()`
  - `implement.hbs` - From `buildImplementPrompt()`
  - `retry.hbs` - From `buildRetryPrompt()`
- **Acceptance Criteria**:
  - [ ] Templates render identical output to current methods
  - [ ] Context variables: task.task_id, task.title, task.description, etc.
  - [ ] Conditional sections work (tdd_red_phase, retryCount)

### Task 5: Migrate verify prompt

- **Category**: REFACTOR
- **Description**: Convert the verification prompt to template with STUB HUNTER partial.
- **Deliverables**:
  - `verify.hbs` - From `buildVerifyPrompt()`
  - Uses `{{> stub-hunter-mode}}` partial
- **Acceptance Criteria**:
  - [ ] Template renders identical output
  - [ ] STUB HUNTER MODE section from partial
  - [ ] TDD red phase section conditionally included

### Task 6: Migrate sprint/handover review prompts

- **Category**: REFACTOR
- **Description**: Convert controller review prompts to templates.
- **Deliverables**:
  - `sprint-review.hbs` - From `buildSprintReviewPrompt()`
  - `handover-review.hbs` - From `buildHandoverReviewPrompt()`
  - `handover-fix.hbs` - From `buildHandoverFixPrompt()`
- **Acceptance Criteria**:
  - [ ] Templates render identical output
  - [ ] Rejection context (issues, recommendations) handled correctly
  - [ ] Review attempt number displayed

### Task 7: Migrate code review prompts

- **Category**: REFACTOR
- **Description**: Convert code review prompts to templates.
- **Deliverables**:
  - `code-review.hbs` - From `buildSingleTaskCodeReviewPrompt()` (private helper)
  - `code-review-bulk.hbs` - From `buildBulkCodeReviewPrompt()` (private helper)
  - `code-review-re-review.hbs` - From `buildCodeReviewReReviewPrompt()`
- **Acceptance Criteria**:
  - [ ] Uses `{{> stub-hunter-mode}}` and `{{> spec-protocol}}` partials
  - [ ] Single-task vs bulk review correctly differentiated
  - [ ] Task info interpolated correctly

### Task 8: Migrate code review fix prompts

- **Category**: REFACTOR
- **Description**: Convert code review fix prompts to templates.
- **Deliverables**:
  - `code-review-fix.hbs` - From `buildCodeReviewFixPrompt()`
  - `code-review-fix-prepare.hbs` - From `buildCodeReviewFixPreparePrompt()`
  - `code-review-fix-implement.hbs` - From `buildCodeReviewFixImplementPrompt()`
- **Acceptance Criteria**:
  - [ ] Templates render identical output
  - [ ] Review context (status, summary, reviewId) handled

### Task 9: Refactor PromptBuilder to use TemplateLoader

- **Category**: REFACTOR
- **Description**: Replace all template literal methods with TemplateLoader calls. PromptBuilder becomes a thin wrapper.
- **Deliverables**:
  - Remove all inline template literals from PromptBuilder
  - Each `build*Prompt()` method is a one-liner calling `templateLoader.render()`
  - Add `toTemplateContext()` helper to convert PromptContext → PromptTemplateContext
  - Remove private helper methods (content now in templates)
  - Keep method signatures backward-compatible
- **Acceptance Criteria**:
  - [ ] PromptBuilder.ts is <150 lines (thin wrapper)
  - [ ] All public method signatures unchanged
  - [ ] No template literals in PromptBuilder
  - [ ] All existing callers work without changes

## Phase 3: Testing & Validation

### Task 10: Add tests for TemplateLoader

- **Category**: TEST
- **Description**: Create comprehensive tests for the TemplateLoader class.
- **Deliverables**:
  - `extension/test/prompts/TemplateLoader.test.ts`
  - Test cases for:
    - Loading from `.orchestra/templates/prompts/`
    - Partial injection with `{{> partialName}}`
    - Context variable interpolation
    - Caching behavior (enabled/disabled)
    - Error handling (missing template, syntax error)
    - Hot-reload in dev mode
- **Acceptance Criteria**:
  - [ ] All test cases pass
  - [ ] Edge cases covered (missing templates, empty context)
  - [ ] Mock `.orchestra/templates/prompts/` directory in tests

### Task 11: Validate template sync and prompt rendering

- **Category**: VALIDATION
- **Description**: End-to-end validation of template sync mechanism and prompt rendering.
- **Deliverables**:
  - Manual test plan for template sync on workspace init
  - Manual test plan for each task status prompt
  - Verify prompts render correctly from tree view play button
- **Acceptance Criteria**:
  - [ ] Templates copied to `.orchestra/templates/prompts/` on fresh workspace init
  - [ ] Templates preserved on extension update (user modifications kept)
  - [ ] Deleting `.orchestra/templates/prompts/` and reloading restores defaults
  - [ ] PENDING → prepare prompt works
  - [ ] IMPLEMENT → implement prompt works
  - [ ] VERIFY_FAILED → retry prompt works
  - [ ] VERIFY → verify prompt works
  - [ ] PENDING_HANDOVER_REVIEW → handover review prompt works
  - [ ] HANDOVER_REVIEW_FAILED → handover fix prompt works
  - [ ] COMPLETE + PENDING review → code review prompt works
  - [ ] User can edit `.orchestra/templates/prompts/verify.hbs` and see changes

## Summary

| Phase                         | Tasks  | Estimated Hours |
| ----------------------------- | ------ | --------------- |
| Phase 1: Infrastructure       | 3      | 2-3             |
| Phase 2: Template Migration   | 6      | 3-4             |
| Phase 3: Testing & Validation | 2      | 1-2             |
| **Total**                     | **11** | **6-9**         |
