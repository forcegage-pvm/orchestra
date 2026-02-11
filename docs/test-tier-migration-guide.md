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

Quick tests that verify basic functionality is working. These are your first line of defense.

**Characteristics:**
- Execute in under 5 seconds total
- Test critical paths and happy paths
- Run frequently (on every save, before commits)
- High confidence signal with minimal time investment

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

Move each test file to its appropriate tier. Use these questions to classify:

| Question | If Yes → Tier |
|----------|---------------|
| Does it mock all dependencies and test one unit? | `unit` |
| Does it test multiple modules working together? | `integration` |
| Does it test a complete user workflow? | `e2e` |
| Is it a quick sanity check (< 1 second)? | `smoke` |
| Is it a TDD test that should fail? | `red` |

```bash
# Example moves
mv test/utils.test.ts test/unit/utils.test.ts
mv test/database.test.ts test/integration/database.test.ts
mv test/user-flow.test.ts test/e2e/user-flow.test.ts
```

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

After moving files, update relative imports:

```typescript
// Before (when test was in test/)
import { helper } from "../src/utils/helper.js";

// After (when test is in test/unit/)
import { helper } from "../../src/utils/helper.js";
```

Use your IDE's refactoring tools or a codemod to automate this.

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
      "name": "unit",
      "path": "test/**/*.test.ts",
      "timeout": 30000
    },
    {
      "name": "extension-unit",
      "path": "extension/test/**/*.test.ts",
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

Note how different packages (root and extension) can have their own tier entries with distinct paths.

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

### Import Path Errors After Moving

Use path aliases in `tsconfig.json` to avoid brittle relative imports:

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

Then update imports:

```typescript
// Instead of fragile relative paths
import { helper } from "../../../src/utils/helper.js";

// Use path aliases
import { helper } from "@src/utils/helper.js";
```

### Timeout Issues

If tests timeout, increase the tier's timeout value:

```json
{
  "name": "e2e",
  "path": "test/e2e/**/*.test.ts",
  "timeout": 300000  // 5 minutes for long e2e tests
}
```

### Configuration Not Recognized

Ensure `.agent-test-config.json` is at workspace root and has valid JSON syntax:

```bash
# Validate JSON syntax
cat .agent-test-config.json | jq .
```

## Summary

Migrating to a tiered test structure enables Orchestra's intelligent test runner to optimize your testing workflow. Follow this guide to:

1. **Audit** your current test structure
2. **Create** tiered directories
3. **Classify and move** tests to appropriate tiers
4. **Configure** `.agent-test-config.json`
5. **Verify** the migration works
6. **Use** Orchestra tools for scoped, cached, intelligent test execution

For large codebases (3,000+ tests), take an incremental approach: start with unit tests, migrate in batches, and maintain parallel configurations during transition.
