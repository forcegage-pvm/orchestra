# Research: Interface Contract Validation

**Feature**: 007-interface-contract-validation  
**Date**: 2026-01-22  
**Status**: Complete

## Research Questions

### 1. JSON Schema Meta-Validation

**Question**: How do we validate that a JSON Schema object itself is valid according to JSON Schema specification?

**Finding**: 
- JSON Schema has a "meta-schema" that defines what a valid JSON Schema looks like
- AJV (Another JSON Schema Validator) supports validating schemas against the meta-schema
- For JSON Schema Draft-07 (used by MCP): `ajv.validateSchema(schema)` or validate against `http://json-schema.org/draft-07/schema#`

**Decision**: Use AJV with `validateSchema()` method to validate MCP tool inputSchema objects.

**Alternatives Considered**:
- `json-schema` package: Less maintained, fewer features
- `jsonschema` package: Python-focused ecosystem
- Manual validation: Error-prone, incomplete

### 2. Common JSON Schema Errors

**Question**: What are the most common JSON Schema errors we need to catch?

**Finding** (from TD-025 analysis):
1. **Array without `items`**: `{ type: "array" }` is technically valid but semantically incomplete
2. **Object without `properties`**: Similar issue for object types
3. **Required fields not in properties**: `required: ["foo"]` but no `properties.foo`
4. **Invalid type values**: `type: "Array"` (wrong case) or `type: "int"` (not a valid JSON Schema type)
5. **Circular references**: `$ref` loops that cause infinite recursion

**Decision**: AJV's `validateSchema()` catches most of these. Add custom checks for "array without items" since this is valid but problematic.

### 3. Config File Format and Location

**Question**: Where should interface validation configuration be stored?

**Finding**:
- Orchestra already uses `.orchestra/` directory for project configuration
- YAML with Zod validation is the standard pattern (Constitution III)
- Config should persist across sprints (FR-010)

**Decision**: Store in `.orchestra/interface-validations.yaml`

```yaml
# .orchestra/interface-validations.yaml
version: "1.0"
validations:
  - name: "mcp-tool-schemas"
    description: "Validate MCP tool inputSchema against JSON Schema spec"
    patterns:
      - "**/tools.ts"
      - "**/schema*.ts"
    command: "npm test -- --grep 'schema validation'"
    # OR test reference:
    test: "test/mcp-server/tool-schema-validation.test.ts"
```

### 4. MCP Tool Schema Extraction

**Question**: How do we extract inputSchema objects from MCP tool definitions for validation?

**Finding**:
- MCP tools are defined in `src/mcp-server/tools.ts` as `TOOLS_WITH_ROLES` array
- Each tool has an `inputSchema` property that's a JSON Schema object
- We can import and iterate over all tools programmatically

**Decision**: Create a test file that:
1. Imports all tool definitions
2. Iterates over each tool's `inputSchema`
3. Validates each against JSON Schema meta-schema
4. Adds custom checks for "array without items"

### 5. Mid-Sprint Validation Addition

**Question**: How should new validations be added mid-sprint (FR-012)?

**Finding**:
- Orchestra MCP server already has tools for configuration changes
- Could add an `add_interface_validation` MCP tool
- OR could use file-based amendment (edit config file directly)
- Must work for both Orchestrator and Controller roles

**Decision**: Dual approach:
1. **MCP Tool**: `add_interface_validation` for structured addition (orchestrator role)
2. **File Edit**: Direct YAML edit for simple cases (any role)

Both approaches trigger config reload.

### 6. Agent Instruction Integration Points

**Question**: Where in agent instructions should interface validation guidance go?

**Finding**:
- `orchestra.orchestrator.agent.md`: Has "Verification Design" sections already
- `orchestra.controller.agent.md`: Has "Handover Review" and "Code Review" sections
- Instructions are ~1000-2000 lines each; need precise insertion points

**Decision**: Add new subsections:
- Orchestrator: Add "Interface Contract Validation" under verification design
- Controller: Add interface validation checks to both handover review and code review sections

## Technical Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Schema Validator | AJV | Industry standard, supports meta-validation |
| Config Location | `.orchestra/interface-validations.yaml` | Follows existing patterns |
| Config Format | YAML + Zod | Constitution requirement |
| Reference Implementation | Test file | Runs automatically with `npm test` |
| Mid-Sprint Addition | MCP tool + file edit | Flexibility for different workflows |

## Dependencies

| Package | Purpose | Status |
|---------|---------|--------|
| ajv | JSON Schema validation | To be added |
| ajv-formats | Additional format validators | Optional |

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| AJV version conflicts | Pin specific version, test with existing deps |
| Performance impact | Validate only on test run, not build |
| False positives | Start with strict rules, relax if needed |
| Config file conflicts | Clear merge strategy in documentation |

## Next Steps

1. Create data model for interface validation config (Phase 1)
2. Define API contracts for validation functions (Phase 1)
3. Generate tasks for implementation (Phase 2)
