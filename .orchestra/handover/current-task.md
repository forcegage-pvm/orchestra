# Task 4: Init Command

## Overview

Implement the `orchestra init` command that initializes the Orchestra folder structure in a project. Creates the `.orchestra/` directory with configuration, templates, and initial structure.

## Objective

Create the init command that scaffolds the complete Orchestra directory structure from a SpecKit specification, generating manifest and progress YAML files for sprint management.

## Spec Files

📄 **Task spec**: `spec/implementation/phase-1-cli/tasks/1.4-init-command.md`
📄 **Command spec**: `spec/implementation/phase-1-cli/commands/init.md`

Please read the spec file(s) for full implementation details including code samples.

## Acceptance Criteria

- [ ] `orchestra init --spec <path>` creates `.orchestra/` directory
- [ ] Creates manifest.yaml from spec
- [ ] Creates progress.yaml
- [ ] Exit code 0 on success

## Dependencies

These tasks must be completed first:

- Task 2: Core Libraries (completed)

## File Operations

**IMPORTANT**: Use this exact table format for validation to pass:

| Action | File Path                       | Purpose                                            |
| ------ | ------------------------------- | -------------------------------------------------- |
| CREATE | `src/commands/init.ts`          | Init command implementation with all options       |
| CREATE | `src/lib/templates.ts`          | Handlebars template loading and rendering          |
| CREATE | `tests/commands/init.test.ts`   | Unit tests for init command (8+ test cases)        |

## TDD Requirements

**Test-First Approach**: Write tests before implementing.

**Test File**: `tests/commands/init.test.ts`

**Test Cases Required**:

1. **Should create `.orchestra` directory** - Verify directory exists after init
2. **Should create config file** - Verify `orchestra.yaml` exists with default config
3. **Should create template files** - Verify all template files created in correct locations
4. **Should fail if already initialized without force** - Exit code 1, error message shown
5. **Should reinitialize with force flag** - `--force` allows overwriting existing structure
6. **Should show dry run without creating files** - `--dry-run` outputs what would be created but doesn't create
7. **Should output JSON when requested** - `--json` outputs valid JSON with `success: true`
8. **Should create all default folders and files** - Verify complete folder structure matches spec

**Expected Behaviors**:

- Exit code 0 on success, 1 on failure
- Creates `.orchestra/` with all subfolders
- Creates template files from embedded content
- JSON output contains `success`, `path`, `folders`, `files` fields
- Dry run shows preview but doesn't modify filesystem

**Sample Test Data**:

```typescript
const DEFAULT_FOLDERS = [
  'common/templates',
  'common/scripts',
  'orchestrator/.orchestrator-only/verification',
  'orchestrator/results',
  'handover/verification',
];

const DEFAULT_FILES = {
  'common/templates/current-task.md.hbs': 'template content',
  'common/templates/completion-signal.md.hbs': 'template content',
  'handover/.gitkeep': '',
};
```

## Implementation Details

### Files to Create

#### src/commands/init.ts

**What to create**:

- Command definition with options: `--spec`, `--force`, `--dry-run`, `--json`
- Directory structure creation for `.orchestra/` folder
- Default file creation (templates, config)
- Force mode to allow reinitialization
- Dry run mode to preview without creating
- JSON output mode for scripting

**Key functions**:

```typescript
interface InitOptions {
  spec?: string;
  force?: boolean;
  json?: boolean;
  dryRun?: boolean;
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Initialize Orchestra in this project')
    .option('--spec <path>', 'Path to SpecKit spec file')
    .option('-f, --force', 'Overwrite existing configuration')
    .option('--json', 'Output as JSON')
    .option('--dry-run', 'Show what would be created without creating')
    .action(async (options: InitOptions) => {
      await runInit(options);
    });
}

async function runInit(options: InitOptions): Promise<void> {
  // 1. Check if already initialized
  // 2. Create directory structure
  // 3. Create default files
  // 4. Create configuration
  // 5. Exit with appropriate code
}
```

#### src/lib/templates.ts

**What to create**:

- Handlebars template loader
- Template renderer with context
- Custom helpers registration (formatDate, statusIcon, eq)

**Code scaffold**:

```typescript
import Handlebars from 'handlebars';

export function loadTemplate(templateName: string): HandlebarsTemplateDelegate {
  const templatePath = getOrchestraPath(`common/templates/${templateName}.hbs`);
  const content = fs.readFileSync(templatePath, 'utf-8');
  return Handlebars.compile(content);
}

export function renderTemplate(templateName: string, context: Record<string, unknown>): string {
  const template = loadTemplate(templateName);
  return template(context);
}

export function registerHelpers(): void {
  Handlebars.registerHelper('formatDate', (date: string) => {
    return new Date(date).toLocaleDateString();
  });
  // ... more helpers
}
```

#### tests/commands/init.test.ts

**What to create**:

- Test suite with 8+ test cases
- Temp directory isolation using getTempDir()
- Mocking of process.cwd()
- Verification of created files and folders
- Error case testing (already initialized, etc.)

## Core Functions Available

From Task 2 (Core Libraries):

- `isOrchestraInitialized(cwd: string): boolean` - Check if already initialized
- `saveConfig(config: OrchestraConfig, cwd?: string): void` - Save config YAML
- `getDefaultConfig(): OrchestraConfig` - Get default configuration
- `getOrchestraPath(relativePath: string): string` - Resolve orchestra paths

## Quality Gates

Before signaling completion:

1. **Build**: `npm run build` must succeed
2. **Type check**: `npx tsc --noEmit` must pass
3. **Tests**: `npm test` must pass all tests
4. **Lint**: `npm run lint` must pass (if configured)

## Completion Protocol

When ready for review:

1. Run pre-signal check:

   ```powershell
   .\.orchestra\implementor\.implementor-only\scripts\pre-signal-check.ps1 -TaskId 4
   ```

2. Update `.orchestra/handover/completion-signal.md` with:

   - Task ID and status
   - What was implemented
   - Test results
   - Any notes

3. Signal ready: Say "ready for review" or "task complete"

---

_This handover was generated by Orchestra. Do not read files in `.orchestra/orchestrator/.orchestrator-only/`._
