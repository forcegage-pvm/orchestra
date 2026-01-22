# Test Suite

Orchestra's test suite for the MCP server and core business logic.

## Quick Start

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode for TDD
npm run test:coverage # With coverage report
```

## Test Structure

```
test/
├── setup/              # Test infrastructure (CRITICAL - read first)
│   ├── db-cache.ts     # Database caching for 5x faster tests
│   ├── global-setup.ts # Vitest global setup
│   └── README.md       # Detailed documentation
├── core/               # Tests for src/core/
├── mcp-server/         # Tests for src/mcp-server/handlers/
├── integration/        # Cross-cutting integration tests
├── db/                 # Database schema and migration tests
├── commands/           # CLI command tests
└── schemas/            # Zod schema tests
```

## Required Test Pattern (CRITICAL)

All tests that use the database MUST use the shared cache pattern:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../src/db/index.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

describe("My Test Suite", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("my-test-");
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  it("should work", async () => {
    const db = getDb();
    // ... your test
  });
});
```

**Why?** This pattern runs migrations ONCE per test session instead of per test file, achieving **5x faster tests** (~18s vs ~95s).

See [test/setup/README.md](setup/README.md) for detailed documentation.

## Writing New Tests

1. **Mirror source structure**: `src/core/foo.ts` → `test/core/foo.test.ts`
2. **Use the database cache pattern** (above)
3. **Import from `.js` extensions**: `import { x } from "../../src/core/x.js"`
4. **Use vitest**: `describe`, `it`, `expect`, `vi.mock()`

## Test Categories

### Unit Tests (`test/core/`, `test/schemas/`)

- Test individual functions in isolation
- Mock external dependencies
- Fast execution

### Handler Tests (`test/mcp-server/`)

- Test MCP tool handlers end-to-end
- Use real database (via cache pattern)
- Validate input/output schemas

### Integration Tests (`test/integration/`)

- Test cross-cutting workflows
- Multiple handlers working together
- Full lifecycle scenarios

## Common Patterns

### Setting up a sprint with tasks

```typescript
const db = getDb();

// Create sprint
db.insert(sprints)
  .values({
    id: "test-sprint",
    name: "Test Sprint",
    status: "ACTIVE",
    is_active: 1,
  })
  .run();

// Create phase
db.insert(phases)
  .values({
    id: "phase-1",
    sprint_id: "test-sprint",
    name: "Phase 1",
    order_index: 1,
  })
  .run();

// Create task
db.insert(tasks)
  .values({
    id: 1,
    sprint_id: "test-sprint",
    phase_id: "phase-1",
    title: "Test Task",
    status: "PENDING",
    // ...
  })
  .run();
```

### Mocking handlers

```typescript
import { vi } from "vitest";

vi.mock("../../src/core/check-executor.js", () => ({
  executeCheck: vi.fn(),
}));
```

## Troubleshooting

### "Cannot find module '../setup/db-cache.js'"

- Ensure you're importing with `.js` extension
- Run `npm run build` if needed

### Tests are slow (~95 seconds)

- You're using the old pattern with `initializeDb()`/`runMigrationsV2()`
- Switch to `setupTestDb()`/`cleanupTestDb()` pattern

### Database state leaking between tests

- Ensure `cleanupTestDb()` is called in `afterEach`
- Check that `tempDir` variable is scoped correctly
