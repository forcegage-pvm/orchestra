# Spec 012: Template-Based Agent Prompts

## Overview

Refactor `PromptBuilder` to use file-based Handlebars templates instead of hard-coded template literals. This enables easier iteration, customization, and maintainability of agent prompts.

## Problem Statement

The current `PromptBuilder.ts` contains 12 prompt methods with hard-coded template literals:

- **Maintenance burden**: Editing prompts requires TypeScript compilation and rebuild
- **No versioning**: Can't easily A/B test or rollback prompt changes
- **Code bloat**: 1200+ lines of mostly static text embedded in code
- **Minification issues**: Large template literals with escaped backticks cause esbuild issues (TD-012)
- **No user customization**: Prompts are locked in code

## Goals

1. Move all prompt content to `.hbs` (Handlebars) template files
2. Keep `PromptBuilder` as a thin orchestration layer
3. Enable hot-reloading of templates during development
4. Support user customization via workspace-local overrides
5. Eliminate esbuild template literal minification issues

## Non-Goals

- Database-stored templates (file-based is simpler for this use case)
- Multi-language/i18n support (not needed currently)
- GUI template editor (file editing is sufficient)

## Architecture

### Design Principles

1. **Easy Updates**: Templates are plain text files in `.orchestra/` - edit and save, no recompilation
2. **Easy Parsing**: Simple Handlebars syntax with clear context variables
3. **Hot Reload**: Development mode reloads templates without extension restart
4. **Modular Partials**: Reusable sections for DRY templates
5. **Graceful Fallbacks**: Missing variables render as empty, no crashes
6. **Version Synced**: Templates copied from extension bundle on install/update (like agent files)

### Template Installation Flow

Templates are bundled with the extension and copied to `.orchestra/templates/prompts/` during workspace initialization (same pattern as `.github/agents/` for agent instruction files):

```
Extension Bundle:                    Workspace (user-editable):
extension/templates/prompts/   →     .orchestra/templates/prompts/
├── prepare.hbs                      ├── prepare.hbs
├── implement.hbs                    ├── implement.hbs
├── verify.hbs                       ├── verify.hbs
├── ...                              ├── ...
└── _partials/                       └── _partials/
    ├── stub-hunter-mode.hbs             ├── stub-hunter-mode.hbs
    └── ...                              └── ...
```

**Copy Behavior:**

- On first install: All templates copied to `.orchestra/templates/prompts/`
- On extension update: New/updated templates merged (preserves user modifications)
- User can always reset by deleting `.orchestra/templates/prompts/` and reloading

### Template Location (Bundle)

Templates bundled with extension at:

```
extension/templates/prompts/
├── prepare.hbs                    # Orchestrator: prepare_task
├── implement.hbs                  # Implementor: implement
├── verify.hbs                     # Orchestrator: verify_task
├── retry.hbs                      # Implementor: retry after failure
├── sprint-review.hbs              # Controller: sprint configuration review
├── handover-review.hbs            # Controller: handover review
├── handover-fix.hbs               # Orchestrator: fix rejected handover
├── code-review.hbs                # Controller: code review (single task)
├── code-review-bulk.hbs           # Controller: code review (bulk)
├── code-review-re-review.hbs      # Controller: re-review after fixes
├── code-review-fix.hbs            # Implementor: fix code review issues
├── code-review-fix-prepare.hbs    # Orchestrator: prepare fix for issues
├── code-review-fix-implement.hbs  # Implementor: implement fix
├── _partials/
│   ├── stub-hunter-mode.hbs       # Shared: Stub hunter mode instructions
│   ├── task-header.hbs            # Shared: Task details header
│   └── spec-protocol.hbs          # Shared: Spec-first protocol
└── _schema/
    └── context.schema.json        # Context schema documentation for parsing
```

### Runtime Template Location

TemplateLoader reads templates from the user-editable workspace location:

```
.orchestra/templates/prompts/
├── prepare.hbs
├── implement.hbs
├── verify.hbs
├── ...
├── _partials/
│   ├── stub-hunter-mode.hbs
│   └── ...
└── _schema/
    └── context.schema.json        # Self-documenting context reference
```

Users can edit any template directly in their workspace.

### Template Context Interface

All templates receive a flat, predictable context object. A JSON schema is provided for tooling/parsing:

```typescript
interface PromptTemplateContext {
  // Task context (always present)
  task: {
    task_id: number;
    title: string;
    description: string;
    category?: string;
    phase_id?: string;
    status?: string;
    tdd_red_phase?: boolean;
  };

  // Sprint context (always present)
  sprint: {
    sprint_id: string;
    title: string;
    status?: string;
  };

  // Workflow context (present when applicable)
  handoverPath?: string;
  feedbackPath?: string;
  retryCount?: number;
  maxRetries?: number;
  reviewAttempt?: number;

  // Code review context (present for code review prompts)
  codeReview?: {
    status: string;
    summary?: string;
    reviewId?: number;
    pendingCount?: number;
  };

  // Rejection context (present for fix prompts)
  rejection?: {
    issues: unknown;
    recommendations: unknown;
    revision_count: number;
  };
}
```

### Template Syntax Guide

Templates use standard Handlebars syntax for easy parsing and editing:

```handlebars
{{!-- Variable interpolation --}}
Task #{{task.task_id}}: {{task.title}}

{{!-- Conditionals --}}
{{#if task.tdd_red_phase}}
This is a TDD red-phase task.
{{/if}}

{{!-- Loops --}}
{{#each rejection.issues}}
- {{this}}
{{/each}}

{{!-- Partials (reusable sections) --}}
{{> stub-hunter-mode}}

{{!-- Helpers --}}
{{json codeReview}}       {{!-- Outputs JSON string --}}
{{default reviewAttempt 1}} {{!-- Default value if undefined --}}
```

### TemplateLoader Class

Simple loader that reads from `.orchestra/templates/prompts/` with caching:

```typescript
export class TemplateLoader {
  private cache: Map<string, HandlebarsTemplateDelegate> = new Map();
  private workspaceRoot: string;
  private devMode: boolean;

  constructor(options: { workspaceRoot: string; devMode?: boolean }) {
    this.workspaceRoot = options.workspaceRoot;
    this.devMode = options.devMode ?? false;
    this.registerPartials();
    this.registerHelpers();
  }

  /** Render template with context - main public API */
  render(templateName: string, context: PromptTemplateContext): string {
    const template = this.getTemplate(templateName);
    return template(context);
  }

  /** Clear cache for hot-reload during development */
  clearCache(): void {
    this.cache.clear();
  }

  private getTemplate(name: string): HandlebarsTemplateDelegate {
    // Skip cache in dev mode for hot-reload
    if (!this.devMode && this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    // Load from .orchestra/templates/prompts/
    const templatePath = path.join(
      this.workspaceRoot,
      ".orchestra/templates/prompts",
      `${name}.hbs`
    );

    const template = this.loadAndCompile(templatePath);
    if (!this.devMode) {
      this.cache.set(name, template);
    }
    return template;
  }

  private registerPartials(): void {
    // Register all .hbs files from _partials/ directory
    const partialsDir = path.join(
      this.workspaceRoot,
      ".orchestra/templates/prompts/_partials"
    );
    // Load and register each partial...
  }
}
}
```

### PromptBuilder (Thin Wrapper)

PromptBuilder becomes a simple mapping layer:

```typescript
export class PromptBuilder {
  private loader: TemplateLoader;

  buildPreparePrompt(context: PromptContext): string {
    return this.loader.render("prepare", this.toTemplateContext(context));
  }

  buildVerifyPrompt(context: PromptContext): string {
    return this.loader.render("verify", this.toTemplateContext(context));
  }

  // ... one-liner for each prompt type
}
```

## Tasks

### Phase 1: Infrastructure (Tasks 1-3)

1. **Create TemplateLoader class**
   - File: `extension/src/prompts/TemplateLoader.ts`
   - Load templates from file system
   - Support workspace overrides
   - Register partials and helpers
   - Cache compiled templates (skip cache in dev mode)

2. **Create template directory structure**
   - Create `extension/templates/prompts/` directory
   - Create `_partials/` subdirectory
   - Create `_schema/context.schema.json` for documentation

3. **Extract shared content to partials**
   - `_partials/stub-hunter-mode.hbs` - The STUB HUNTER MODE section
   - `_partials/spec-protocol.hbs` - Spec-first protocol instructions
   - `_partials/task-header.hbs` - Common task details header

### Phase 2: Template Migration (Tasks 4-9)

4. **Migrate prepare/implement/retry prompts**
   - `prepare.hbs` - From `buildPreparePrompt`
   - `implement.hbs` - From `buildImplementPrompt`
   - `retry.hbs` - From `buildRetryPrompt`

5. **Migrate verify prompt**
   - `verify.hbs` - From `buildVerifyPrompt`
   - Uses `{{> stub-hunter-mode}}` partial

6. **Migrate sprint/handover review prompts**
   - `sprint-review.hbs` - From `buildSprintReviewPrompt`
   - `handover-review.hbs` - From `buildHandoverReviewPrompt`
   - `handover-fix.hbs` - From `buildHandoverFixPrompt`

7. **Migrate code review prompts**
   - `code-review.hbs` - From `buildSingleTaskCodeReviewPrompt`
   - `code-review-bulk.hbs` - From `buildBulkCodeReviewPrompt`
   - `code-review-re-review.hbs` - From `buildCodeReviewReReviewPrompt`
   - Uses `{{> stub-hunter-mode}}` and `{{> spec-protocol}}` partials

8. **Migrate code review fix prompts**
   - `code-review-fix.hbs` - From `buildCodeReviewFixPrompt`
   - `code-review-fix-prepare.hbs` - From `buildCodeReviewFixPreparePrompt`
   - `code-review-fix-implement.hbs` - From `buildCodeReviewFixImplementPrompt`

9. **Refactor PromptBuilder to use TemplateLoader**
   - Replace all template literal methods with `templateLoader.render()` calls
   - Keep method signatures backward-compatible
   - Remove old template literal code

### Phase 3: Testing & Validation (Tasks 10-11)

10. **Add tests for TemplateLoader**
    - Template loading from extension defaults
    - Workspace override resolution
    - Partial injection
    - Context variable interpolation
    - Error handling for missing templates

11. **Validate all prompts work correctly**
    - Test each task status from tree view play button
    - Verify prompts render with expected content
    - Test workspace override mechanism

## Success Criteria

1. All 12 prompt methods use file-based templates
2. Prompts render identically to current output (diff test)
3. No esbuild minification issues with template content
4. Workspace override mechanism works
5. PromptBuilder.ts reduced to <200 lines
6. All existing tests pass

## Technical Notes

### Handlebars Helpers to Register

```typescript
// JSON stringify for objects in prompts
Handlebars.registerHelper("json", (context) =>
  JSON.stringify(context, null, 2),
);

// Equality check
Handlebars.registerHelper("if_eq", function (a, b, options) {
  return a === b ? options.fn(this) : options.inverse(this);
});

// Default value
Handlebars.registerHelper(
  "default",
  (value, defaultValue) => value ?? defaultValue,
);
```

### Build Integration

Templates are plain text files, so:

- No compilation needed
- Bundled with extension via `package.json` files array
- Hot-reload in dev mode by clearing template cache

## Dependencies

- `handlebars` package (already in dependencies for MCP server templates)

## Estimated Effort

- Phase 1: 2-3 hours
- Phase 2: 3-4 hours
- Phase 3: 1-2 hours
- **Total: 6-9 hours**

## Risks

1. **Template syntax errors** - Mitigated by testing each template
2. **Missing context variables** - Mitigated by TypeScript interfaces
3. **Performance** - Mitigated by caching compiled templates
