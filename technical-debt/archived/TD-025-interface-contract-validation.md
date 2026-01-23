# TD-025: Interface Contract Validation

**Status**: SPEC_IN_PROGRESS  
**Priority**: P0 (Critical)  
**Created**: 2026-01-22  
**Sprint**: TBD (to be implemented after spec finalization)

---

## Problem Statement

Interface contract definitions (schemas, specs, configs) can be **syntactically valid code** but **semantically invalid according to their specification**. Our current workflow validates that:

- Code runs without errors
- Tests pass
- Files exist

But we do NOT validate that interface definitions comply with their specification. The specification validation happens at **runtime by external consumers** (VS Code MCP client, API gateways, SDK generators, package managers).

### Root Cause Incident

Sprint 006 shipped MCP tool `submit_code_review` with this schema:

```typescript
inputSchema: {
  properties: {
    issues: { type: "array" },  // ← INVALID: arrays require 'items'
  }
}
```

**What happened:**

- TypeScript compiled successfully
- All handler tests passed
- All integration tests passed
- VSIX built and installed successfully
- VS Code MCP client rejected the tool at runtime with: `array type must have items`

**Why it wasn't caught:**

- Our tests validate handler behavior, not JSON Schema spec compliance
- Zod schemas validate input parsing, not the MCP inputSchema objects
- No checkpoint in Orchestra workflow required interface validity checks

---

## Scope: Interface Contract Types

This pattern affects ANY external contract definition:

| Interface Type       | Specification        | Runtime Validator           | Common Errors                                      |
| -------------------- | -------------------- | --------------------------- | -------------------------------------------------- |
| MCP inputSchema      | JSON Schema Draft-07 | VS Code MCP client          | Array without `items`, object without `properties` |
| OpenAPI/Swagger      | OpenAPI 3.x          | API gateways, Swagger UI    | Invalid `$ref`, missing required fields            |
| GraphQL SDL          | GraphQL spec         | Apollo, graphql-js          | Invalid types, circular refs                       |
| JSON Schema          | JSON Schema spec     | ajv, json-schema validators | Invalid type, enum not array                       |
| protobuf             | proto3 syntax        | protoc compiler             | Reserved fields, invalid defaults                  |
| pubspec.yaml         | Dart pub spec        | `pub get`                   | Invalid dependency syntax                          |
| package.json         | npm spec             | npm/yarn                    | Invalid exports, missing main                      |
| tsconfig.json        | TypeScript spec      | tsc                         | Conflicting options                                |
| Dockerfile           | Dockerfile spec      | docker build                | Invalid instructions                               |
| GitHub Actions       | workflow schema      | GitHub                      | Invalid job syntax                                 |
| VS Code package.json | VS Code API          | VS Code                     | Invalid contributes                                |

---

## Solution: Defense in Depth

### Principle

**Run the same validation that will happen at runtime, BEFORE runtime.**

If VS Code will validate JSON Schema, we validate JSON Schema.  
If protoc will validate proto3, we run protoc.  
If npm will validate package.json, we run npm validation.

### Architecture: Three Enforcement Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                     DEFENSE IN DEPTH                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  LAYER 1: ORCHESTRATOR TASK PREPARATION                            │
│  ─────────────────────────────────────────                          │
│  Checkpoint: prepare_task                                           │
│  Strictness: SHOULD                                                 │
│  Action: Include interface validity checks in verification criteria │
│  Guidance: Agent instructions list interface types + required checks │
│                                                                      │
│  LAYER 2: CONTROLLER HANDOVER REVIEW                                │
│  ────────────────────────────────────                               │
│  Checkpoint: approve_handover / reject_handover                     │
│  Strictness: WARN → REJECT after 1 revision                         │
│  Action: Verify orchestrator added validity checks                  │
│  Guidance: Red flag if verification only has "tests pass"           │
│                                                                      │
│  LAYER 3: CONTROLLER CODE REVIEW                                    │
│  ─────────────────────────────────                                  │
│  Checkpoint: submit_code_review                                     │
│  Strictness: AUTOMATIC CHANGES_REQUESTED                            │
│  Action: Run actual runtime validation, fail if invalid             │
│  Guidance: "Interface validation failed" = BLOCKING issue           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Orchestrator Task Preparation

### Agent Instruction Additions

Add to `orchestra.orchestrator.agent.md`:

````markdown
## Verification Design: Interface Contract Validation

When a task modifies interface definitions, you MUST include verification
criteria that run the SAME validation the runtime consumer will run.

### Interface Types and Required Validation

| Interface Type  | Validation Command/Check                                       |
| --------------- | -------------------------------------------------------------- |
| MCP inputSchema | Test: validate all schemas against JSON Schema spec            |
| OpenAPI         | `npx @redocly/cli lint openapi.yaml` or `swagger-cli validate` |
| GraphQL SDL     | `graphql-inspector validate schema.graphql`                    |
| JSON Schema     | Test: validate against JSON Schema meta-schema                 |
| protobuf        | `protoc --proto_path=. file.proto`                             |
| pubspec.yaml    | `dart pub get --dry-run`                                       |
| package.json    | `npm pkg fix --dry-run` or custom validation                   |
| tsconfig.json   | `tsc --noEmit`                                                 |

### Verification Criteria Pattern

For any task touching interfaces, add:

```json
{
  "behavioral_checks": [
    {
      "description": "Interface definitions are spec-compliant",
      "command": "<validation command for interface type>",
      "expect_exit_code": 0,
      "severity": "BLOCKING"
    }
  ]
}
```
````

OR ensure a test exists that performs the validation.

````

---

## Layer 2: Controller Handover Review

### Agent Instruction Additions

Add to `orchestra.controller.agent.md` handover review section:

```markdown
### Interface Contract Validation Check (MANDATORY)

Before approving ANY handover, check if the task touches interface definitions:

1. Review file_operations for files matching:
   - `**/schema*`, `**/tools.ts`, `**/*.proto`, `**/openapi.*`
   - `**/package.json`, `**/pubspec.yaml`, `**/tsconfig.json`
   - `**/*.graphql`, `**/*.gql`, `**/Dockerfile`

2. If interface files are touched, verify verification criteria include:
   - Explicit interface validity check (behavioral_check or test reference)
   - NOT just "tests pass" or "file exists"

3. Decision:
   - First review: WARN if missing, recommend adding
   - After revision: REJECT if still missing

### Red Flag: Interface Task Without Validity Check

| Pattern | Action |
|---------|--------|
| Task modifies interface definitions | Check for validity verification |
| Verification only has "tests pass" | WARN first time, REJECT if not fixed |
| No behavioral check for spec compliance | REJECT with specific recommendation |
````

---

## Layer 3: Controller Code Review (STRICTEST)

### Principle: Actually Run The Validation

The Controller code review MUST:

1. Identify if task touched interface definitions
2. Run the actual runtime validation
3. AUTOMATIC CHANGES_REQUESTED if validation fails

This is NOT discretionary. Invalid interfaces = broken code.

### Agent Instruction Additions

Add to `orchestra.controller.agent.md` code review section:

````markdown
## Interface Contract Validation (AUTOMATIC FAIL)

### Step 1: Detect Interface Changes

Check git diff or file_operations for interface files:

- Schema definitions (JSON Schema, MCP tools, OpenAPI, GraphQL, protobuf)
- Package manifests (package.json, pubspec.yaml, Cargo.toml)
- Config files with external validators (tsconfig, Dockerfile, GitHub workflows)

### Step 2: Run Runtime Validation

Execute the SAME validation that the runtime consumer will execute:

| Interface Type            | Validation Command                                       |
| ------------------------- | -------------------------------------------------------- |
| MCP inputSchema (Node.js) | `npm test -- -t "schema validation"` or custom validator |
| OpenAPI                   | `npx @redocly/cli lint <file>`                           |
| GraphQL                   | `npx graphql-inspector validate <schema>`                |
| JSON Schema               | Validate against meta-schema                             |
| protobuf                  | `protoc --proto_path=. <file>`                           |
| pubspec.yaml              | `dart pub get --dry-run`                                 |
| package.json              | `npm pkg fix --dry-run` or `npx package-json-validator`  |
| tsconfig.json             | `npx tsc --noEmit`                                       |
| Dockerfile                | `docker build --check .` or `hadolint Dockerfile`        |
| GitHub Actions            | `actionlint`                                             |

### Step 3: Decision (NON-DISCRETIONARY)

| Validation Result | Code Review Decision            |
| ----------------- | ------------------------------- |
| Validation PASSES | Continue normal review          |
| Validation FAILS  | **AUTOMATIC CHANGES_REQUESTED** |

### Issue Template for Validation Failure

```json
{
  "severity": "BLOCKING",
  "issue": "Interface contract validation failed: <specific error>",
  "file": "<interface file>",
  "recommendation": "Fix the interface definition to comply with <spec name>. Error: <validation output>"
}
```
````

### This Is Not Discretionary

Interface validation failure is a **BLOCKING** issue. The code CANNOT work in production.

Do NOT:

- Approve with "minor issue" notes
- Classify as MAJOR instead of BLOCKING
- Skip validation because tests pass

The runtime consumer WILL reject the interface. Catch it here.

````

---

## Structural Enforcement Options

Beyond agent instructions, we can add structural enforcement to Orchestra itself:

### Option S1: Task Metadata Flag

Add `touches_interfaces` field to task configuration:

```typescript
interface Task {
  // ...existing fields
  touches_interfaces?: {
    types: ('json-schema' | 'openapi' | 'graphql' | 'protobuf' | 'package-manifest')[];
    files: string[];  // Specific files touched
  };
}
````

When set, Orchestra enforces:

- Verification criteria MUST include interface validity check
- Handover review MUST verify validity checks exist
- Code review MUST run validation

**Pros**: Explicit, auditable  
**Cons**: Relies on orchestrator setting it correctly

### Option S2: File Pattern Detection

Orchestra auto-detects interface files from file_operations:

```typescript
const INTERFACE_PATTERNS = {
  "json-schema": ["**/schema*.ts", "**/tools.ts", "**/*.schema.json"],
  openapi: ["**/openapi.yaml", "**/openapi.json", "**/swagger.*"],
  graphql: ["**/*.graphql", "**/*.gql", "**/schema.graphql"],
  protobuf: ["**/*.proto"],
  "package-manifest": ["**/package.json", "**/pubspec.yaml", "**/Cargo.toml"],
  config: ["**/tsconfig.json", "**/Dockerfile", "**/.github/workflows/*.yml"],
};
```

On `prepare_task`, if file_operations match patterns:

- Auto-add interface validity check to verification criteria
- OR warn orchestrator to add manually

**Pros**: Automatic, can't forget  
**Cons**: Heuristic, might miss custom patterns or false positive

### Option S3: Validation Command Registry

Orchestra maintains a registry of validation commands per interface type:

```typescript
interface ValidationRegistry {
  "json-schema": {
    patterns: ["**/*.schema.json", "**/tools.ts"];
    commands: {
      node: 'npm test -- -t "schema validation"';
      deno: 'deno test --filter "schema"';
    };
    description: "Validates JSON Schema definitions against spec";
  };
  // ...other types
}
```

On `run_verification_checks`, if task touches matching files:

- Automatically run the registered validation command
- Fail task if validation fails

**Pros**: Completely automatic, cannot be bypassed  
**Cons**: Registry maintenance, language-specific commands

### Option S4: Pre-Signal Check Template

Add interface validation as a pre-signal check template that activates when files match patterns:

```typescript
// In check-templates or pre-signal-executor
if (taskTouchesInterfaceFiles(artifacts)) {
  checks.push({
    type: "interface-validation",
    command: getValidationCommand(interfaceType, environment),
    severity: "BLOCKING",
    description: "Interface contract validation",
  });
}
```

**Pros**: Runs automatically at signal_completion  
**Cons**: Late in cycle (after implementation done)

---

## Recommended Implementation

### Phase 1: Agent Instructions (Immediate)

Update all three agent instruction files:

1. `orchestra.orchestrator.agent.md` - Verification design section
2. `orchestra.controller.agent.md` - Handover review section
3. `orchestra.controller.agent.md` - Code review section (strictest)

### Phase 2: Structural Enforcement (Future Sprint)

Implement Option S2 + S4:

- File pattern detection on `prepare_task`
- Auto-inject validation check on `run_verification_checks`

### Phase 3: Validation Registry (Future)

Build out validation command registry for common interface types:

- JSON Schema, OpenAPI, GraphQL, protobuf
- Package manifests (npm, pub, cargo)
- Config files (tsconfig, Dockerfile, GitHub Actions)

---

## Validation Test Requirements

For this Orchestra codebase, add permanent test:

```typescript
// test/mcp-server/tool-schema-validation.test.ts
// Validates ALL MCP tool inputSchema definitions against JSON Schema spec
// - Arrays must have 'items'
// - Objects should have 'properties'
// - Required fields must exist in properties
// - Type values must be valid
```

This test runs on every `npm test` and catches schema issues before they ship.

---

## Success Criteria

1. **Layer 1**: Orchestrator instructions include interface validation guidance
2. **Layer 2**: Controller handover review checks for validity verification
3. **Layer 3**: Controller code review runs actual validation, auto-fails if invalid
4. **Test**: Schema validation test exists and runs on CI
5. **Future**: Structural enforcement auto-detects and validates interfaces

---

## Open Questions

1. Should we maintain a validation command registry in Orchestra, or rely on project-specific configuration?
2. How do we handle projects where validation tools aren't installed? (e.g., protoc not in PATH)
3. Should `configure_sprint` require specifying interface types the project uses?

---

## References

- Incident: Sprint 006 MCP schema validation failure
- Related: TD-023 (Code Review Workflow Gaps)
- JSON Schema spec: https://json-schema.org/specification
- MCP Protocol: https://modelcontextprotocol.io/

---

## Structural Enforcement Strategy (Universal)

This section defines **meta-level solutions** that apply to ANY codebase, ANY language, ANY project type.

---

### The Fundamental Problem: Dual Representation

Most software systems that expose external interfaces have this structure:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DUAL REPRESENTATION PROBLEM                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SOURCE A: Internal Implementation    SOURCE B: External Contract           │
│  ─────────────────────────────────   ────────────────────────────           │
│  Type definitions in code             Schema/spec consumed by clients       │
│  Runtime validation logic             API definition documents              │
│  Handler parameter types              SDK generation inputs                 │
│                                                                              │
│  Examples:                            Examples:                              │
│  - TypeScript interfaces              - JSON Schema                          │
│  - Python type hints                  - OpenAPI/Swagger                      │
│  - Go struct definitions              - GraphQL SDL                          │
│  - Java POJOs                         - Protobuf .proto files                │
│                                                                              │
│  ⚠️ WHEN MANUALLY SYNCHRONIZED → HUMAN ERROR IS INEVITABLE                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**The compiler validates Source A. Nothing validates Source B.**

Compilation success means "the code is internally consistent." It does NOT mean "the external contract is valid according to its specification."

---

### Why Compilers Don't Catch This

Compilers validate **language syntax and type relationships**. They do NOT validate **semantic correctness of data objects against external specifications**.

```
// In ANY typed language:
interface_definition = {
  "type": "array"    // ← Compiler: valid string ✓
}                    // ← JSON Schema spec: INVALID (arrays require 'items') ✗
```

The compiler sees a valid object with string properties. It has no knowledge that JSON Schema Draft-07 requires arrays to have an `items` property.

**This gap exists in every language:**

| Language   | Compiler Validates                    | Compiler Does NOT Validate         |
| ---------- | ------------------------------------- | ---------------------------------- |
| TypeScript | Object structure, property types      | JSON Schema semantics              |
| Python     | Syntax, basic types (with mypy)       | Pydantic → JSON Schema correctness |
| Go         | Struct fields, interface satisfaction | OpenAPI annotation validity        |
| Rust       | Ownership, trait bounds               | Serde attribute semantics          |
| Java       | Type hierarchy, generics              | Jackson annotation validity        |

---

### The Four Universal Strategies

#### Strategy 1: Derivation (Eliminate Dual Representation)

**Principle**: Define the contract ONCE. Generate the other representation.

```
┌─────────────────────────────────────────────────────────────┐
│                    DERIVATION                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  SINGLE SOURCE                        DERIVED OUTPUT         │
│  ─────────────                        ──────────────         │
│  Code types/validation          →     External schema        │
│       OR                                                     │
│  External schema                →     Code types/validation  │
│                                                              │
│  ✅ Drift is IMPOSSIBLE by construction                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Pattern A: Code-First (derive schema from code)**

| Language    | Source          | Tool                     | Output      |
| ----------- | --------------- | ------------------------ | ----------- |
| TypeScript  | Zod schemas     | `zod-to-json-schema`     | JSON Schema |
| TypeScript  | io-ts codecs    | `io-ts-to-json-schema`   | JSON Schema |
| Python      | Pydantic models | `BaseModel.schema()`     | JSON Schema |
| Python      | dataclasses     | `dataclasses-jsonschema` | JSON Schema |
| Rust        | Serde structs   | `schemars` crate         | JSON Schema |
| Go          | Struct tags     | `go-jsonschema`          | JSON Schema |
| Java/Kotlin | POJOs           | `jsonschema-generator`   | JSON Schema |

**Pattern B: Schema-First (derive code from schema)**

| Source      | Tool                        | Output                         |
| ----------- | --------------------------- | ------------------------------ |
| JSON Schema | `json-schema-to-typescript` | TypeScript types               |
| JSON Schema | `quicktype`                 | Any language                   |
| OpenAPI     | `openapi-generator`         | Client/server in 40+ languages |
| Protobuf    | `protoc`                    | Language-specific bindings     |
| GraphQL SDL | `graphql-codegen`           | TypeScript types/resolvers     |

**When to use**:

- Greenfield projects
- Projects with budget for refactoring
- When long-term maintenance cost matters more than short-term effort

**Effort**: HIGH initial, ZERO ongoing

---

#### Strategy 2: Meta-Validation (Validate Contracts at Build Time)

**Principle**: Add a test that validates interface definitions against their specification.

```
┌─────────────────────────────────────────────────────────────┐
│                    META-VALIDATION                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  BUILD PIPELINE                                              │
│  ──────────────                                              │
│  1. Compile code           → Validates internal consistency  │
│  2. Run unit tests         → Validates logic correctness     │
│  3. Run META-TEST          → Validates contract spec         │
│     ↓                         compliance                     │
│  Iterate over all exported schemas                           │
│  Validate each against its specification                     │
│  FAIL BUILD if any are invalid                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Universal pattern**:

```
// Pseudocode - applies to any language
function meta_test():
    schemas = get_all_exported_interface_definitions()

    for schema in schemas:
        validator = get_spec_validator(schema.spec_type)
        errors = validator.validate(schema)

        if errors:
            fail_test(f"Interface {schema.name} is invalid: {errors}")
```

**Spec validators by interface type**:

| Interface Type | Validator                 | Validation Method                       |
| -------------- | ------------------------- | --------------------------------------- |
| JSON Schema    | AJV, jsonschema           | Validate against meta-schema            |
| OpenAPI 3.x    | @redocly/cli, swagger-cli | `openapi lint`                          |
| OpenAPI 2.0    | swagger-tools             | `swagger validate`                      |
| GraphQL SDL    | graphql-js                | `buildSchema()` throws on invalid       |
| Protobuf       | protoc                    | `protoc --descriptor_set_out=/dev/null` |
| AsyncAPI       | @asyncapi/parser          | Parse and validate                      |
| JSON:API       | jsonapi-validator         | Validate document structure             |

**When to use**:

- Existing codebases where derivation is too expensive
- Polyglot systems with multiple interface types
- As defense-in-depth alongside derivation

**Effort**: LOW initial, LOW ongoing

---

#### Strategy 3: Runtime Self-Validation (Fail Fast)

**Principle**: Server validates its own interface definitions at startup.

```
┌─────────────────────────────────────────────────────────────┐
│                    RUNTIME SELF-VALIDATION                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  SERVER STARTUP                                              │
│  ──────────────                                              │
│  1. Load interface registry                                  │
│  2. For each registered interface:                           │
│     - Validate against spec                                  │
│     - If invalid → LOG ERROR + EXIT(1)                       │
│  3. If all valid → Continue to serve                         │
│                                                              │
│  ✅ Invalid contracts NEVER serve traffic                    │
│  ✅ Catches issues during local development                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Universal pattern**:

```
// Pseudocode - applies to any server framework
function on_server_start():
    interfaces = get_interface_registry()
    errors = []

    for interface in interfaces:
        validation_result = validate_against_spec(interface)
        if not validation_result.valid:
            errors.append(f"{interface.name}: {validation_result.errors}")

    if errors:
        log.fatal("Invalid interface definitions detected:")
        for error in errors:
            log.fatal(f"  - {error}")
        exit(1)

    log.info("All interface definitions validated successfully")
    start_serving()
```

**Framework integration points**:

| Framework Type          | Hook Point                        |
| ----------------------- | --------------------------------- |
| HTTP servers            | Before `listen()` / startup event |
| gRPC servers            | Before `serve()`                  |
| GraphQL servers         | During schema build               |
| Message queue consumers | Before subscribing                |
| Serverless functions    | Cold start initialization         |

**When to use**:

- Development environments (can disable in prod for performance)
- As defense-in-depth (catches issues tests missed)
- When deployment bypasses CI (hotfixes, emergency patches)

**Effort**: LOW initial, ZERO ongoing

---

#### Strategy 4: Consumer Simulation (End-to-End Validation)

**Principle**: Run the actual consumer validation as part of your build.

```
┌─────────────────────────────────────────────────────────────┐
│                    CONSUMER SIMULATION                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  If your interface will be validated by X, run X yourself   │
│                                                              │
│  Examples:                                                   │
│  - OpenAPI → Generate client SDK (if generation fails,      │
│              your spec is invalid)                           │
│  - Protobuf → Run protoc (if compilation fails,             │
│               your .proto is invalid)                        │
│  - GraphQL → Run codegen (if it fails, schema is invalid)   │
│  - npm package → Run `npm pack --dry-run`                   │
│                                                              │
│  ✅ Proves what the consumer will see                        │
│  ✅ Catches issues meta-validation might miss                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Implementation patterns**:

| Interface Type | Consumer Simulation Command                                                |
| -------------- | -------------------------------------------------------------------------- |
| OpenAPI        | `openapi-generator generate -i spec.yaml -g typescript-fetch -o /tmp/test` |
| Protobuf       | `protoc --python_out=/tmp/test *.proto`                                    |
| GraphQL        | `graphql-codegen --config codegen.yml`                                     |
| JSON Schema    | `json-schema-to-typescript schema.json > /tmp/test.ts`                     |
| npm package    | `npm pack --dry-run && npm publish --dry-run`                              |
| Docker image   | `docker build --check .` (BuildKit)                                        |

**When to use**:

- When your interface feeds into code generation
- When third parties consume your interface
- When meta-validation isn't sufficient

**Effort**: MEDIUM initial, LOW ongoing

---

### Defense in Depth: Layering Strategies

No single strategy is sufficient. Layer them:

```
┌─────────────────────────────────────────────────────────────┐
│                    DEFENSE IN DEPTH                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  LAYER 1: DERIVATION (if feasible)                          │
│  ────────────────────────────────                            │
│  → Eliminates dual representation entirely                   │
│  → Drift is impossible by construction                       │
│                                                              │
│  LAYER 2: META-VALIDATION TEST (always)                     │
│  ──────────────────────────────────────                      │
│  → Catches spec violations at build time                     │
│  → Works even if derivation isn't used                       │
│                                                              │
│  LAYER 3: RUNTIME SELF-VALIDATION (development)             │
│  ──────────────────────────────────────────────              │
│  → Catches issues during local dev loops                     │
│  → Defense against skipped tests                             │
│                                                              │
│  LAYER 4: CONSUMER SIMULATION (CI/CD)                       │
│  ────────────────────────────────────                        │
│  → Proves the actual consumer will accept                    │
│  → Catches edge cases meta-validation misses                 │
│                                                              │
│  LAYER 5: PROCESS GATES (orchestration)                     │
│  ──────────────────────────────────────                      │
│  → Require validation checks in task definitions             │
│  → Human/agent review verifies validation exists             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

### Universal Checklist for Any Project

#### Step 1: Inventory Interface Types

| Question                                          | Action                                       |
| ------------------------------------------------- | -------------------------------------------- |
| What external contracts does this project expose? | List all schema/spec files                   |
| What specification governs each contract?         | Map file → spec (JSON Schema, OpenAPI, etc.) |
| What validates each contract at runtime?          | Identify the consumer/validator              |

#### Step 2: Assess Current State

| Question                                       | Red Flag                        |
| ---------------------------------------------- | ------------------------------- |
| Are contracts manually synchronized with code? | Dual representation risk        |
| Does the build validate contract specs?        | Spec violations can ship        |
| Does the server validate contracts at startup? | Invalid contracts serve traffic |

#### Step 3: Select Strategy Mix

| Situation                             | Recommended Strategies          |
| ------------------------------------- | ------------------------------- |
| Greenfield project                    | Derivation + Meta-Test          |
| Existing codebase, time available     | Derivation refactor + Meta-Test |
| Existing codebase, no refactor budget | Meta-Test + Runtime Validation  |
| High-stakes API (public, regulated)   | All five layers                 |

#### Step 4: Implement and Verify

| Verification              | Method                                      |
| ------------------------- | ------------------------------------------- |
| Derivation works          | Break source, verify output changes         |
| Meta-test catches issues  | Introduce invalid schema, verify test fails |
| Runtime validation works  | Deploy invalid schema to dev, verify crash  |
| Consumer simulation works | Break spec, verify generation fails         |

---

### The Golden Rule

> **If an external system will validate your interface, YOUR build must run that same validation first.**

| ❌ Insufficient | ✅ Sufficient                     |
| --------------- | --------------------------------- |
| "Code compiles" | + Meta-test validates schema spec |
| "Tests pass"    | + Consumer simulation succeeds    |
| "Handler works" | + Runtime self-validation passes  |
