# Quickstart: Enhanced Agent Tools

**Feature**: `010-tool-enhance`  
**Estimated Implementation**: ~48 hours (21 tasks)

## Prerequisites

- VS Code Extension development environment set up
- Node.js 18+ installed
- `extension/` project builds successfully: `cd extension && npm run build`
- Vitest test runner working: `cd extension && npm test`

## Development Setup

```powershell
# Clone and setup (if not already done)
cd "x:\Cloud Storage\Dropbox\Repositories\vs code\orchestra"
git checkout 010-tool-enhance

# Install dependencies
npm install
cd extension && npm install

# Verify build
npm run build
npm test
```

## Implementation Order

### Phase 1: Foundation Infrastructure (First)

Start with infrastructure components as all terminal tools depend on them:

1. **ProcessManager** (`infrastructure/ProcessManager.ts`) - 4h
   - Singleton pattern for process lifecycle
   - Process state machine (STARTING → RUNNING → READY → STOPPED)
   - Cleanup on extension deactivation

2. **OutputBuffer** (`infrastructure/OutputBuffer.ts`) - 2h
   - Ring buffer with 500-line default
   - Head/tail truncation (20%/80%)
   - ANSI escape code cleanup

3. **FuzzyMatcher** (`infrastructure/FuzzyMatcher.ts`) - 3h
   - Levenshtein distance calculation
   - Match cascade: exact → normalized → fuzzy
   - Middle-out search from line hints

### Phase 2: Terminal Tools

Build in dependency order:

1. **run_command** - depends on ProcessManager, OutputBuffer
2. **start_process / stop_process** - depends on ProcessManager
3. **get_process_output / list_processes** - depends on ProcessManager
4. **send_input** - depends on ProcessManager
5. **wait_for_pattern** - depends on ProcessManager
6. **find_port_process** - standalone + ProcessManager query
7. **execute_with_retry** - wrapper around run_command

### Phase 3: File Editing Tools

Build in dependency order:

1. **smart_replace** - depends on FuzzyMatcher
2. **edit_lines** - standalone
3. **insert_at_line / delete_section** - variants of edit_lines
4. **validate_edit** - standalone
5. **bulk_replace** - standalone

### Phase 4: File Operations

All standalone, can be built in parallel:

1. **move_file**
2. **copy_file**
3. **move_directory**

## Testing Strategy

Each tool requires a corresponding test file:

```
extension/test/agents/tools/
├── infrastructure/
│   ├── ProcessManager.test.ts
│   ├── OutputBuffer.test.ts
│   └── FuzzyMatcher.test.ts
├── system/
│   ├── runCommand.test.ts
│   └── ...
├── coding/
│   ├── smartReplace.test.ts
│   └── ...
└── filesystem/
    ├── moveFile.test.ts
    └── ...
```

Run tests:

```powershell
cd extension
npm test                 # All tests
npm test -- --watch      # Watch mode
npm test -- --coverage   # Coverage report
```

## Key Interfaces

See [data-model.md](data-model.md) for complete type definitions.

### ProcessManager

```typescript
class ProcessManager {
  start(input: StartProcessInput): Promise<StartProcessResult>;
  stop(id: string, timeout?: number): Promise<StopProcessResult>;
  getOutput(id: string, options?: GetOutputOptions): string;
  getProcess(id: string): ProcessInfo | undefined;
  listProcesses(): ProcessInfo[];
  cleanup(): void;
}
```

### FuzzyMatcher

```typescript
class FuzzyMatcher {
  findMatch(
    content: string,
    search: string,
    options?: MatchOptions,
  ): MatchResult;
  static levenshteinDistance(a: string, b: string): number;
  static similarityRatio(a: string, b: string): number;
}
```

## Success Criteria

- [ ] All 18 tools implemented and tested
- [ ] > 80% code coverage
- [ ] ProcessManager cleans up on extension deactivation
- [ ] `run_command` works when shell integration unavailable
- [ ] `smart_replace` finds matches with fuzzy threshold ≥0.85
- [ ] Zero zombie processes after agent session ends

## Common Patterns

### Tool Implementation Pattern

```typescript
import { ToolResult, ToolError } from "../types.js";
import { ProcessManager } from "../infrastructure/ProcessManager.js";

export async function runCommandTool(
  input: RunCommandInput,
): Promise<ToolResult<RunCommandResult>> {
  try {
    const pm = ProcessManager.getInstance();
    // Implementation...
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: new ToolError("run_command", error.message),
    };
  }
}
```

### Path Validation (SEC-001)

```typescript
function validatePathInWorkspace(path: string, workspaceRoot: string): void {
  const resolved = nodePath.resolve(workspaceRoot, path);
  if (!resolved.startsWith(workspaceRoot)) {
    throw new ToolError("path_traversal", "Path must be within workspace");
  }
}
```
