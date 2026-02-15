# Contract: Test Command Interception

**Version**: 1.0.0 | **Scope**: Modification to existing `run_command` tool

## Overview

This is not a standalone tool but a behavioral contract for the interception hook added to the existing `run_command` tool. When an agent attempts to execute a test command through `run_command`, the interception layer detects it and returns an error redirecting the agent to the appropriate test runner tool.

## Blocked Command Patterns

```typescript
const BLOCKED_PATTERNS: RegExp[] = [
  /^npm\s+test/,
  /^npm\s+run\s+test/,
  /^npx\s+vitest/,
  /^vitest\b/,
  /^pnpm\s+test/,
  /^pnpm\s+run\s+test/,
  /^yarn\s+test/,
  /^yarn\s+run\s+test/,
  /^node_modules\/\.bin\/vitest/,
];
```

## Bypass Mechanism

Internal tool execution (from `VitestRunner`) bypasses the interception by using a flag or calling `child_process.spawn` directly rather than going through the `run_command` tool. The interception only applies to agent-initiated `run_command` invocations.

## Interception Output

When a test command is detected:

```
✗ run_command: TEST_COMMAND_BLOCKED

Direct test execution is blocked. Use the test runner tools for:
  • Scoped execution:     run_tests with scope="file", "pattern", "suite", "related"
  • TDD red-phase:        run_tests with scope="red"
  • Re-run failures:      run_tests with scope="failed"
  • Full suite:           run_tests with scope="all"
  • View past results:    get_test_results
  • Discover tests:       list_test_suites

These tools provide caching, compressed output, and red-phase isolation
that raw terminal commands cannot.
```

## Integration Point

The interception is added as a pre-execution check in `extension/src/agents/tools/system/runCommand.ts`, before the `spawn()` call:

```typescript
// In runCommand.ts invoke() method, before execution:
if (TestCommandInterceptor.isTestCommand(input.command)) {
  return errorResult(
    "run_command",
    ToolErrorCode.TEST_COMMAND_BLOCKED,
    TestCommandInterceptor.getRedirectMessage(input.command),
    "Use run_tests tool instead",
  );
}
```

## Scope

- Only intercepts commands going through the `run_command` agent tool
- Does NOT intercept:
  - Direct terminal usage by the human user
  - Internal `child_process.spawn` calls from `VitestRunner`
  - VS Code task execution
  - MCP server command tools
