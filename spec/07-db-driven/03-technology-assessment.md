# Technology Assessment — Database-Driven Orchestra

**Status**: Draft  
**Date**: 2025-12-08  
**Purpose**: Evaluate technology choices for MCP-based Orchestra implementation

---

## 1. Overview

This document evaluates key technology decisions for the database-driven Orchestra architecture:

1. **Persistence Layer** — How to store sprint/task/verification data
2. **MCP Transport** — How agents communicate with the MCP server
3. **Validation Framework** — How to enforce Eager Validation principle
4. **Schema Management** — How to version and migrate data structures

---

## 2. Persistence Layer

### 2.1 Requirements

- Store sprint configuration (tasks, dependencies, verification criteria)
- Track workflow state (current task, status transitions, attempts)
- Maintain history/audit trail (who did what, when)
- Support CRUD operations with atomic transactions
- Enable concurrent access (orchestrator + implementor + system)
- **Role-based access control** (orchestrator sees all, implementor sees handover only)

### 2.2 Options

#### Option A: SQLite

**Description**: Embedded SQL database, single file

**Pros:**
- ✅ Zero configuration, no server needed
- ✅ ACID transactions built-in
- ✅ Well-understood SQL query model
- ✅ Excellent performance for single-user scenarios
- ✅ Easy backup (single file)
- ✅ Node.js support: `better-sqlite3` (synchronous, fast)

**Cons:**
- ❌ Limited concurrent write access (locks entire DB)
- ❌ No network access (all operations local)
- ❌ Schema migrations require manual SQL
- ❌ No built-in role-based access control

**Best For**: Single-user Orchestra instances, local development

---

#### Option B: PostgreSQL

**Description**: Full-featured SQL database server

**Pros:**
- ✅ Excellent concurrent access (MVCC)
- ✅ Advanced features (JSON columns, full-text search, triggers)
- ✅ Network access (remote MCP server possible)
- ✅ Mature migration tools (e.g., `node-pg-migrate`)
- ✅ Row-level security for role-based access

**Cons:**
- ❌ Requires server installation and configuration
- ❌ More complex setup (connection pooling, auth)
- ❌ Overkill for single-user local scenarios
- ❌ Harder to backup/restore

**Best For**: Team scenarios, remote MCP servers, production deployments

---

#### Option C: File-Based (Enhanced YAML/JSON)

**Description**: Structured files with locking mechanism

**Pros:**
- ✅ Simple, transparent (files are readable)
- ✅ Easy backup (git-friendly)
- ✅ No database dependencies
- ✅ Familiar from v1 Orchestra

**Cons:**
- ❌ No transactions (corruption risk on crash)
- ❌ Manual locking complexity
- ❌ No query capabilities (must load entire file)
- ❌ Difficult to enforce referential integrity
- ❌ Race conditions on concurrent access

**Best For**: Prototyping, very simple scenarios (but we've moved beyond this)

---

#### Option D: Hybrid (SQLite + File Export)

**Description**: SQLite as source of truth, periodic YAML export for inspection

**Pros:**
- ✅ All SQLite benefits (transactions, queries)
- ✅ Human-readable exports for debugging
- ✅ Git-friendly (exported YAML can be committed)
- ✅ Best of both worlds

**Cons:**
- ❌ Slightly more complexity (export mechanism)
- ❌ Export can be out-of-sync with DB

**Best For**: Local development with git integration desired

---

### 2.3 Recommendation

**Phase 1: SQLite** (single-user, local MCP server)
- Simplest setup, zero configuration
- Perfect for initial development and testing
- Node.js library: `better-sqlite3` (synchronous, type-safe)

**Phase 2: PostgreSQL** (team/remote scenarios)
- Migrate when network access or concurrency needed
- Can reuse SQL queries from SQLite (mostly compatible)

**Export Mechanism**: Optional — add `orchestra export` command to dump DB to YAML for git commits

---

## 3. MCP Transport

### 3.1 Requirements

- Agent ↔ MCP Server communication
- Support for tool calls and responses
- Minimal latency
- Reliable error handling

### 3.2 Options

#### Option A: stdio (Standard Input/Output)

**Description**: MCP server runs as subprocess, communicates via stdin/stdout

**How it works:**
```
┌─────────┐   stdin/stdout   ┌────────────┐
│ Claude  │ ←──────────────→ │ MCP Server │
│  Agent  │   JSON-RPC       │ (process)  │
└─────────┘                  └────────────┘
```

**Pros:**
- ✅ Standard MCP pattern, well-supported by Claude Desktop
- ✅ Simple: no network configuration
- ✅ Secure: no exposed ports
- ✅ Works offline

**Cons:**
- ❌ Server must run on same machine as client
- ❌ One client per server instance
- ❌ No subscriptions/push notifications

**Best For**: Local development, single-user scenarios

---

#### Option B: SSE (Server-Sent Events)

**Description**: MCP server runs as HTTP server, client connects via SSE

**How it works:**
```
┌─────────┐      HTTP/SSE      ┌────────────┐
│ Claude  │ ←─────────────────→ │ MCP Server │
│  Agent  │  (network)          │  (HTTP)    │
└─────────┘                     └────────────┘
```

**Pros:**
- ✅ Network access (remote MCP server)
- ✅ Multiple clients can connect
- ✅ Push notifications/subscriptions possible
- ✅ Can expose to team

**Cons:**
- ❌ More complex (HTTP server, authentication)
- ❌ Security concerns (need auth, TLS)
- ❌ Not all MCP clients support SSE yet
- ❌ Network dependency

**Best For**: Team scenarios, remote access, future-proofing

---

### 3.3 Recommendation

**Phase 1: stdio**
- Simplest, matches current MCP ecosystem
- Claude Desktop and most MCP clients expect stdio
- Sufficient for single-user local Orchestra

**Phase 2: SSE** (when needed)
- Add when team access or remote server required
- Can support both transports simultaneously

---

## 4. Validation Framework

### 4.1 Requirements

Per the **Eager Validation principle**:
- Every tool call validates all applicable constraints
- Fail fast with structured error messages
- Provide actionable guidance on failures

### 4.2 Options

#### Option A: Manual Validation

**Description**: Hand-written validation logic in each tool handler

**Pros:**
- ✅ Full control, maximum flexibility
- ✅ No dependencies

**Cons:**
- ❌ Repetitive, error-prone
- ❌ Inconsistent error formats
- ❌ Hard to test validation separately

**Best For**: Very simple projects (not Orchestra)

---

#### Option B: Zod Schema Validation

**Description**: Define schemas with Zod, validate inputs/outputs

**Pros:**
- ✅ Already used in Orchestra v1 (`src/core/types.ts`)
- ✅ Type-safe (TypeScript types inferred from schemas)
- ✅ Consistent error messages
- ✅ Composable validators
- ✅ Runtime + compile-time safety

**Cons:**
- ❌ Limited to data shape validation (not business rules)

**Best For**: Input/output validation, data integrity

---

#### Option C: Business Rules Layer

**Description**: Separate validation functions for business logic

**Example:**
```typescript
// Zod validates shape
const AddTaskInput = z.object({
  task_id: z.number(),
  dependencies: z.array(z.number())
});

// Business rules validate constraints
function validateAddTask(input: AddTaskInput, state: SprintState) {
  // Check dependencies exist
  for (const dep of input.dependencies) {
    if (!state.tasks.has(dep)) {
      throw new ValidationError("INVALID_DEPENDENCY", {
        task_id: input.task_id,
        missing_dependency: dep,
        valid_tasks: Array.from(state.tasks.keys())
      });
    }
  }
  
  // Check for cycles
  if (createsCycle(state.graph, input.task_id, input.dependencies)) {
    throw new ValidationError("CIRCULAR_DEPENDENCY", {
      task_id: input.task_id,
      cycle_path: findCycle(...)
    });
  }
}
```

**Pros:**
- ✅ Separates data validation from business logic
- ✅ Testable in isolation
- ✅ Clear error messages with context

**Cons:**
- ❌ More code to write and maintain

**Best For**: Complex business rules (like Orchestra)

---

### 4.3 Recommendation

**Hybrid: Zod + Business Rules**

1. **Zod** for input/output shape validation (already in Orchestra codebase)
2. **Business Rules Layer** for domain constraints (cycles, dependencies, state transitions)
3. **Structured Errors** using existing `OrchestraError` hierarchy from `src/core/errors.ts`

**Pattern:**
```typescript
async function handleAddTask(params: unknown) {
  // Step 1: Validate input shape with Zod
  const input = AddTaskInputSchema.parse(params);
  
  // Step 2: Validate business rules
  const state = await loadSprintState();
  validateAddTask(input, state);
  
  // Step 3: Execute
  const result = await db.addTask(input);
  
  // Step 4: Validate output shape with Zod
  return AddTaskOutputSchema.parse(result);
}
```

---

## 5. Schema Management

### 5.1 Requirements

- Version database schema as it evolves
- Migrate existing data when schema changes
- Track which migrations have been applied
- Rollback capability for testing

### 5.2 Options

#### Option A: Manual SQL Migrations

**Description**: Write SQL files, apply manually

**Pros:**
- ✅ Full control
- ✅ No dependencies

**Cons:**
- ❌ Error-prone (easy to forget migrations)
- ❌ No rollback support
- ❌ Hard to track which migrations applied

**Best For**: Tiny projects with stable schemas

---

#### Option B: Migration Library

**Options:**
- `node-pg-migrate` (PostgreSQL-focused)
- `knex` (query builder + migrations)
- `drizzle-orm` (modern TypeScript ORM with migrations)
- `kysely` (type-safe SQL builder with migrations)

**Pros:**
- ✅ Automated tracking of applied migrations
- ✅ Up/down migration support
- ✅ Consistent tooling

**Cons:**
- ❌ Additional dependency
- ❌ Learning curve

---

#### Option C: ORM with Migrations

**Options:**
- `drizzle-orm` — Lightweight, TypeScript-first, minimal runtime
- `prisma` — Full-featured, great DX, heavier
- `typeorm` — Mature, feature-rich, more complex

**Pros:**
- ✅ Type-safe queries
- ✅ Automated migrations from schema changes
- ✅ Consistent API

**Cons:**
- ❌ Abstraction layer (less control)
- ❌ Can be heavyweight

---

### 5.3 Recommendation

**For SQLite Phase 1: Drizzle ORM**

**Rationale:**
- Lightweight, minimal runtime overhead
- TypeScript-first (aligns with Orchestra's strict typing)
- Schema defined in TypeScript, migrations auto-generated
- Supports both SQLite and PostgreSQL (easy migration path)
- Simple, predictable SQL generation

**Example:**
```typescript
// schema.ts
export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Migrations generated automatically from schema changes
// Applied via: drizzle-kit generate && drizzle-kit migrate
```

**Alternative for Phase 2 (PostgreSQL):** Same Drizzle schema, just switch dialect

---

## 6. Additional Technology Choices

### 6.1 Testing

**Unit Tests:**
- Continue using **Vitest** (already in `vitest.config.ts`)
- Fast, TypeScript-native, compatible with existing test suite

**Integration Tests:**
- Use in-memory SQLite for fast test execution
- Seed test database with factory functions

### 6.2 CLI Interface

**Current:** Commander.js (`src/cli.ts`)

**For MCP Server:** Keep separate from CLI
- CLI: Commands that orchestrate MCP tool calls
- MCP Server: Standalone process that exposes tools

**Architecture:**
```
┌───────────────┐
│   CLI (v1)    │  orchestra prepare --task 1
│  Commander.js │           ↓
└───────────────┘  [Still works, calls core directly]

┌───────────────┐
│  CLI (v2)     │  orchestra-mcp start
│  Commander.js │           ↓
└───────┬───────┘  [Starts MCP server]
        │
        ↓
┌───────────────┐
│  MCP Server   │  ← Claude Desktop connects here
│   (stdio)     │     via MCP tool calls
└───────────────┘
```

### 6.3 Type Safety

**Continue:** Zod schemas + inferred TypeScript types pattern from `src/core/types.ts`

**Pattern:**
```typescript
// Define schema
const TaskSchema = z.object({
  id: z.number(),
  title: z.string(),
  status: z.enum(["PENDING", "PREPARED", "IN_PROGRESS", "COMPLETED"])
});

// Infer type
type Task = z.output<typeof TaskSchema>;

// Validate runtime data
const task = TaskSchema.parse(data);
```

---

## 7. Technology Stack Summary

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Persistence** | SQLite (Phase 1) | Zero-config, perfect for local single-user |
| **Future DB** | PostgreSQL (Phase 2) | When network/concurrency needed |
| **ORM/Migrations** | Drizzle ORM | Lightweight, TypeScript-first, SQLite→Postgres path |
| **MCP Transport** | stdio (Phase 1) | Standard MCP pattern, simple setup |
| **Future Transport** | SSE (Phase 2) | When remote access needed |
| **Validation** | Zod + Business Rules | Input/output shape + domain constraints |
| **Error Handling** | OrchestraError hierarchy | Already established in `src/core/errors.ts` |
| **Testing** | Vitest | Already in use, fast, TypeScript-native |
| **Node.js Runtime** | Node 18+ (ESM) | Already required by Orchestra v1 |
| **Type System** | TypeScript 5.3+ (strict) | Already configured in `tsconfig.json` |

---

## 8. Migration Path from v1 to v2

### Phase 1: Add MCP Server (File-based coexistence)

1. Keep existing file-based core (`src/core/*.ts`)
2. Add MCP server that wraps core functions
3. CLI commands continue to work (call core directly)
4. Agents can call either CLI or MCP tools

### Phase 2: Introduce Database

1. Add Drizzle ORM + SQLite schema
2. Create migration layer: read from files, write to DB
3. MCP server uses DB instead of files
4. CLI remains compatible (reads from DB)

### Phase 3: Pure Database

1. Remove file I/O from core
2. All operations via database

---

## 9. Dependency Installation

**New dependencies needed:**

```json
{
  "dependencies": {
    "drizzle-orm": "^0.29.0",
    "better-sqlite3": "^9.2.0",
    "@modelcontextprotocol/sdk": "^0.6.1"  // Already installed
  },
  "devDependencies": {
    "drizzle-kit": "^0.20.0",  // For migrations
    "@types/better-sqlite3": "^7.6.8"
  }
}
```

---

## 10. Open Questions

1. ~~**Export Format**: Should `orchestra export` generate YAML files compatible with v1 structure, or a new format?~~

   **RESOLVED**: Export feature removed. Unnecessary complexity. SQLite DB file is the source of truth and can be backed up directly.

2. ~~**Concurrent Access**: Do we need to handle multiple MCP server instances accessing the same SQLite DB? (Probably not for Phase 1)~~

   **RESOLVED**: Single server process + WAL mode. One MCP server handles all tool calls (both orchestrator and implementor roles). Enable SQLite Write-Ahead Logging (WAL) mode for improved concurrent read/write performance. Sufficient for single-machine sequential workflow.

3. ~~**Backup Strategy**: Should the system auto-backup the SQLite DB before destructive operations?~~

   **RESOLVED**: No auto-backup. Git version control is sufficient. Users commit the SQLite `.db` file to git and can revert to any previous state. Use database transactions for atomic operations (standard practice).

4. ~~**Git Integration**: Should the MCP server auto-commit to git like v1 CLI does, or is that a separate concern?~~

   **RESOLVED**: Auto-commit with configuration. MCP server commits DB to git after successful tool calls, exactly like v1 CLI behavior. Support both:
   - **System-wide config**: `orchestra.yaml` setting for default auto-commit behavior
   - **Per-command override**: Tool parameters can disable auto-commit for specific calls
   
   This maintains consistency with v1 and provides automatic audit trail.

5. ~~**Schema Evolution**: How do we handle agents with old MCP tool schemas talking to new server versions?~~

   **RESOLVED**: Strict versioning. Breaking changes are allowed. Server version must match agent expectations. No legacy compatibility burden.
   
   - MCP server advertises version in server info
   - Tools can change parameters, response formats freely
   - Tools can be renamed or removed
   - Agents must update to use new server versions
   
   **Rationale**: Orchestra is under active development. Clean evolution without technical debt is more important than backward compatibility. MCP's built-in tool discovery (`list_tools`) means agents learn schemas dynamically, making updates straightforward.

---

## 11. Next Steps

1. ✅ Technology choices documented (this document)
2. ⏭️ Define database schema (Drizzle tables)
3. ⏭️ Define MCP tool schemas (TypeScript interfaces for all tools)
4. ⏭️ Implement core MCP server scaffold
5. ⏭️ Implement first tool (`configure_sprint`) end-to-end as proof of concept

---

## Appendix: Technology References

- **SQLite**: https://www.sqlite.org/
- **better-sqlite3**: https://github.com/WiseLibs/better-sqlite3
- **Drizzle ORM**: https://orm.drizzle.team/
- **MCP SDK**: https://github.com/modelcontextprotocol/typescript-sdk
- **Zod**: https://zod.dev/
- **Vitest**: https://vitest.dev/
