# Test Tier Migration Guide

This guide provides step-by-step instructions for restructuring existing flat or non-tiered test suites into the tiered directory structure required by Orchestra's intelligent test runner tools.

## Overview

Orchestra's testing tools require tests to be organized into **tiers** declared in a `.agent-test-config.json` configuration file at your workspace root. This tiered approach enables:

- **Scoped test execution**: Run only the tests relevant to your current work
- **TDD red-phase isolation**: Mark failing tests during test-driven development
- **Intelligent caching**: Skip tests that haven't been affected by code changes
- **Transitive regression detection**: Identify tests affected by dependency changes

## Understanding the Five Test Tiers

Orchestra supports five standard test tiers, each serving a specific purpose in your testing strategy:

### 1. `red` — TDD Failing Tests

Tests in the TDD red phase that are expected to fail. These tests define new behavior before the implementation exists.

**Characteristics:**
- Run in isolation from other tiers
- Expected to fail (failure is success for this tier)
- Promote to other tiers once implementation passes
- Short-lived; should not remain in `red` indefinitely

### 2. `smoke` — Fast Sanity Checks

Quick tests that verify basic wiring, structure, and configuration without executing application logic. Smoke tests are your first line of defense — they catch broken builds, missing files, and misconfigured registrations before slower tests even start.

**Characteristics:**
- Execute in under 5 seconds total
- No mocks, no database, no runtime dependencies
- Validate structure and wiring, not behavior
- Run on every save and before commits
- High confidence signal with minimal time investment

**Common smoke test categories:**

| Category | What It Validates | Example |
|----------|-------------------|---------|
| **Manifest validation** | Config files have correct structure | `package.json` has required VS Code contribution points |
| **Registration/wiring checks** | Source code references match declarations | Commands registered in `extension.ts` match `package.json` |
| **Filesystem structure checks** | Required directories and files exist | Agent scaffolding directories have `.gitkeep` files |
| **Schema validation** | Schema definitions accept/reject correctly | MCP tool `inputSchema` fields are valid JSON Schema |
| **Convention enforcement** | Source files follow required patterns | All handler files include audit logging calls |
| **Static content validation** | Documentation/config has required sections | Agent markdown prompts contain required headings |

**How to identify smoke test candidates in an existing codebase:**

A test belongs in `smoke/` if it meets **all** of these criteria:
1. **No mocks** — doesn't call `vi.mock()`, `vi.fn()`, or equivalent
2. **No database** — doesn't import `setupTestDb`, `getDb`, or similar
3. **No runtime execution** — doesn't instantiate classes or call functions that perform work
4. **Pure validation** — reads files, parses configs, or checks existence; then asserts structure
5. **Sub-second** — individual test completes in < 1 second

> **Warning**: Smoke tests should NOT test logic or behavior. A test that mocks dependencies and asserts return values is a unit test, even if it's fast. A test that reads `package.json` and checks it has the right keys is a smoke test.

### 3. `unit` — Isolated Unit Tests

Tests for individual functions, classes, or modules in complete isolation.

**Characteristics:**
- Mock all external dependencies
- Fast execution (typically < 100ms per test)
- High coverage of edge cases
- No file system, network, or database access

### 4. `integration` — Cross-Module Tests

Tests that verify multiple modules working together correctly.

**Characteristics:**
- May use real file system or databases
- Test module interfaces and contracts
- Slower than unit tests but faster than e2e
- Focus on internal integration points

### 5. `e2e` — End-to-End Tests

Full system tests that verify complete user workflows.

**Characteristics:**
- Test the entire application stack
- May require external services
- Longest execution time
- Highest confidence for user-facing functionality

## Step-by-Step Migration Instructions

### Step 1: Audit Your Current Test Structure

Before migrating, understand what you have:

```bash
# Count tests by directory
find . -name "*.test.ts" -o -name "*.spec.ts" | wc -l

# List test file locations
find . -name "*.test.ts" -o -name "*.spec.ts"
```

Identify:
- Where tests currently live (flat, nested, scattered)
- What types of tests you have (unit, integration, e2e)
- Any existing organizational patterns

### Step 2: Create the Tiered Directory Structure

Create directories for each tier you plan to use:

```bash
# From your workspace root
mkdir -p test/unit
mkdir -p test/integration
mkdir -p test/e2e
mkdir -p test/smoke
```

For projects with separate packages (monorepos):

```bash
# Example: extension package
mkdir -p extension/test/unit
mkdir -p extension/test/integration
mkdir -p extension/test/e2e
```

### Step 3: Classify and Move Test Files

Move each test file to its appropriate tier. Use this decision tree to classify:

```
For each test file, ask in order:

1. Is it a TDD test expected to fail?                    → red
2. Does it validate structure/wiring WITHOUT mocks?       → smoke
   - Reads config/manifest files and checks keys?         → smoke
   - Reads source code as text and pattern-matches?       → smoke
   - Checks filesystem structure (dirs/files exist)?      → smoke
   - Validates schema definitions with sample data?       → smoke
   - Checks that source files follow a convention?        → smoke
3. Does it test multiple modules working together?        → integration
   - Uses real database or file system?                   → integration
   - Tests cross-module workflows?                        → integration
   - Has ".integration.test.ts" naming?                   → integration
4. Does it test a complete user workflow end-to-end?      → e2e
5. Everything else (mocked dependencies, fast, isolated)  → unit
```

> **Tip**: In VS Code extension projects, tests that read `package.json` to validate contribution points, or read `extension.ts` as a string to check import patterns, are smoke tests — not unit tests. They test wiring, not logic.

```bash
# Example moves
git mv test/utils.test.ts test/unit/utils.test.ts
git mv test/database.test.ts test/integration/database.test.ts
git mv test/user-flow.test.ts test/e2e/user-flow.test.ts
git mv test/package-json-views.test.ts test/smoke/package-json-views.test.ts
```

> **Prefer `git mv` over plain `mv`** to preserve file history in version control.

### Step 4: Create the Configuration File

Create `.agent-test-config.json` in your workspace root:

```json
{
  "framework": "vitest",
  "tiers": [
    {
      "name": "smoke",
      "path": "test/smoke/**/*.test.ts",
      "timeout": 10000
    },
    {
      "name": "unit",
      "path": "test/unit/**/*.test.ts",
      "timeout": 30000
    },
    {
      "name": "integration",
      "path": "test/integration/**/*.test.ts",
      "timeout": 60000
    },
    {
      "name": "e2e",
      "path": "test/e2e/**/*.test.ts",
      "timeout": 120000
    }
  ],
  "workingDir": ".",
  "defaultTimeout": 30000,
  "maxFailureLines": 20,
  "configFingerprint": [
    "vitest.config.*",
    "tsconfig.json",
    ".agent-test-config.json"
  ],
  "promotion": {
    "dryRun": true
  }
}
```

### Step 5: Update Import Paths

After moving files one level deeper (e.g., `test/foo.test.ts` → `test/unit/foo.test.ts`), every relative path in those files needs one more `../` added. This affects **three categories** of path references:

#### Category 1: Static Imports

```typescript
// Before (when test was in test/)
import { helper } from "../src/utils/helper.js";

// After (when test is in test/unit/)
import { helper } from "../../src/utils/helper.js";
```

#### Category 2: Dynamic Imports, Mocks, and Module References

These are easy to miss because they look like plain strings, not imports:

```typescript
// vi.mock() paths need the same fix
vi.mock("../../src/database/mutations.js", () => ({ ... }));
//       ^^^^^^ was ../.. now needs ../../..

// Dynamic imports too
const mod = await import("../../src/database/queries.js");

// vi.importActual
const actual = await vi.importActual<typeof import("../../src/foo.js")>("../../src/foo.js");
```

#### Category 3: Runtime File Access (`__dirname`, `readFileSync`, `readdirSync`)

**This is the most commonly missed category.** Tests that read source files, config files, or check directory structure use `path.join(__dirname, ...)` or `path.resolve(__dirname, ...)`. These are invisible to import-only fixers:

```typescript
// Before (test was in extension/test/commands/)
const extensionPath = path.join(__dirname, "..", "..", "src", "extension.ts");
//                                        ^^    ^^  resolved to extension/

// After (test is in extension/test/unit/commands/)
const extensionPath = path.join(__dirname, "..", "..", "..", "src", "extension.ts");
//                                        ^^    ^^    ^^  needs 3 levels now
```

Also watch for `path.resolve` with string concatenation:

```typescript
// Before
const root = path.resolve(__dirname, "../..");

// After
const root = path.resolve(__dirname, "../../..");
```

#### Automation Tips

A regex-based bulk fixer can handle Categories 1 and 2 by matching any string literal containing `../` chains that point at known directories:

```
Pattern: (['"])(\.\./(?:\.\./)*?)(src/|setup/|fixtures/)
Replace: $1../$2$3
```

Category 3 requires manual inspection of each file. Search for these patterns to find files that need manual fixes:

```bash
# Find tests using runtime path resolution
grep -rn "__dirname" test/unit/ extension/test/unit/
grep -rn "readFileSync\|readdirSync\|existsSync" test/unit/ extension/test/unit/
grep -rn "path\.resolve\|path\.join" test/unit/ extension/test/unit/ | grep "__dirname"
```

#### Alternative: Path Aliases

For new projects, consider `tsconfig.json` path aliases to avoid brittle relative imports entirely:

```json
{
  "compilerOptions": {
    "paths": {
      "@src/*": ["./src/*"],
      "@test/*": ["./test/*"]
    }
  }
}
```

```typescript
// Immune to directory moves
import { helper } from "@src/utils/helper.js";
```

> **Caveat**: Path aliases don't help with Category 3 (`__dirname`-based file access). Tests that read source files as text will always need manual path fixes when moved.

### Step 6: Verify the Migration

Run tests through the new tier structure:

```bash
# Using Orchestra tools
run_tests --tier=unit
run_tests --tier=integration
run_tests --tier=e2e

# Or using npm/vitest directly
npm test -- --run test/unit/
npm test -- --run test/integration/
```

Use `list_test_suites` to verify discovery:

```bash
list_test_suites --tier=unit --detail=summary
```

## Example Configuration

Here's a complete example based on the Orchestra project's own configuration:

```json
{
  "framework": "vitest",
  "tiers": [
    {
      "name": "smoke",
      "path": "test/smoke/**/*.test.ts",
      "timeout": 10000
    },
    {
      "name": "extension-smoke",
      "path": "extension/test/smoke/**/*.test.ts",
      "timeout": 10000
    },
    {
      "name": "unit",
      "path": "test/unit/**/*.test.ts",
      "timeout": 30000
    },
    {
      "name": "extension-unit",
      "path": "extension/test/unit/**/*.test.ts",
      "timeout": 30000
    },
    {
      "name": "integration",
      "path": "test/integration/**/*.test.ts",
      "timeout": 60000
    },
    {
      "name": "extension-integration",
      "path": "extension/test/integration/**/*.test.ts",
      "timeout": 60000
    }
  ],
  "workingDir": ".",
  "defaultTimeout": 30000,
  "maxFailureLines": 20,
  "configFingerprint": [
    "vitest.config.*",
    "tsconfig.json",
    ".agent-test-config.json"
  ],
  "promotion": {
    "dryRun": true
  }
}
```

### Per-Package Tier Naming Convention

When a project has multiple test roots (e.g., a root `test/` and an `extension/test/`), each root needs **its own set of tier entries** with a namespace prefix. Orchestra uses the convention `{package}-{tier}`:

| Tier Entry | Package | Tier | Glob Path |
|-----------|---------|------|-----------|
| `unit` | root | unit | `test/unit/**/*.test.ts` |
| `extension-unit` | extension | unit | `extension/test/unit/**/*.test.ts` |
| `smoke` | root | smoke | `test/smoke/**/*.test.ts` |
| `extension-smoke` | extension | smoke | `extension/test/smoke/**/*.test.ts` |

**Why separate entries?** Different packages may have different vitest configs, module aliases, or test infrastructure. Scoping tiers per-package lets you:
- Run `run_tests --tier=extension-unit` to test only the VS Code extension
- Run `run_tests --tier=unit` to test only the MCP server core
- Set different timeouts per package (extension integration tests may be slower)

For single-package projects, use plain tier names (`unit`, `integration`, `smoke`).

## Migrating Large Test Suites (3,000+ Tests)

Large codebases require a strategic, incremental approach to migration. Attempting to migrate thousands of tests at once will disrupt development workflows and introduce significant risk. This section provides concrete strategies for managing large-scale migrations.

### Incremental Batch Migration Approach

Rather than migrating all tests at once, break the migration into manageable batches of 100-200 tests per phase. This allows you to:

1. **Validate the tier structure** with a small subset before committing to the full migration
2. **Identify classification challenges** early (tests that don't fit cleanly into tiers)
3. **Keep the test suite running** throughout the migration period
4. **Train team members** gradually on the new structure

For each batch, follow the classify-move-verify cycle:
- **Classify**: Review each test and determine its appropriate tier
- **Move**: Relocate the test file to the new tier directory
- **Verify**: Run both the moved tests and any related tests to ensure nothing broke

### Starting with One Tier and Expanding Gradually

Start your migration with the **unit tier** because these tests are typically the most numerous, easiest to classify, and fastest to validate. Unit tests have clear boundaries (testing single modules with mocked dependencies) and low risk of disruption.

Begin by identifying 50-100 clear-cut unit tests—those that mock all dependencies and test single functions or classes. Move these first, validate the configuration works, then proceed to:

1. **Unit tests** (Weeks 1-3): Start here. Highest volume, lowest risk.
2. **Integration tests** (Weeks 4-5): More complex classification, requires understanding module boundaries.
3. **E2E tests** (Week 6): Usually the smallest count, highest complexity.
4. **Smoke tests** (Week 7): Extract from unit/integration tests or create new ones.
5. **Red tier cleanup** (Ongoing): Address any TDD tests as they arise.

This phased approach means your CI/CD pipeline continues working throughout the migration. Tests not yet migrated remain in their original locations and continue running normally.

### Strategies for Minimizing Workflow Disruption

Large migrations often fail because they interrupt daily development. Apply these strategies to maintain productivity:

**Run parallel test configurations**: Keep your existing test configuration active alongside the new tiered structure. Use a `legacy_tests` configuration that points to unmigrated tests. This allows `npm test` to continue working while you incrementally move tests to tiers.

**Migrate during low-activity periods**: Schedule migration batches at the end of sprints or during dedicated tech-debt sprints. Avoid migrating during active feature development on the same modules.

**Create a migration tracking document**: Maintain a spreadsheet or issue tracking the migration status of each test file. Include columns for: current location, target tier, migration status, and any blockers.

**Communicate changes**: Notify the team when migrating tests they frequently run. Update documentation and README files to reflect the new structure.

**Establish temporary aliases**: If teams have memorized test commands, create shell aliases or npm scripts that map old commands to new tier-based commands during the transition.

### Example Timeline for 3,000+ Test Suite

Here's a realistic timeline for migrating a 3,500-test codebase with a team of 4-5 developers:

| Week | Focus | Tests Migrated | Cumulative |
|------|-------|----------------|------------|
| 1 | Setup tier structure, migrate first 100 unit tests | 100 | 100 |
| 2 | Continue unit tests (batch 2) | 300 | 400 |
| 3 | Complete unit test migration | 500 | 900 |
| 4 | Begin integration tests | 200 | 1,100 |
| 5 | Complete integration tests | 300 | 1,400 |
| 6 | E2E tests (usually smallest count) | 100 | 1,500 |
| 7 | Extract/create smoke tests, red tier setup | 50 | 1,550 |
| 8 | Remaining tests, edge cases, cleanup | 450 | 2,000 |
| 9-10 | Final verification, documentation, legacy cleanup | 1,500 | 3,500 |

Allow buffer time (weeks 9-10) for edge cases like tests that don't fit cleanly into tiers, tests with complex shared fixtures, or tests that fail after migration due to path-dependent behavior.

**Key success metrics:**
- All tests continue passing throughout migration
- No more than 10% of CI builds red due to migration activities
- Team can run tiered tests within 2 weeks of starting
- Full migration complete within one quarter

## Using Orchestra Testing Tools After Migration

Once your tests are organized into tiers, you can leverage the full power of Orchestra's testing tools:

### `run_tests` — Scoped Test Execution

Run tests by tier, file pattern, or specific test names:

```bash
# Run all unit tests
run_tests --tier=unit

# Run tests matching a pattern
run_tests --tier=unit --pattern="**/utils/*.test.ts"

# Run only failed tests from last run
run_tests --tier=unit --only=failed

# Force bypass cache
run_tests --tier=unit --force
```

### `list_test_suites` — Test Discovery

Discover what tests exist and their status:

```bash
# List all tiers with counts
list_test_suites

# Get detailed info for a tier
list_test_suites --tier=unit --detail=full

# List only failed tests
list_test_suites --tier=unit --status=failed
```

### `get_test_results` — Result Retrieval

Retrieve detailed test results and failure information:

```bash
# Get results for a specific tier
get_test_results --tier=unit

# Get results for a specific test file
get_test_results --file="test/unit/utils.test.ts"

# Get recent failure details
get_test_results --tier=unit --only=failed
```

### `promote_tests` — TDD Test Promotion

Move tests from the red tier to their target tier after implementation:

```bash
# Promote passing tests from red to unit
promote_tests --from=red --to=unit --pattern="**/new-feature.test.ts"

# Dry run to preview what would be promoted
promote_tests --from=red --to=unit --dry-run
```

## Configuration-Driven Tier Validation

Orchestra validates that only declared tiers are available. If you attempt to run tests for an undeclared tier, you'll receive an error:

```
Error: Tier "acceptance" is not configured.
Available tiers: smoke, unit, integration, e2e

To add this tier, update .agent-test-config.json:
{
  "tiers": [
    ...existing tiers...,
    {
      "name": "acceptance",
      "path": "test/acceptance/**/*.test.ts",
      "timeout": 120000
    }
  ]
}
```

This explicit configuration prevents typos and ensures all team members use consistent tier names.

## Troubleshooting Common Issues

### Tests Not Discovered

If `list_test_suites` doesn't find your tests:

1. Verify the `path` glob pattern matches your file locations
2. Check that file extensions match (`.test.ts` vs `.spec.ts`)
3. Ensure the `workingDir` is correct for your project structure
4. Verify your `vitest.config.ts` `include` patterns also cover the new tier directories

### Import Path Errors After Moving

The most common post-migration error is `Failed to load url ... Does the file exist?`. This means a relative import wasn't updated after the file moved deeper.

**Diagnosis**: The error message shows the resolved path — count the `../` segments to determine if one is missing.

**Quick fix**: Add one more `../` to the failing import. If many files are affected, use the regex bulk-fix approach from Step 5.

**Prevention**: After moving files, run `grep -rn "from \"\.\." test/unit/` to audit all relative imports before running tests.

### Stale Test Results / Cache Issues

Test runners may cache file resolutions. If you've fixed imports but tests still fail with old error messages:

```bash
# Clear vitest cache
rm -rf node_modules/.vitest

# Run without cache
npx vitest run --no-cache
```

### Runtime Path Resolution Failures (ENOENT)

Tests that use `path.join(__dirname, "..", "src", ...)` or `readFileSync()` with relative paths will fail with `ENOENT: no such file or directory` after moving. These are **not** import errors — they're runtime filesystem access.

Search for affected files:
```bash
grep -rn "readFileSync\|readdirSync\|existsSync" test/unit/ | grep -v node_modules
grep -rn "__dirname" test/unit/ | grep "path\.\(join\|resolve\)"
```

Fix each occurrence by adding the appropriate number of `..` segments.

### Timeout Issues

If tests timeout, increase the tier's timeout value:

```json
{
  "name": "e2e",
  "path": "test/e2e/**/*.test.ts",
  "timeout": 300000
}
```

### Configuration Not Recognized

Ensure `.agent-test-config.json` is at workspace root and has valid JSON syntax:

```bash
# Validate JSON syntax
cat .agent-test-config.json | jq .
```

### Encoding Issues with Automated Fix Scripts

PowerShell's `Set-Content` writes UTF-16 by default when piping strings. This can cause vitest to misread files. Always specify encoding:

```powershell
# ❌ WRONG — may write UTF-16 BOM
$content | Set-Content $file -NoNewline

# ✅ CORRECT — preserves UTF-8
[System.IO.File]::WriteAllText($file, $content)
# or
$content | Set-Content $file -NoNewline -Encoding utf8
```

## Case Study: Orchestra's Own Migration

Orchestra migrated its own test suite using this guide. This section documents what happened, what worked, and what caught us off guard.

### Scope

- **241 test files** total: 93 in `test/` (MCP server/core), 148 in `extension/test/` (VS Code extension)
- **1,326 test suites**, **3,609 individual tests**
- Two vitest configs: root `vitest.config.ts` and `extension/vitest.config.ts`

### Approach

1. **Direct classification** — We knew our test base well enough to classify tests in bulk rather than using `_unmigrated/` parking directories. All root tests went to `test/unit/` (no root integration tests existed). Extension tests were split: 5 files with `.integration.test.ts` naming went to `extension/test/integration/`, everything else to `extension/test/unit/`.

2. **`git mv` for all moves** — Preserves file history. No files were copied-and-deleted.

3. **Bulk import fix script** — A PowerShell script using regex to add one `../` to all relative path string literals targeting known directories (`src/`, `setup/`, `fixtures/`). The regex matched any string literal context (imports, `vi.mock()`, `path.join()`, `readFileSync()`):
   ```
   Pattern: (['"])(\.\./(?:\.\./)*?)(src/|setup/|fixtures/|extension/)
   Replace: $1../$2$3
   ```

4. **Manual fix pass** — After the bulk script, 14 files still failed due to `path.join(__dirname, "..", ...)` and `path.resolve(__dirname, "../../..")` patterns where the `..` segments were separate string arguments (not part of a `../` chain in a single string). These required manual inspection.

### Gotchas and Lessons Learned

**1. `__dirname`-relative paths are the silent killer.**
The bulk regex fixer caught `"../../src/foo.js"` in all contexts. But `path.join(__dirname, "..", "..", "src", "extension.ts")` has each `..` as a _separate string argument_ — invisible to any single-string regex. These only surface as `ENOENT` errors at runtime.

_Mitigation_: After running a bulk fixer, search for `__dirname` in all moved files and verify every `path.join`/`path.resolve` chain manually.

**2. PowerShell `Set-Content` encoding traps.**
PowerShell's `Set-Content` can silently change file encoding to UTF-16, causing vitest to misread files even though they look correct in an editor. Use `[System.IO.File]::WriteAllText()` or explicitly pass `-Encoding utf8`.

**3. Vitest caching hides fixes.**
After fixing import paths, vitest sometimes serves stale cached results from before the fix. Run with `--no-cache` and delete `node_modules/.vitest/` when debugging post-migration failures.

**4. Double-fixing is easy.**
If a bulk import fixer already processed a file, and you then manually add another `../`, the path goes too deep. Keep careful track of which files were/weren't processed by automated tools. Use `git diff` to review changes before running tests.

**5. Multi-line `path.join()` is harder to regex.**
When `path.join(__dirname, "..", "src", ...)` is spread across multiple lines with each argument on its own line, even sophisticated regexes fail. These always require manual or AST-based fixes.

**6. Integration test identification.**
We used the `.integration.test.ts` naming convention to identify integration tests. If your project doesn't have a naming convention, look for: tests that import database setup helpers, tests that create real temp directories, and tests with `beforeAll`/`afterAll` that start/stop services.

### Per-Package Tier Decision

We chose separate namespace tiers (`unit` / `extension-unit`, `integration` / `extension-integration`) rather than a single flat namespace because:
- The root package and extension package have different vitest configs with different module aliases
- Running `--tier=extension-unit` scopes to just the VS Code extension, useful during extension development
- Timeouts can differ between packages

### Smoke Test Candidates (Pending Extraction)

During migration, we identified 13 test files currently in `unit/` that fit the smoke tier definition. These are pending extraction to `test/smoke/` and `extension/test/smoke/`:

**Extension package:**

| File | What It Validates | Smoke Category |
|------|-------------------|----------------|
| `extension/test/unit/package-json-configuration.test.ts` | VS Code settings in `package.json` | Manifest validation |
| `extension/test/unit/package-json-views.test.ts` | Views, menus, keybindings in `package.json` | Manifest validation |
| `extension/test/unit/extension-registration.test.ts` | Command registration (package.json ↔ extension.ts) | Wiring check |
| `extension/test/unit/extension-config-service.test.ts` | ConfigService import/instantiation in source | Wiring check |
| `extension/test/unit/commands/AgentCommandHandler.test.ts` | Agent command registration | Wiring check |
| `extension/test/unit/agents/directory-structure.test.ts` | Agent directory scaffold exists | Filesystem structure |
| `extension/test/unit/prompts/ensurePromptTemplates.test.ts` _(sync-from-bundle tests only)_ | Real extension bundle has templates | Filesystem structure |

**Root package:**

| File | What It Validates | Smoke Category |
|------|-------------------|----------------|
| `test/unit/mcp-server/role-filtering.test.ts` | Tool-to-role assignment and access control | Registration check |
| `test/unit/mcp-server/tool-schema-validation.test.ts` | MCP tool `inputSchema` definitions | Schema validation |
| `test/unit/mcp-server/audit-logging-coverage.test.ts` | All handlers have audit logging | Convention enforcement |
| `test/unit/interface-validations-config.test.ts` | `.orchestra/interface-validations.yaml` structure | Config validation |
| `test/unit/agents/orchestrator-agent-interface-validation.test.ts` | Orchestrator agent.md required sections | Content validation |
| `test/unit/agents/controller-agent-interface-validation.test.ts` | Controller agent.md required sections | Content validation |

> These files will be moved to `test/smoke/` and `extension/test/smoke/` in a future pass. The `.agent-test-config.json` already has `smoke` and `extension-smoke` tier entries defined with the target paths.

## Summary

Migrating to a tiered test structure enables Orchestra's intelligent test runner to optimize your testing workflow. Follow this guide to:

1. **Audit** your current test structure
2. **Create** tiered directories (including `smoke/` from the start)
3. **Classify and move** tests to appropriate tiers — use the decision tree, not just speed
4. **Fix paths** across all three categories: static imports, mock/dynamic imports, and runtime `__dirname` paths
5. **Configure** `.agent-test-config.json` with per-package tier entries
6. **Verify** with `--no-cache` to avoid stale results
7. **Use** Orchestra tools for scoped, cached, intelligent test execution

**Key takeaway**: Don't skip the smoke tier. Tests that validate wiring, structure, and configuration are your fastest feedback loop. Extract them early and run them on every change.

For large codebases (3,000+ tests), take an incremental approach: start with unit tests, migrate in batches, and maintain parallel configurations during transition. See the Orchestra case study above for real-world lessons learned.
