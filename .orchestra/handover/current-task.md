# Task 2.1: Core Libraries Implementation

## Overview

Implement the core library modules that were scaffolded in Task 1. All files exist with stub implementations (`throw new Error("Not implemented")`) - your job is to implement the actual functionality.

## Spec File

📄 **Detailed requirements**: `spec/implementation/phase-1-cli/tasks/1.2-core-libraries.md`

The spec file contains complete code samples for each module. Use them as reference.

## Acceptance Criteria

- [ ] `src/core/yaml.ts` - Implement YAML read/write utilities with Zod validation
- [ ] `src/core/config.ts` - Implement config loading, finding orchestra root
- [ ] `src/core/manifest.ts` - Implement manifest CRUD, task queries
- [ ] `src/core/progress.ts` - Implement progress tracking
- [ ] All functions that currently `throw new Error("Not implemented")` must be implemented
- [ ] No CLI imports in `src/core/` (core must be independent)
- [ ] `npm run build` succeeds without errors
- [ ] `npm test` passes all tests
- [ ] Add unit tests for yaml.ts, config.ts, manifest.ts, progress.ts

## Dependencies

- Task 1.1 completed ✅ (project setup + scaffolding done)

## Current State

The following files exist but have **stub implementations** that throw errors:

| File | Functions to Implement |
|------|------------------------|
| `src/core/yaml.ts` | `readYaml`, `writeYaml`, `yamlExists` |
| `src/core/config.ts` | `findOrchestraRoot`, `loadConfig`, `saveConfig`, `getOrchestraPath`, `isOrchestraInitialized` |
| `src/core/manifest.ts` | `getManifestPath`, `manifestExists`, `loadManifest`, `saveManifest`, `getTask`, `getCurrentTask`, `getNextTask`, `updateTaskStatus`, `getTaskStats` |
| `src/core/progress.ts` | `getProgressPath`, `loadProgress`, `saveProgress`, `addProgressEntry`, `getLastEntryForTask`, `getAttemptCount` |

## Files to MODIFY

### 1. `src/core/yaml.ts`

**Current**: Stub functions throwing errors
**Required**: Implement using `yaml` package (already installed)

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import { FileError, ValidationError } from './errors.js';

export function readYaml<T>(filePath: string, schema: z.ZodType<T>): T {
  const absolutePath = path.resolve(filePath);
  
  if (!fs.existsSync(absolutePath)) {
    throw new FileError(`File not found: ${filePath}`, { path: absolutePath });
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  const parsed = parse(content);
  
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    throw new ValidationError(`Validation failed for: ${filePath}`, errors, {
      path: absolutePath,
    });
  }

  return result.data;
}

export function writeYaml<T>(filePath: string, data: T, options?: { createDir?: boolean }): void {
  const absolutePath = path.resolve(filePath);
  
  if (options?.createDir) {
    const dir = path.dirname(absolutePath);
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = stringify(data, { indent: 2 });
  fs.writeFileSync(absolutePath, content, 'utf-8');
}

export function yamlExists(filePath: string): boolean {
  return fs.existsSync(path.resolve(filePath));
}
```

### 2. `src/core/config.ts`

**Current**: Only `getDefaultConfig` implemented
**Required**: Implement path resolution and config loading

Key implementation notes:
- `findOrchestraRoot` should search upward from startDir to find `.orchestra/` folder
- `loadConfig` should read `orchestra.yaml` from the `.orchestra/` folder
- `getOrchestraPath` resolves paths relative to the orchestra directory

### 3. `src/core/manifest.ts`

**Current**: All stub functions
**Required**: Implement manifest CRUD operations

Key implementation notes:
- Use `getOrchestraPath('manifest.yaml')` for path
- `getTask` finds by task ID
- `getCurrentTask` returns first in-progress OR first available not-started
- `getNextTask` returns first not-started task with satisfied dependencies
- `updateTaskStatus` updates task and returns new manifest (immutable)

### 4. `src/core/progress.ts`

**Current**: Only `createProgressLog` implemented
**Required**: Implement progress tracking

Key implementation notes:
- Use `getOrchestraPath('progress.yaml')` for path
- `addProgressEntry` should auto-add timestamp
- Entries are append-only log

## Files to CREATE

### 1. `test/core/yaml.test.ts`

Create tests for yaml utilities:
- `readYaml` with valid YAML
- `readYaml` with invalid YAML (should throw)
- `readYaml` with validation failure (should throw ValidationError)
- `writeYaml` creates file
- `yamlExists` returns correct boolean

### 2. `test/core/config.test.ts`

Create tests for config:
- `findOrchestraRoot` finds root in current dir
- `findOrchestraRoot` finds root in parent dir
- `findOrchestraRoot` returns null when not found
- `loadConfig` loads valid config
- `getOrchestraPath` resolves correctly

### 3. `test/core/manifest.test.ts`

Create tests for manifest:
- `loadManifest` loads and validates
- `getTask` finds by ID
- `getCurrentTask` returns in-progress first
- `getNextTask` respects dependencies
- `updateTaskStatus` updates correctly
- `getTaskStats` counts correctly

### 4. `test/core/progress.test.ts`

Create tests for progress:
- `createProgressLog` initializes correctly
- `addProgressEntry` adds with timestamp
- `getLastEntryForTask` returns correct entry
- `getAttemptCount` counts correctly

## Test Utilities

You may need to create a test setup file. Create `test/setup.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let tempDir: string;

export function getTempDir(): string {
  if (!tempDir) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-test-'));
  }
  return tempDir;
}

export function createTempFile(filename: string, content: string): string {
  const filePath = path.join(getTempDir(), filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function cleanupTempDir(): void {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = '';
  }
}
```

## Quality Gates

Before signaling completion, verify:

```powershell
# 1. Build succeeds
npm run build

# 2. Tests pass
npm test

# 3. No "Not implemented" errors remain
# (manually verify by calling functions)

# 4. Type check passes
npm run typecheck
```

## Anti-Patterns to AVOID

❌ DO NOT import from `src/cli/` in core modules
❌ DO NOT use `console.log` for output (use errors)
❌ DO NOT modify the existing types.ts (already complete)
❌ DO NOT modify the existing errors.ts (already complete)
❌ DO NOT create new files in src/core/ - only modify existing stubs

## Completion Protocol

When done, create `.orchestra/handover/completion-signal.md` with:

```markdown
# Completion Signal

## Task: 2.1 - Core Libraries Implementation

## Summary
Implemented all core library modules.

## Changes Made
- src/core/yaml.ts: Implemented readYaml, writeYaml, yamlExists
- src/core/config.ts: Implemented findOrchestraRoot, loadConfig, saveConfig, getOrchestraPath, isOrchestraInitialized  
- src/core/manifest.ts: Implemented all manifest operations
- src/core/progress.ts: Implemented all progress operations
- test/core/*.test.ts: Added unit tests

## Verification
- [ ] npm run build: SUCCESS
- [ ] npm test: X tests passing
- [ ] npm run typecheck: SUCCESS
- [ ] No "Not implemented" errors remain
```

---

_This handover was generated by Orchestra. Do not read files in `.orchestra/orchestrator/.orchestrator-only/`._
