# Task 2: Core Libraries

## Overview

Implement the core library modules that all commands depend on. This includes type definitions, error handling, YAML utilities, configuration management, manifest parsing, and progress tracking.

**Category**: INFRASTRUCTURE  
**Depends on**: Task 1 (Project Setup) ✅ Completed

## Spec File

📄 **Detailed requirements**: `spec/implementation/phase-1-cli/tasks/1.2-core-libraries.md`

Please read the spec file for full implementation details including code samples.

## Objectives

1. Create type-safe error hierarchy
2. Define core data models (manifest, task, config) with Zod schemas
3. Implement YAML file I/O utilities  
4. Build configuration management system
5. Create manifest parser and validator
6. Implement progress tracking module
7. Build consistent output formatting utilities

## Acceptance Criteria

- [ ] All modules compile without TypeScript errors
- [ ] Zod schemas validate sample data correctly
- [ ] YAML read/write works with nested structures
- [ ] Error types have proper inheritance chain
- [ ] Config can be loaded from nested directories
- [ ] Manifest CRUD operations work correctly
- [ ] Progress entries are timestamped correctly
- [ ] Output formatting is consistent and readable
- [ ] Unit tests pass for all modules
- [ ] No CLI imports in src/core/ (pure library code)

## Files to Create/Modify

### Files to CREATE:

| File | Purpose |
|------|---------|
| `src/core/errors.ts` | Error classes: OrchestraError, ConfigurationError, ManifestError, etc. |
| `src/core/yaml.ts` | YAML read/write utilities with validation |
| `src/core/progress.ts` | Progress log management, entry tracking |
| `test/core/errors.test.ts` | Error class tests |
| `test/core/yaml.test.ts` | YAML utility tests |
| `test/core/config.test.ts` | Config loading tests |
| `test/core/progress.test.ts` | Progress tracking tests |

### Files to MODIFY (replace stubs with implementations):

| File | Changes |
|------|---------|
| `src/core/types.ts` | Replace basic types with full Zod schemas |
| `src/core/manifest.ts` | Replace stubs with manifest CRUD operations |
| `src/core/config.ts` | Replace stubs with config loading, root detection |
| `src/core/output.ts` | Replace stubs with chalk/ora formatting |
| `src/core/validation.ts` | Replace stubs with Zod validation helpers |
| `src/core/index.ts` | Create barrel export for all modules |
| `test/core/types.test.ts` | Expand to test Zod schema validation |
| `test/core/manifest.test.ts` | Expand to test manifest operations |

## Technical Context

### Current State

The project already has scaffold files in place from Task 1:
- `src/core/types.ts` - Has basic types, needs Zod schemas
- `src/core/manifest.ts` - Has function stubs with TODOs
- `src/core/config.ts` - Has function stubs with TODOs
- `src/core/output.ts` - Has function stubs with TODOs

### Dependencies Available

```json
{
  "commander": "^12.1.0",
  "yaml": "^2.6.0",
  "zod": "^3.23.8",
  "chalk": "^5.4.1",
  "ora": "^8.2.0"
}
```

### Pattern Guidelines

1. **Use Zod for all schema definitions** - Provides runtime validation + TypeScript inference
2. **Error hierarchy** - All errors extend `OrchestraError`
3. **Pure library code** - No CLI dependencies (commander) in src/core/
4. **ESM modules** - Use `.js` extensions in imports
5. **Async where appropriate** - File operations can be sync for simplicity

## Code Examples from Spec

See the spec file for complete implementation examples. Key patterns:

```typescript
// Example Zod schema
import { z } from 'zod';

export const TaskStatusSchema = z.enum([
  'not-started', 'in-progress', 'blocked', 'completed', 'failed', 'skipped'
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
```

```typescript
// Example error class
export class OrchestraError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'OrchestraError';
  }
}
```

## Getting Started

1. Read the full spec file at `spec/implementation/phase-1-cli/tasks/1.2-core-libraries.md`
2. Review existing stubs in `src/core/`
3. Implement modules in this order:
   - `errors.ts` (no dependencies)
   - `types.ts` (Zod schemas)
   - `yaml.ts` (uses errors)
   - `config.ts` (uses yaml)
   - `manifest.ts` (uses yaml, config)
   - `progress.ts` (uses yaml, config)
   - `output.ts` (standalone formatting)
   - `index.ts` (re-exports)
4. Write tests alongside implementations
5. Verify with `npm run build` and `npm test`

## Quality Gates

Before signaling completion, verify:

```bash
# Build must pass
npm run build

# Type checking must pass  
npm run typecheck

# All tests must pass
npm test

# Verify no CLI imports in core
grep -r "commander" src/core/  # Should return nothing
```

## Completion Protocol

When done, create your completion signal by writing to `.orchestra/handover/completion-signal.md`:

```markdown
# Task 2 Completion Signal

## Files Created
- [list new files]

## Files Modified
- [list modified files with summary of changes]

## Test Results
- [paste test output showing X tests passed]

## Build Status
- [confirm build passes]

## Notes
- [any deviations from spec or decisions made]
```

---

_This handover was generated by Orchestra. Do not read files in `.orchestra/orchestrator/.orchestrator-only/`._
