/**
 * Validate Handover Core Tests
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractFileOperations,
  runValidateHandover,
} from "../../src/core/validate-handover.js";

// Mock config to control orchestra root
vi.mock("../../src/core/config.js", () => ({
  requireOrchestraRoot: vi.fn(),
}));

import { requireOrchestraRoot } from "../../src/core/config.js";

describe("validate-handover core", () => {
  let tempDir: string;
  let orchestraRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-test-"));
    orchestraRoot = path.join(tempDir, ".orchestra");
    fs.mkdirSync(path.join(orchestraRoot, "handover"), { recursive: true });

    // Mock requireOrchestraRoot to return our temp dir
    vi.mocked(requireOrchestraRoot).mockReturnValue(orchestraRoot);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function createHandover(content: string): void {
    fs.writeFileSync(
      path.join(orchestraRoot, "handover", "current-task.md"),
      content
    );
  }

  // =========================================================================
  // Extract File Operations Tests
  // =========================================================================

  describe("extractFileOperations", () => {
    it("should extract CREATE paths from table format", () => {
      const content = `
## File Operations

| Operation | Path | Description |
|-----------|------|-------------|
| CREATE | \`src/new-file.ts\` | New file |
| CREATE | src/another.ts | Another file |
| UPDATE | src/existing.ts | Existing file |
`;
      const createFiles = extractFileOperations(content, "CREATE");
      expect(createFiles).toContain("src/new-file.ts");
      expect(createFiles).toContain("src/another.ts");
      expect(createFiles).not.toContain("src/existing.ts");
    });

    it("should extract UPDATE paths from table format", () => {
      const content = `
| Operation | Path |
|-----------|------|
| CREATE | src/new.ts |
| UPDATE | \`src/update1.ts\` |
| UPDATE | src/update2.ts |
`;
      const updateFiles = extractFileOperations(content, "UPDATE");
      expect(updateFiles).toContain("src/update1.ts");
      expect(updateFiles).toContain("src/update2.ts");
      expect(updateFiles).toHaveLength(2);
    });

    it("should extract CREATE paths from list format", () => {
      const content = `
## Files
- CREATE: \`src/list-file.ts\`
- CREATE: src/another-list.ts
- UPDATE: src/existing.ts
`;
      const createFiles = extractFileOperations(content, "CREATE");
      expect(createFiles).toContain("src/list-file.ts");
      expect(createFiles).toContain("src/another-list.ts");
    });

    it("should handle mixed formats", () => {
      const content = `
| Operation | Path |
|-----------|------|
| CREATE | src/table.ts |

Also:
- CREATE: src/list.ts
`;
      const createFiles = extractFileOperations(content, "CREATE");
      expect(createFiles).toContain("src/table.ts");
      expect(createFiles).toContain("src/list.ts");
    });

    it("should deduplicate paths", () => {
      const content = `
| CREATE | src/same.ts |
- CREATE: src/same.ts
`;
      const createFiles = extractFileOperations(content, "CREATE");
      expect(createFiles).toHaveLength(1);
    });
  });

  // =========================================================================
  // Task Structure Checks (V1-V4)
  // =========================================================================

  describe("task structure checks", () => {
    it("V1: should detect task title", async () => {
      createHandover(`# Task 1: Implement Feature

## Objective
Do something

## Deliverables
- CREATE: src/file.ts

## TDD
Write tests first
`);

      const result = await runValidateHandover();
      const v1 = result.checks.find((c) => c.id === "V1");
      expect(v1?.passed).toBe(true);
    });

    it("V1: should fail when task title missing", async () => {
      createHandover(`## Implement Feature

Some content without proper title
`);

      const result = await runValidateHandover();
      const v1 = result.checks.find((c) => c.id === "V1");
      expect(v1?.passed).toBe(false);
      expect(v1?.severity).toBe("BLOCKING");
    });

    it("V2: should detect objective section", async () => {
      createHandover(`# Task 1: Test

## Objective
The goal is to implement X

## Deliverables
- CREATE: src/file.ts

## TDD
Tests
`);

      const result = await runValidateHandover();
      const v2 = result.checks.find((c) => c.id === "V2");
      expect(v2?.passed).toBe(true);
    });

    it("V3: should detect deliverables from table", async () => {
      createHandover(`# Task 1: Test

## Objective
Goal

| Operation | Path |
|-----------|------|
| CREATE | src/file.ts |

## TDD
Tests
`);

      const result = await runValidateHandover();
      const v3 = result.checks.find((c) => c.id === "V3");
      expect(v3?.passed).toBe(true);
    });

    it("V4: should detect TDD section", async () => {
      createHandover(`# Task 1: Test

## Objective
Goal

## Deliverables
- CREATE: src/file.ts

## TDD Requirements
Write tests first for X
`);

      const result = await runValidateHandover();
      const v4 = result.checks.find((c) => c.id === "V4");
      expect(v4?.passed).toBe(true);
    });
  });

  // =========================================================================
  // File Path Checks (V5-V8)
  // =========================================================================

  describe("file path checks", () => {
    it("V5: should pass when CREATE paths specified", async () => {
      createHandover(`# Task 1: Test

## Objective
Goal

| Operation | Path |
|-----------|------|
| CREATE | src/new-file.ts |

## TDD
Tests
`);

      const result = await runValidateHandover();
      const v5 = result.checks.find((c) => c.id === "V5");
      expect(v5?.passed).toBe(true);
    });

    it("V6: should pass when CREATE file does not exist", async () => {
      createHandover(`# Task 1: Test

## Objective
Goal

| Operation | Path |
|-----------|------|
| CREATE | src/nonexistent.ts |

## TDD
Tests
`);

      const result = await runValidateHandover();
      const v6Checks = result.checks.filter((c) => c.id === "V6");
      expect(v6Checks.length).toBeGreaterThan(0);
      expect(v6Checks[0].passed).toBe(true);
    });

    it("V6: should fail when CREATE file already exists", async () => {
      // Create the file that shouldn't exist
      const filePath = path.join(tempDir, "src", "existing.ts");
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "existing content");

      createHandover(`# Task 1: Test

## Objective
Goal

| Operation | Path |
|-----------|------|
| CREATE | src/existing.ts |

## TDD
Tests
`);

      const result = await runValidateHandover();
      const v6Checks = result.checks.filter((c) => c.id === "V6");
      expect(v6Checks.some((c) => !c.passed)).toBe(true);
    });

    it("V8: should pass when UPDATE file exists", async () => {
      // Create the file that should exist
      const filePath = path.join(tempDir, "src", "update-target.ts");
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "existing content");

      createHandover(`# Task 1: Test

## Objective
Goal

| Operation | Path |
|-----------|------|
| UPDATE | src/update-target.ts |

## TDD
Tests
`);

      const result = await runValidateHandover();
      const v8Checks = result.checks.filter((c) => c.id === "V8");
      expect(v8Checks.length).toBeGreaterThan(0);
      expect(v8Checks[0].passed).toBe(true);
    });

    it("V8: should fail when UPDATE file does not exist", async () => {
      createHandover(`# Task 1: Test

## Objective
Goal

| Operation | Path |
|-----------|------|
| UPDATE | src/nonexistent-update.ts |

## TDD
Tests
`);

      const result = await runValidateHandover();
      const v8Checks = result.checks.filter((c) => c.id === "V8");
      expect(v8Checks.some((c) => !c.passed)).toBe(true);
    });
  });

  // =========================================================================
  // Completeness Checks (V9-V11)
  // =========================================================================

  describe("completeness checks", () => {
    it("V9: should pass when no TODO markers", async () => {
      createHandover(`# Task 1: Test

## Objective
Complete implementation of X

## Deliverables
- CREATE: src/file.ts

## TDD
Write tests
`);

      const result = await runValidateHandover();
      const v9 = result.checks.find((c) => c.id === "V9");
      expect(v9?.passed).toBe(true);
    });

    it("V9: should fail when TODO markers present", async () => {
      createHandover(`# Task 1: Test

## Objective
[TODO] Complete this section

## Deliverables
- CREATE: src/file.ts

## TDD
Tests
`);

      const result = await runValidateHandover();
      const v9 = result.checks.find((c) => c.id === "V9");
      expect(v9?.passed).toBe(false);
    });

    it("V9: should detect TBD markers", async () => {
      createHandover(`# Task 1: Test

## Objective
Goal [TBD]

## Deliverables
- CREATE: src/file.ts

## TDD
Tests
`);

      const result = await runValidateHandover();
      const v9 = result.checks.find((c) => c.id === "V9");
      expect(v9?.passed).toBe(false);
    });

    it("V10: should detect code scaffold", async () => {
      createHandover(`# Task 1: Test

## Objective
Goal

| Operation | Path |
|-----------|------|
| CREATE | src/file.ts |

## Code Scaffold

\`\`\`typescript
export function newFunction(): void {
  // Implementation
}
\`\`\`

## TDD
Tests
`);

      const result = await runValidateHandover();
      const v10 = result.checks.find((c) => c.id === "V10");
      expect(v10?.passed).toBe(true);
    });

    it("V10: should warn when no code scaffold for CREATE files", async () => {
      createHandover(`# Task 1: Test

## Objective
Goal

| Operation | Path |
|-----------|------|
| CREATE | src/file.ts |

No code blocks here

## TDD
Tests
`);

      const result = await runValidateHandover();
      const v10 = result.checks.find((c) => c.id === "V10");
      expect(v10?.passed).toBe(false);
      expect(v10?.severity).toBe("WARNING");
    });
  });

  // =========================================================================
  // Integration Checks (V12-V13)
  // =========================================================================

  describe("integration checks", () => {
    it("V12: should check MUST USE for integration tasks", async () => {
      createHandover(`# Task 1: INTEGRATION Task

## Objective
Goal

## MUST USE
- import { existingFunction } from './utils'

## Deliverables
- CREATE: src/file.ts

## TDD
Tests
`);

      const result = await runValidateHandover();
      expect(result.isIntegrationTask).toBe(true);
      const v12 = result.checks.find((c) => c.id === "V12");
      expect(v12?.passed).toBe(true);
    });

    it("V12: should warn when MUST USE missing for integration", async () => {
      createHandover(`# Task 1: INTEGRATION Feature

## Objective
Goal

## Deliverables
- CREATE: src/file.ts

## TDD
Tests
`);

      const result = await runValidateHandover();
      expect(result.isIntegrationTask).toBe(true);
      const v12 = result.checks.find((c) => c.id === "V12");
      expect(v12?.passed).toBe(false);
      expect(v12?.severity).toBe("WARNING");
    });

    it("V13: should check demo for visual tasks", async () => {
      createHandover(`# Task 1: Visual Component

## Objective
Create visual demo component

## Deliverables
- CREATE: lib/demo/visual_demo.dart

## TDD
Tests
`);

      const result = await runValidateHandover();
      expect(result.isVisualTask).toBe(true);
      const v13 = result.checks.find((c) => c.id === "V13");
      expect(v13?.passed).toBe(true);
    });
  });

  // =========================================================================
  // Summary and Status
  // =========================================================================

  describe("summary and status", () => {
    it("should return PASSED when all checks pass", async () => {
      createHandover(`# Task 1: Test Task

## Objective
Implement a feature

## Deliverables
| Operation | Path |
|-----------|------|
| CREATE | src/new-feature.ts |

## Code Scaffold

\`\`\`typescript
export function feature(): void {}
\`\`\`

## TDD
Write tests first with sample test data and fixtures
`);

      const result = await runValidateHandover();
      // Filter to just blocking failures
      const blockingFailures = result.checks.filter(
        (c) => !c.passed && c.severity === "BLOCKING"
      );
      expect(blockingFailures).toHaveLength(0);
      expect(result.summary.failed).toBe(0);
      // Status should be PASSED or at worst WARNINGS (no blocking failures)
      expect(["PASSED", "WARNINGS"]).toContain(result.status);
    });

    it("should return FAILED when blocking checks fail", async () => {
      createHandover(`Some random content without proper structure`);

      const result = await runValidateHandover();
      expect(result.status).toBe("FAILED");
      expect(result.summary.failed).toBeGreaterThan(0);
    });

    it("should extract task ID", async () => {
      createHandover(`# Task 42: Test

## Objective
Goal

## Deliverables
- CREATE: src/file.ts

## TDD
Tests
`);

      const result = await runValidateHandover();
      expect(result.taskId).toBe(42);
    });

    it("should extract task title", async () => {
      createHandover(`# Task 1: Implement Amazing Feature

## Objective
Goal

## Deliverables
- CREATE: src/file.ts

## TDD
Tests
`);

      const result = await runValidateHandover();
      expect(result.taskTitle).toBe("Implement Amazing Feature");
    });
  });

  // =========================================================================
  // Error Handling
  // =========================================================================

  describe("error handling", () => {
    it("should throw when handover not found", async () => {
      // Remove the handover file
      fs.rmSync(path.join(orchestraRoot, "handover", "current-task.md"), {
        force: true,
      });

      await expect(runValidateHandover()).rejects.toThrow("Handover not found");
    });
  });
});
