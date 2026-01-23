# Quickstart: Interface Contract Validation

**Feature**: 007-interface-contract-validation  
**Date**: 2026-01-22

## Overview

Interface Contract Validation ensures that external contract definitions (schemas, specs, configs) are validated against their specifications before shipping to production. This prevents the class of bugs where code compiles successfully but runtime consumers reject the interface.

## Quick Setup

### 1. Create Configuration File

Create `.orchestra/interface-validations.yaml`:

```yaml
version: "1.0"
validations:
  - name: mcp-tool-schemas
    description: Validate MCP tool inputSchema definitions
    patterns:
      - "src/mcp-server/tools.ts"
      - "src/schemas/**/*.ts"
    test: "test/mcp-server/tool-schema-validation.test.ts"
```

### 2. Create Validation Test

Create `test/mcp-server/tool-schema-validation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { validateJsonSchema } from "../../src/core/interface-validation.js";
import { TOOLS_WITH_ROLES } from "../../src/mcp-server/tools.js";

describe("MCP Tool Schema Validation", () => {
  it.each(TOOLS_WITH_ROLES.map(t => [t.name, t]))
    ("tool '%s' has valid JSON Schema", (name, tool) => {
      const errors = validateJsonSchema(tool.inputSchema, name);
      expect(errors).toEqual([]);
    });
});
```

### 3. Run Validation

```bash
npm test -- --grep "MCP Tool Schema"
```

## Common Patterns

### Validate JSON Schema

```typescript
import { validateJsonSchema } from "./core/interface-validation.js";

const schema = {
  type: "object",
  properties: {
    items: { type: "array" }, // ❌ Missing 'items' property!
  },
};

const errors = validateJsonSchema(schema, "MyTool");
// errors = [{ path: "properties.items", message: "Array type requires 'items'" }]
```

### Mid-Sprint Validation Registration

Implementors often discover new interface types while implementing a task (for example, a new OpenAPI file, a new config schema, or a new protobuf). Waiting for a new sprint to register validation creates drift between what is shipped and what is validated. Mid-sprint registration lets you add validation immediately so verification can cover the newly discovered interface.

#### Configure Sprint Integration (FR-011)

At sprint setup time, `configure_sprint` can reference interface validations so the verification pipeline knows what to run. Use this when the interface types are already known during planning.

Example (excerpt):

```json
{
  "environment": {
    "interface_validations": [
      {
        "name": "mcp-tool-schemas",
        "patterns": ["src/mcp-server/tools.ts", "src/schemas/**/*.ts"],
        "test": "test/mcp-server/tool-schema-validation.test.ts"
      }
    ]
  }
}
```

#### Mid-Sprint Registration (FR-012)

When new interface files appear during implementation, use the `add_interface_validation` MCP tool to register validation immediately.

##### Tool Usage

Required parameters:
- `name`: string
- `patterns`: string[] (glob patterns for interface files)
- Exactly one of:
  - `command`: string (shell command to run validation)
  - `test`: string (test path to run validation)

Optional parameters:
- `description`: string
- `successCriteria`: object
  - `exitCode`: number
  - `outputContains`: string
  - `outputNotContains`: string

Example using a command:

```
add_interface_validation({
  name: "openapi-spec",
  description: "Validate OpenAPI contract",
  patterns: ["api/openapi.yaml"],
  command: "npx @redocly/cli lint api/openapi.yaml"
})
```

Example using a test with success criteria:

```
add_interface_validation({
  name: "grpc-protos",
  patterns: ["proto/**/*.proto"],
  test: "test/validation/proto-validation.test.ts",
  successCriteria: {
    exitCode: 0,
    outputContains: "Validation passed",
    outputNotContains: "ERROR"
  }
})
```

##### Workflow Steps

1. Identify the new interface type and file patterns (e.g., OpenAPI, protobuf, config schema).
2. Decide the validation method:
   - Use `command` for CLI-based validators.
   - Use `test` for custom validation tests.
3. Call `add_interface_validation` with `name`, `patterns`, and exactly one of `command` or `test`.
4. Re-run validation to confirm the new rule passes.
5. Ensure future task verification includes the new validation.

If you prefer not to use the tool, you can edit `.orchestra/interface-validations.yaml` directly.

### Pattern Examples

| Interface Type | Patterns |
|----------------|----------|
| MCP Schemas | `"src/schemas/**/*.ts"`, `"**/tools.ts"` |
| OpenAPI | `"**/openapi.yaml"`, `"**/swagger.json"` |
| Package.json | `"package.json"`, `"**/package.json"` |
| TypeScript Config | `"tsconfig*.json"` |
| Protobuf | `"**/*.proto"` |

### Validation Commands

| Interface Type | Command |
|----------------|---------|
| OpenAPI | `npx @redocly/cli lint <file>` |
| Package.json | `npm pkg fix --dry-run` |
| TypeScript | `npx tsc --noEmit` |
| Protobuf | `protoc --proto_path=. <file>` |

## Agent Workflow

### For Orchestrators

When preparing a task that modifies interface files:

1. Check if patterns cover the files being modified
2. Add validation to verification criteria:
   ```json
   {
     "behavioral_checks": [{
       "description": "Interface definitions are spec-compliant",
       "command": "npm test -- --grep 'schema validation'",
       "severity": "BLOCKING"
     }]
   }
   ```

### For Controllers

During handover review:
- Verify interface-modifying tasks include validation checks
- Warn if missing (first time), reject if still missing (after revision)

During code review:
- Verify validation tests passed
- Auto-CHANGES_REQUESTED if interface validation fails

## Troubleshooting

### "Array type requires 'items'"

```typescript
// ❌ Invalid
{ type: "array" }

// ✅ Valid
{ type: "array", items: { type: "string" } }
```

### "Patterns overlap"

Two validations match the same file. Make patterns more specific:

```yaml
# ❌ Overlapping
- patterns: ["src/**/*.ts"]
- patterns: ["src/schemas/**/*.ts"]

# ✅ Specific
- patterns: ["src/mcp-server/**/*.ts"]
- patterns: ["src/schemas/**/*.ts"]
```

### "Validation tool not installed"

Install the required tool and ensure it's in PATH:

```bash
npm install -D @redocly/cli  # For OpenAPI
npm install -D ajv           # For JSON Schema
```
