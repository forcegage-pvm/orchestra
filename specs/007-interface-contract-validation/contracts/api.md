# API Contracts: Interface Contract Validation

**Feature**: 007-interface-contract-validation  
**Date**: 2026-01-22  
**Status**: Complete

## Core Functions

### loadValidationConfig

Load and parse the interface validation configuration file.

```typescript
/**
 * Load interface validation configuration from project
 * @param projectRoot - Root directory of the project
 * @returns Parsed and validated configuration
 * @throws ConfigurationError if file not found or invalid
 */
function loadValidationConfig(projectRoot: string): InterfaceValidationConfig;
```

### validatePatternExclusivity

Check that no file matches multiple validation patterns.

```typescript
/**
 * Verify patterns are mutually exclusive
 * @param config - Validation configuration
 * @param files - Files to check (or glob to find files)
 * @returns Array of files that match multiple patterns (empty if valid)
 * @throws ConfigurationError if patterns overlap
 */
function validatePatternExclusivity(
  config: InterfaceValidationConfig,
  files?: string[]
): string[];
```

### runValidation

Execute a single interface validation.

```typescript
/**
 * Run a validation against matching files
 * @param validation - The validation to run
 * @param projectRoot - Root directory
 * @returns Validation results for all matched files
 */
function runValidation(
  validation: InterfaceValidation,
  projectRoot: string
): Promise<ValidationResult[]>;
```

### runAllValidations

Execute all registered interface validations.

```typescript
/**
 * Run all validations in the configuration
 * @param config - Validation configuration
 * @param projectRoot - Root directory
 * @returns All validation results
 */
function runAllValidations(
  config: InterfaceValidationConfig,
  projectRoot: string
): Promise<ValidationResult[]>;
```

### validateJsonSchema

Validate a JSON Schema object against the meta-schema.

```typescript
/**
 * Validate a JSON Schema object is spec-compliant
 * @param schema - The JSON Schema object to validate
 * @param schemaName - Name for error messages
 * @returns Validation errors (empty array if valid)
 */
function validateJsonSchema(
  schema: object,
  schemaName?: string
): ValidationError[];
```

## MCP Tool: add_interface_validation

Add a new interface validation mid-sprint (FR-012).

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Unique name for this validation"
    },
    "description": {
      "type": "string",
      "description": "Human-readable description"
    },
    "patterns": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Glob patterns for files to validate"
    },
    "command": {
      "type": "string",
      "description": "Shell command to run (mutually exclusive with test)"
    },
    "test": {
      "type": "string",
      "description": "Test file path (mutually exclusive with command)"
    }
  },
  "required": ["name", "patterns"]
}
```

### Output

```json
{
  "success": true,
  "message": "Interface validation 'name' added successfully",
  "configPath": ".orchestra/interface-validations.yaml",
  "validation": { /* the added validation object */ }
}
```

### Errors

- `ConfigurationError`: If validation with same name already exists
- `ValidationError`: If patterns overlap with existing validations
- `ValidationError`: If neither command nor test specified

## Test Utilities

### createMcpSchemaValidator

Factory for MCP tool schema validation.

```typescript
/**
 * Create a validator for MCP tool inputSchema objects
 * @returns Validator function
 */
function createMcpSchemaValidator(): (schema: object) => ValidationError[];
```

### validateAllMcpToolSchemas

Convenience function for the reference implementation.

```typescript
/**
 * Validate all MCP tool schemas in the project
 * @param toolsPath - Path to tools.ts or tool definitions
 * @returns All validation results
 */
function validateAllMcpToolSchemas(
  toolsPath?: string
): ValidationResult[];
```

## Error Codes

| Code | Description |
|------|-------------|
| `INTERFACE_CONFIG_NOT_FOUND` | Config file doesn't exist |
| `INTERFACE_CONFIG_INVALID` | Config file fails schema validation |
| `INTERFACE_PATTERN_OVERLAP` | Multiple patterns match same file |
| `INTERFACE_VALIDATION_FAILED` | Validation command/test failed |
| `INTERFACE_TOOL_MISSING` | Required validation tool not installed |
| `JSON_SCHEMA_INVALID` | JSON Schema violates specification |
