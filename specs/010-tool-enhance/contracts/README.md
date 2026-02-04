# Tool Contracts: Enhanced Agent Tools

This directory contains TypeScript interface contracts for all 18 tools.

## Tool Categories

### Terminal Tools (9)

- [terminal-tools.ts](terminal-tools.ts) - All terminal/process management tools

### File Editing Tools (6)

- [file-editing-tools.ts](file-editing-tools.ts) - Smart replace, line editing, validation, bulk replace

### File Operations (3)

- [file-operations.ts](file-operations.ts) - Move/copy file and directory operations

## Contract Format

Each tool contract includes:

- Input interface (parameters)
- Output interface (return type)
- Error codes
- Usage examples

## Implementation Mapping

| Contract                   | Implementation Path                                 |
| -------------------------- | --------------------------------------------------- |
| `RunCommandInput/Result`   | `extension/src/agents/tools/system/runCommand.ts`   |
| `StartProcessInput/Result` | `extension/src/agents/tools/system/startProcess.ts` |
| `SmartReplaceInput/Result` | `extension/src/agents/tools/coding/smartReplace.ts` |
| `MoveFileInput/Result`     | `extension/src/agents/tools/filesystem/moveFile.ts` |
| ...                        | ...                                                 |

See [data-model.md](../data-model.md) for complete type definitions.
