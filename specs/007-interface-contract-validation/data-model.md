# Data Model: Interface Contract Validation

**Feature**: 007-interface-contract-validation  
**Date**: 2026-01-22  
**Status**: Complete

## Entities

### InterfaceValidation

Represents a single interface validation registration.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Unique identifier for this validation |
| description | string | No | Human-readable description |
| patterns | string[] | Yes | Glob patterns for files to validate |
| command | string | No* | Shell command to run for validation |
| test | string | No* | Path to test file that performs validation |
| successCriteria | object | No | Expected outcomes (exit code, output patterns) |

*One of `command` or `test` is required.

### InterfaceValidationConfig

Root configuration object for the project.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| version | string | Yes | Config schema version (e.g., "1.0") |
| validations | InterfaceValidation[] | Yes | List of registered validations |

### ValidationResult

Result of running a validation.

| Field | Type | Description |
|-------|------|-------------|
| validationName | string | Name of the validation that ran |
| file | string | File that was validated |
| passed | boolean | Whether validation passed |
| errors | ValidationError[] | List of specific errors if failed |

### ValidationError

Specific error from a validation failure.

| Field | Type | Description |
|-------|------|-------------|
| path | string | JSON path to the error (e.g., "properties.issues.items") |
| message | string | Human-readable error message |
| rule | string | The specification rule that was violated |
| severity | "error" \| "warning" | Error severity |

## Relationships

```
InterfaceValidationConfig
    └── has many → InterfaceValidation
                       └── produces many → ValidationResult
                                              └── has many → ValidationError
```

## State Transitions

Interface validations have no state - they are configuration-driven.

Files being validated can be:
- **Matched**: File matches one or more patterns (error if multiple per FR-002a)
- **Unmatched**: File matches no patterns (no validation per clarification)
- **Validated**: Validation has run
- **Passed/Failed**: Validation outcome

## Validation Rules

### Pattern Exclusivity (FR-002a)
```
For all files F:
  patterns_matched = count of validations where any pattern matches F
  ASSERT patterns_matched <= 1
  IF patterns_matched > 1:
    ERROR "Configuration error: File matches multiple patterns"
```

### Required Fields
```
For each InterfaceValidation V:
  ASSERT V.name is non-empty
  ASSERT V.patterns has at least 1 entry
  ASSERT V.command XOR V.test (exactly one must be set)
```

## Zod Schema (Implementation Reference)

```typescript
import { z } from "zod";

const InterfaceValidationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  patterns: z.array(z.string().min(1)).min(1),
  command: z.string().optional(),
  test: z.string().optional(),
  successCriteria: z.object({
    exitCode: z.number().default(0),
    outputContains: z.string().optional(),
    outputNotContains: z.string().optional(),
  }).optional(),
}).refine(
  (data) => data.command || data.test,
  { message: "Either 'command' or 'test' must be specified" }
).refine(
  (data) => !(data.command && data.test),
  { message: "Only one of 'command' or 'test' can be specified" }
);

const InterfaceValidationConfigSchema = z.object({
  version: z.string().regex(/^\d+\.\d+$/),
  validations: z.array(InterfaceValidationSchema).min(1),
});

export type InterfaceValidation = z.output<typeof InterfaceValidationSchema>;
export type InterfaceValidationConfig = z.output<typeof InterfaceValidationConfigSchema>;
```

## Example Configuration

```yaml
# .orchestra/interface-validations.yaml
version: "1.0"
validations:
  - name: mcp-tool-schemas
    description: Validate MCP tool inputSchema definitions against JSON Schema spec
    patterns:
      - "src/mcp-server/tools.ts"
      - "src/schemas/**/*.ts"
    test: "test/mcp-server/tool-schema-validation.test.ts"
    
  - name: package-json
    description: Validate package.json against npm spec
    patterns:
      - "package.json"
      - "**/package.json"
    command: "npm pkg fix --dry-run"
    successCriteria:
      exitCode: 0
```
