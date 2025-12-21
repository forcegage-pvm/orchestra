# TD-019: Behavioral Check Path Resolution

**Priority**: HIGH  
**Status**: OPEN  
**Created**: 2025-12-21  
**Sprint**: Discovered during Sprint 003D  

## Problem Statement

Behavioral checks in verification criteria use relative paths that fail on Windows systems with spaces in paths. During Sprint 003D, multiple tasks (5, 8, 9) had verification failures due to commands like:

```powershell
cd extension; Get-Content 'src/extension.ts' -Raw; ...
```

The error returned:
```
The system cannot find the path specified.
```

## Root Cause

1. **Relative paths in commands**: `cd extension` assumes execution from workspace root
2. **MCP server working directory**: The `run_verification_checks` handler doesn't set working directory to workspace root before executing commands
3. **Windows path spaces**: The workspace path `x:\Cloud Storage\Dropbox\Repositories\vs code\orchestra` contains spaces, requiring quoted paths

## Impact

- Behavioral checks consistently fail even when implementation is correct
- Orchestrator must escalate tasks to fix verification criteria
- Manual verification required as workaround
- Sprint velocity reduced due to repeated escalations

## Affected Tasks in Sprint 003D

| Task | Description | Workaround Applied |
|------|-------------|-------------------|
| 5 | Refactor ChatInvoker | Converted to structural checks |
| 8 | Remove @orchestra participant | Converted to structural checks |
| 9 | Update extension.ts | Converted to structural checks |

## Required Solution

### Option A: MCP Server Fix (Recommended)

Update `run_verification_checks` handler to:

1. Resolve workspace root from active sprint
2. Set working directory before executing behavioral commands
3. Expand relative paths in commands to absolute paths

```typescript
// In run_verification_checks handler
async function executeBehavioralCheck(check: BehavioralCheck, workspaceRoot: string) {
  // Replace relative paths with absolute
  let command = check.command;
  
  // Handle 'cd extension' pattern
  command = command.replace(/^cd extension;/, `cd "${workspaceRoot}/extension";`);
  
  // Execute with proper working directory
  const result = await exec(command, { cwd: workspaceRoot });
  // ...
}
```

### Option B: Validation at Configure Time

Add validation during `configure_sprint` to:

1. Detect relative paths in behavioral commands
2. Warn or error if paths aren't absolute
3. Auto-expand paths using workspace root

### Option C: Cross-Platform Command Templates

Provide command templates that work across platforms:

```typescript
const templates = {
  fileContains: (path: string, pattern: string) => 
    process.platform === 'win32'
      ? `$content = Get-Content '${path}' -Raw; if ($content -match '${pattern}') { exit 0 } else { exit 1 }`
      : `grep -q '${pattern}' '${path}'`,
  
  fileNotContains: (path: string, pattern: string) =>
    process.platform === 'win32'
      ? `$content = Get-Content '${path}' -Raw; if ($content -match '${pattern}') { exit 1 } else { exit 0 }`
      : `! grep -q '${pattern}' '${path}'`,
};
```

## Acceptance Criteria

1. [ ] Behavioral checks with relative paths execute correctly
2. [ ] Commands work on both Windows and Unix systems
3. [ ] Workspace paths with spaces are properly quoted
4. [ ] Existing structural checks continue to work
5. [ ] No manual path fixing required during sprint configuration

## Workaround (Current)

Convert behavioral checks to structural checks where possible:

```typescript
// Instead of behavioral check:
{
  "command": "cd extension; if (Get-Content 'src/file.ts' -Raw -match '@orchestra') { exit 1 }",
  "expect_exit_code": 0
}

// Use structural check:
{
  "path": "extension/src/file.ts",
  "pattern": "SessionManager",  // Check for expected pattern instead
  "severity": "BLOCKING"
}
```

## Related

- Sprint 003D: SessionManager Implementation
- Tasks 5, 8, 9: Required escalation due to this issue
- TD-018: Sprint Configuration Gap Analysis (broader configuration validation)
