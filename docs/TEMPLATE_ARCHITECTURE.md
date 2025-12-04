# Template Architecture

> **Single Source of Truth → Multiple Formats**

## Overview

Orchestra uses Handlebars (`.hbs`) templates as the **single source of truth** for all document templates. These templates can be rendered to multiple output formats at runtime:

- **YAML** - Structured data for MCP tools and automation
- **Markdown** - Human-readable documents for agents
- **Both** - Dual output for flexibility

## Why This Pattern?

| Approach | Problem |
|----------|---------|
| Handlebars only | Agents can't easily fill structured data |
| YAML only | Lose the expressiveness of template logic |
| Both as separate files | Two sources of truth, sync issues |

**Solution**: Handlebars IS the schema. Parse it to generate YAML templates.

## Architecture

```
.orchestra/common/templates/
├── handover.hbs              ← MASTER TEMPLATE (source of truth)
├── completion-signal.hbs     ← Signal template
└── task-context.hbs          ← Context template

orchestra prepare --task 1 --format yaml
                                ↓
                    ┌───────────┴───────────┐
                    │  hbsToYamlTemplate()  │
                    │  Parses .hbs fields   │
                    └───────────┬───────────┘
                                ↓
.orchestra/handover/
├── task-1.yaml               ← Structured (agent fills this)
└── current-task.md           ← Rendered preview

orchestra render --task 1
                    ↓
        ┌───────────┴───────────┐
        │  Validates YAML       │
        │  Renders final MD     │
        └───────────┬───────────┘
                    ↓
.orchestra/handover/
└── current-task.md           ← Final handover document
```

## Template Field Extraction

Handlebars syntax maps to YAML types:

| Handlebars | YAML Type | Example |
|------------|-----------|---------|
| `{{field}}` | `string` | `task_title: ""` |
| `{{#each items}}` | `array` | `items: []` |
| `{{#if flag}}` | `boolean` | `flag: false` |
| `{{nested.field}}` | `object` | `nested: { field: "" }` |

### Example Conversion

**Input (handover.hbs)**:
```handlebars
# Task {{task_id}}: {{task_title}}

## Objective
{{objective}}

## Acceptance Criteria
{{#each acceptance_criteria}}
- [ ] {{this}}
{{/each}}

{{#if dependencies}}
## Dependencies
{{#each dependencies}}
- Task {{id}}: {{title}}
{{/each}}
{{/if}}
```

**Output (task-1.yaml)**:
```yaml
# Generated from handover.hbs
# Fill in all fields, then run: orchestra render --task 1

task_id: 1
task_title: "Project Setup"  # Pre-filled from manifest
objective: ""                 # TODO: Fill this

acceptance_criteria:          # TODO: Add criteria from spec
  - ""

dependencies: []              # Pre-filled from manifest
```

## Command Interface

### Prepare with Format

```bash
# Structured process (MCP/automation)
orchestra prepare --task 1 --format yaml

# Agent-driven (flexible)
orchestra prepare --task 1 --format markdown

# Both outputs (let agent choose)
orchestra prepare --task 1 --format both

# Use default from config
orchestra prepare --task 1
```

### Render from YAML

```bash
# Validate YAML and render final markdown
orchestra render --task 1

# Validate only (no render)
orchestra render --task 1 --validate-only
```

## Configuration

```yaml
# orchestra.yaml
version: "1.0"
template:
  default_format: "yaml"      # yaml | markdown | both
  validate_on_render: true    # Require all fields filled
  strict_mode: false          # Allow extra fields in YAML
```

## Workflow Examples

### MCP Tool Workflow (Structured)

```
1. MCP calls prepare_task tool
   → CLI generates task-1.yaml with schema

2. Orchestrator agent fills YAML programmatically
   → All fields populated, validated against schema

3. MCP calls render_handover tool
   → CLI validates YAML, renders current-task.md

4. Implementor reads current-task.md
   → Clean, consistent document
```

### Human Agent Workflow (Flexible)

```
1. orchestra prepare --task 1 --format markdown
   → CLI renders current-task.md with TODO markers

2. Orchestrator agent edits markdown directly
   → Fills in sections, removes TODOs

3. orchestra status shows handover ready
   → Implementor can begin
```

### Hybrid Workflow (Both)

```
1. orchestra prepare --task 1 --format both
   → CLI generates task-1.yaml AND current-task.md

2. Agent chooses preferred format
   → Edit YAML for structure, or MD for prose

3. If YAML edited: orchestra render --task 1
   If MD edited: already done
```

## Validation

### YAML Schema Validation

When `--format yaml` is used, the generated YAML includes a schema reference:

```yaml
# yaml-language-server: $schema=../../schemas/handover.schema.json
task_id: 1
# ...
```

The `render` command validates:
1. All required fields are filled
2. Types match expected (string, array, etc.)
3. No placeholder values remain (`""`, `[]`, `TODO`)

### Markdown Validation

For markdown format, validation checks:
1. No `🔴 TODO` markers remain
2. File operations table has at least one row
3. Acceptance criteria section is not empty

## Benefits

| Benefit | Description |
|---------|-------------|
| **Single source** | One .hbs template, no sync issues |
| **Format flexibility** | YAML for automation, MD for humans |
| **Future-proof** | Easy to add JSON, TOML, etc. |
| **Validation** | YAML path gets schema validation |
| **Backward compatible** | Default to markdown works today |
| **Self-documenting** | .hbs shows exactly what fields exist |

## Implementation Files

| File | Purpose |
|------|---------|
| `src/core/template-converter.ts` | HBS→YAML parsing and conversion |
| `src/core/templates.ts` | Template loading and rendering |
| `src/core/handover-schema.ts` | Zod schema for YAML validation |
| `src/commands/render.ts` | New render command |
| `src/commands/prepare.ts` | Updated with --format flag |

## Related

- [Orchestra Bible](./orchestra-bible.md) - Overall architecture
- [CLI Commands](./commands.md) - Command reference
- [MCP Tools](../spec/implementation/phase-2-mcp/readme.md) - MCP integration
