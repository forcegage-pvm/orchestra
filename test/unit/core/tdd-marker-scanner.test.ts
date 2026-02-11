/**
 * Tests for TDD Red Marker Scanner
 *
 * Per DESIGN.md, the scanner uses TWO SEPARATE CONCERNS:
 * 1. Test runner filtering: @Tags(['tdd-red']) or [tdd-red] - NO task ID in tag
 * 2. Task linking: // @orchestra-task: N - file-level comment
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  scanForTddRedMarkers,
  scanTddFile,
} from "../../../src/core/tdd-marker-scanner.js";

describe("TDD Marker Scanner", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tdd-scanner-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Task ID extraction from // @orchestra-task: N", () => {
    it("should extract task ID from TypeScript file", async () => {
      const content = `// @orchestra-task: 3
describe('[tdd-red] Feature', () => {
  it('[tdd-red] should work', () => {
    expect(true).toBe(false);
  });
});
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const result = await scanTddFile(testFile);

      expect(result.taskId).toBe(3);
    });

    it("should extract task ID from Dart file", async () => {
      const content = `// @orchestra-task: 5
@Tags(['tdd-red'])
library;

void main() {
  test('should work', () {
    expect(1, equals(2));
  });
}
`;
      const testFile = path.join(tempDir, "test.dart");
      await fs.writeFile(testFile, content);

      const result = await scanTddFile(testFile);

      expect(result.taskId).toBe(5);
    });

    it("should return null if no task ID comment", async () => {
      const content = `
describe('[tdd-red] Feature', () => {
  it('[tdd-red] should work', () => {});
});
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const result = await scanTddFile(testFile);

      expect(result.taskId).toBeNull();
    });
  });

  describe("Dart patterns - @Tags(['tdd-red'])", () => {
    it("should detect @Tags(['tdd-red']) annotation after void main()", async () => {
      const content = `// @orchestra-task: 3

void main() {
  group('MyGroup', () {
    @Tags(['tdd-red'])
    test('should fail intentionally', () {
      expect(1, equals(2));
    });
  });
}
`;
      const testFile = path.join(tempDir, "test.dart");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].testIdentifier).toBe(
        "test.dart::MyGroup::should fail intentionally",
      );
      expect(markers[0].markerType).toBe("@Tags(['tdd-red'])");
    });

    it("should detect file-level @Tags(['tdd-red']) before void main()", async () => {
      const content = `// @orchestra-task: 5
@Tags(['tdd-red'])
library;

import 'package:test/test.dart';

void main() {
  group('XAxisConfig', () => {
    group('construction', () => {
      test('should have default values', () {
        expect(1, equals(2));
      });
      
      test('should accept custom values', () {
        expect(true, isFalse);
      });
    });
  });
}
`;
      const testFile = path.join(tempDir, "x_axis_config_test.dart");
      await fs.writeFile(testFile, content);

      const result = await scanTddFile(testFile);

      expect(result.hasFileLevelTag).toBe(true);
      expect(result.markers).toHaveLength(2);
      expect(result.markers[0].testIdentifier).toContain(
        "should have default values",
      );
      expect(result.markers[0].markerType).toBe(
        "file-level-@Tags(['tdd-red'])",
      );
    });

    it("should detect file-level @Tags before library; even with unparseable tests (TDD red phase)", async () => {
      // This is the bug scenario from Sprint 007 Task 13 escalation:
      // - @Tags(['tdd-red']) before library; declaration
      // - Tests have intentional compile errors (xAxisConfig doesn't exist)
      // - Scanner should still add at least one marker
      const content = `// @orchestra-task: 13
// Copyright 2025 Acme Corp
// SPDX-License-Identifier: MIT

/// TDD RED phase tests for XAxisConfig
///
/// These tests define the expected behavior of XAxisConfig.
/// Tests should FAIL initially because xAxisConfig doesn't exist yet.

@Tags(['tdd-red'])
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:myapp/models/axis_config.dart';

void main() {
  group('XAxisConfig', () {
    test('should have sensible defaults', () {
      final config = xAxisConfig(); // This doesn't exist yet - intentional error
      expect(config.min, equals(0));
    });
  });
}
`;
      const testFile = path.join(tempDir, "x_axis_config_test.dart");
      await fs.writeFile(testFile, content);

      const result = await scanTddFile(testFile);

      // Even though the test can't be properly parsed (xAxisConfig is undefined),
      // the file-level tag should still be detected
      expect(result.hasFileLevelTag).toBe(true);
      expect(result.taskId).toBe(13);
      expect(result.markers.length).toBeGreaterThanOrEqual(1);
      // At minimum, there should be a file-level marker
      expect(
        result.markers.some((m) => m.markerType.includes("file-level")),
      ).toBe(true);
    });

    it("should detect file-level @Tags even without void main()", async () => {
      // Edge case: incomplete file with @Tags but no void main() yet
      const content = `// @orchestra-task: 15

@Tags(['tdd-red'])
library;

import 'package:flutter_test/flutter_test.dart';

// void main() will be added later
`;
      const testFile = path.join(tempDir, "incomplete_test.dart");
      await fs.writeFile(testFile, content);

      const result = await scanTddFile(testFile);

      expect(result.hasFileLevelTag).toBe(true);
      expect(result.taskId).toBe(15);
      // Should still have at least one marker for the file-level tag
      expect(result.markers.length).toBeGreaterThanOrEqual(1);
    });

    it("should detect inline tags: ['tdd-red'] parameter", async () => {
      const content = `// @orchestra-task: 7

void main() {
  test('red phase test', () {
    expect(false, isTrue);
  }, tags: ['tdd-red']);
}
`;
      const testFile = path.join(tempDir, "inline_tags_test.dart");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].testIdentifier).toBe(
        "inline_tags_test.dart::::red phase test",
      );
      expect(markers[0].markerType).toBe("tags:['tdd-red']");
    });

    it("should detect @Tags with double quotes", async () => {
      const content = `// @orchestra-task: 10

void main() {
  @Tags(["tdd-red"])
  test('double quote test', () {
    fail('not implemented');
  });
}
`;
      const testFile = path.join(tempDir, "double_quote_test.dart");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].markerType).toBe("@Tags(['tdd-red'])");
    });
  });

  describe("TypeScript patterns - tdd-red in test name", () => {
    it("should detect tdd-red marker in test name", async () => {
      const content = `// @orchestra-task: 3

describe('Feature', () => {
  it('[tdd-red] should work eventually', () => {
    expect(true).toBe(false);
  });
});
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].testIdentifier).toBe(
        "test.test.ts::Feature::[tdd-red] should work eventually",
      );
      expect(markers[0].markerType).toBe("[tdd-red]");
    });

    it("should detect tdd-red marker in describe name", async () => {
      const content = `// @orchestra-task: 5

describe('[tdd-red] Feature group', () => {
  it('test one', () => {
    expect(1).toBe(2);
  });
});
`;
      const testFile = path.join(tempDir, "suite.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].markerType).toBe("[tdd-red]");
      expect(markers[0].testIdentifier).toContain("Feature group");
    });

    it("should detect it.skip with tdd-red marker", async () => {
      const content = `// @orchestra-task: 4

describe('Feature', () => {
  it.skip('[tdd-red] pending feature', () => {
    expect(true).toBe(false);
  });
});
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].markerType).toBe("[tdd-red]");
    });

    it("should NOT detect it.skip without tdd-red marker", async () => {
      const content = `
describe('Feature', () => {
  it.skip('should work eventually', () => {
    expect(true).toBe(false);
  });
});
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(0);
    });
  });

  describe("Multiple markers", () => {
    it("should detect multiple markers in one file", async () => {
      const content = `// @orchestra-task: 3

describe('Suite', () => {
  it('[tdd-red] test one', () => {});
  it('[tdd-red] test two', () => {});
  it('[tdd-red] test three', () => {});
});
`;
      const testFile = path.join(tempDir, "multi.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(3);
      expect(markers.every((m) => m.markerType === "[tdd-red]")).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("should handle nested describe blocks", async () => {
      const content = `// @orchestra-task: 3

describe('Outer', () => {
  describe('Inner', () => {
    it('[tdd-red] nested test', () => {});
  });
});
`;
      const testFile = path.join(tempDir, "nested.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].testIdentifier).toContain("Outer::Inner");
    });

    it("should handle different quote styles in TypeScript", async () => {
      const content = `// @orchestra-task: 3

describe("Feature", () => {
  it("[tdd-red] double quotes", () => {});
  it(\`[tdd-red] template literal\`, () => {});
});
`;
      const testFile = path.join(tempDir, "quotes.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(2);
    });

    it("should return empty array for file with no markers", async () => {
      const content = `
describe('Feature', () => {
  it('normal test', () => {
    expect(true).toBe(true);
  });
});
`;
      const testFile = path.join(tempDir, "no_markers.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(0);
    });

    it("should return empty array for empty file", async () => {
      const testFile = path.join(tempDir, "empty.test.ts");
      await fs.writeFile(testFile, "");

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(0);
    });
  });

  describe("Backward compatibility - reject old format", () => {
    it("should detect tdd-red (the CORRECT format per DESIGN.md)", async () => {
      const content = `// @orchestra-task: 3

describe('Feature', () => {
  it('[tdd-red] correct format test', () => {
    expect(true).toBe(false);
  });
});
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      // SHOULD detect - this is the correct format
      expect(markers).toHaveLength(1);
      expect(markers[0].markerType).toBe("[tdd-red]");
    });
  });
});
