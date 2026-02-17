/**
 * Tests for TDD Red Marker Scanner
 *
 * Path-based detection: a file is a red-phase test if its path contains `test/red/`.
 * The only content-reading is for `// @orchestra-task: N` task linking.
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  extractOrchestraTaskId,
  isRedPhaseTestPath,
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

  describe("isRedPhaseTestPath", () => {
    it("should detect files under test/red/", () => {
      expect(isRedPhaseTestPath("test/red/feature.test.ts")).toBe(true);
      expect(isRedPhaseTestPath("/abs/path/test/red/feature.test.ts")).toBe(true);
      expect(isRedPhaseTestPath("test/red/nested/deep/feature.test.ts")).toBe(true);
    });

    it("should handle Windows-style backslash paths", () => {
      expect(isRedPhaseTestPath("test\\red\\feature.test.ts")).toBe(true);
      expect(isRedPhaseTestPath("C:\\project\\test\\red\\feature.test.ts")).toBe(true);
    });

    it("should NOT detect files outside test/red/", () => {
      expect(isRedPhaseTestPath("test/unit/feature.test.ts")).toBe(false);
      expect(isRedPhaseTestPath("test/smoke/feature.test.ts")).toBe(false);
      expect(isRedPhaseTestPath("test/redish/feature.test.ts")).toBe(false);
      expect(isRedPhaseTestPath("src/test/feature.test.ts")).toBe(false);
    });
  });

  describe("Task ID extraction from // @orchestra-task: N", () => {
    it("should extract task ID from TypeScript file", async () => {
      const content = `// @orchestra-task: 3
describe('Feature', () => {
  it('should work', () => {
    expect(true).toBe(false);
  });
});
`;
      const redDir = path.join(tempDir, "test", "red");
      await fs.mkdir(redDir, { recursive: true });
      const testFile = path.join(redDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const result = await scanTddFile(testFile);

      expect(result.taskId).toBe(3);
    });

    it("should extract task ID from Dart file", async () => {
      const content = `// @orchestra-task: 5

void main() {
  test('should work', () {
    expect(1, equals(2));
  });
}
`;
      const redDir = path.join(tempDir, "test", "red");
      await fs.mkdir(redDir, { recursive: true });
      const testFile = path.join(redDir, "test.dart");
      await fs.writeFile(testFile, content);

      const result = await scanTddFile(testFile);

      expect(result.taskId).toBe(5);
    });

    it("should extract task ID from Python file with # comment", async () => {
      const content = `# @orchestra-task: 7
def test_feature():
    assert False
`;
      const redDir = path.join(tempDir, "test", "red");
      await fs.mkdir(redDir, { recursive: true });
      const testFile = path.join(redDir, "test_feature.test.ts");
      await fs.writeFile(testFile, content);

      const result = await scanTddFile(testFile);

      expect(result.taskId).toBe(7);
    });

    it("should return null if no task ID comment", async () => {
      const content = `
describe('Feature', () => {
  it('should work', () => {});
});
`;
      const redDir = path.join(tempDir, "test", "red");
      await fs.mkdir(redDir, { recursive: true });
      const testFile = path.join(redDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const result = await scanTddFile(testFile);

      expect(result.taskId).toBeNull();
    });

    it("should work with extractOrchestraTaskId directly", () => {
      const lines = ["// @orchestra-task: 42", "describe('test', () => {});"];
      expect(extractOrchestraTaskId(lines)).toBe(42);
    });

    it("should return null for empty lines", () => {
      expect(extractOrchestraTaskId([])).toBeNull();
    });
  });

  describe("Path-based detection - scanTddFile", () => {
    it("should detect file under test/red/ as red-phase", async () => {
      const content = `// @orchestra-task: 3

describe('Feature', () => {
  it('should work', () => {
    expect(true).toBe(false);
  });
});
`;
      const redDir = path.join(tempDir, "test", "red");
      await fs.mkdir(redDir, { recursive: true });
      const testFile = path.join(redDir, "feature.test.ts");
      await fs.writeFile(testFile, content);

      const result = await scanTddFile(testFile);

      expect(result.hasFileLevelTag).toBe(true);
      expect(result.markers).toHaveLength(1);
      expect(result.markers[0].markerType).toBe("path-based");
      expect(result.taskId).toBe(3);
    });

    it("should NOT detect file outside test/red/ as red-phase", async () => {
      const content = `// @orchestra-task: 3

describe('Feature', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});
`;
      const unitDir = path.join(tempDir, "test", "unit");
      await fs.mkdir(unitDir, { recursive: true });
      const testFile = path.join(unitDir, "feature.test.ts");
      await fs.writeFile(testFile, content);

      const result = await scanTddFile(testFile);

      expect(result.hasFileLevelTag).toBe(false);
      expect(result.markers).toHaveLength(0);
      expect(result.taskId).toBe(3);
    });

    it("should detect nested files under test/red/", async () => {
      const content = `// @orchestra-task: 10

describe('Nested', () => {
  it('deep test', () => {});
});
`;
      const nestedDir = path.join(tempDir, "test", "red", "core", "nested");
      await fs.mkdir(nestedDir, { recursive: true });
      const testFile = path.join(nestedDir, "deep.test.ts");
      await fs.writeFile(testFile, content);

      const result = await scanTddFile(testFile);

      expect(result.hasFileLevelTag).toBe(true);
      expect(result.markers).toHaveLength(1);
      expect(result.taskId).toBe(10);
    });
  });

  describe("scanForTddRedMarkers", () => {
    it("should return markers for file under test/red/", async () => {
      const content = `// @orchestra-task: 3
it('test', () => {});
`;
      const redDir = path.join(tempDir, "test", "red");
      await fs.mkdir(redDir, { recursive: true });
      const testFile = path.join(redDir, "feature.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].markerType).toBe("path-based");
    });

    it("should return empty array for file NOT under test/red/", async () => {
      const content = `describe('Normal', () => {
  it('test', () => {});
});
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(0);
    });

    it("should return empty array for empty file outside test/red/", async () => {
      const testFile = path.join(tempDir, "empty.test.ts");
      await fs.writeFile(testFile, "");

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(0);
    });
  });

  describe("Content-based markers are NOT used", () => {
    it("should NOT detect [tdd-red] in test names (content scanning removed)", async () => {
      const content = `// @orchestra-task: 3

describe('[tdd-red] Feature', () => {
  it('[tdd-red] should work', () => {
    expect(true).toBe(false);
  });
});
`;
      // File NOT under test/red/ - even with content markers, should not be detected
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const result = await scanTddFile(testFile);

      // No markers because detection is path-based, not content-based
      expect(result.markers).toHaveLength(0);
      expect(result.hasFileLevelTag).toBe(false);
      // Task ID still extracted
      expect(result.taskId).toBe(3);
    });

    it("should NOT detect @Tags(['tdd-red']) in Dart files (content scanning removed)", async () => {
      const content = `// @orchestra-task: 5
@Tags(['tdd-red'])
library;

void main() {
  test('test', () {
    expect(true, isFalse);
  });
}
`;
      // File NOT under test/red/
      const testFile = path.join(tempDir, "test.dart");
      await fs.writeFile(testFile, content);

      const result = await scanTddFile(testFile);

      expect(result.markers).toHaveLength(0);
      expect(result.hasFileLevelTag).toBe(false);
      expect(result.taskId).toBe(5);
    });
  });

  describe("Path-based assertions for test/red/ subdirectories", () => {
    describe("isRedPhaseTestPath with tier subdirectories", () => {
      it("should detect test/red/unit/ subdirectory paths", () => {
        expect(isRedPhaseTestPath("test/red/unit/feature.test.ts")).toBe(true);
      });

      it("should detect test/red/integration/ subdirectory paths", () => {
        expect(isRedPhaseTestPath("test/red/integration/api/users.test.ts")).toBe(true);
      });

      it("should detect test/red/smoke/ subdirectory paths", () => {
        expect(isRedPhaseTestPath("test/red/smoke/health.test.ts")).toBe(true);
      });

      it("should detect deeply nested paths under test/red/", () => {
        expect(isRedPhaseTestPath("test/red/unit/core/deep/nested/feature.test.ts")).toBe(true);
      });

      it("should detect absolute paths containing test/red/ with tier subdirectories", () => {
        expect(isRedPhaseTestPath("/workspace/project/test/red/unit/feature.test.ts")).toBe(true);
        expect(isRedPhaseTestPath("/workspace/project/test/red/integration/api/users.test.ts")).toBe(true);
      });

      it("should detect Windows paths containing test/red/ with tier subdirectories", () => {
        expect(isRedPhaseTestPath("C:\\project\\test\\red\\unit\\feature.test.ts")).toBe(true);
        expect(isRedPhaseTestPath("C:\\project\\test\\red\\integration\\api\\users.test.ts")).toBe(true);
      });

      it("should NOT detect paths like test/redunit/ or test/red-unit/", () => {
        // test/red/ requires the trailing slash - "redunit" should not match
        expect(isRedPhaseTestPath("test/redunit/feature.test.ts")).toBe(false);
        expect(isRedPhaseTestPath("test/red-unit/feature.test.ts")).toBe(false);
      });
    });

    describe("scanTddFile returns path-based markerType for red-phase files", () => {
      it("should return markerType: 'path-based' for test/red/unit/ file", async () => {
        const content = `// @orchestra-task: 8
import { describe, it, expect } from 'vitest';

describe('Feature', () => {
  it('should validate input', () => {
    expect(true).toBe(false);
  });
});
`;
        const redUnitDir = path.join(tempDir, "test", "red", "unit");
        await fs.mkdir(redUnitDir, { recursive: true });
        const testFile = path.join(redUnitDir, "feature.test.ts");
        await fs.writeFile(testFile, content);

        const result = await scanTddFile(testFile);

        expect(result.hasFileLevelTag).toBe(true);
        expect(result.markers).toHaveLength(1);
        expect(result.markers[0].markerType).toBe("path-based");
        expect(result.markers[0].testIdentifier).toContain("feature.test.ts");
        expect(result.markers[0].testIdentifier).toContain("path-detected");
        expect(result.taskId).toBe(8);
      });

      it("should return markerType: 'path-based' for test/red/integration/ file", async () => {
        const content = `// @orchestra-task: 12
import { describe, it, expect } from 'vitest';

describe('API Users Integration', () => {
  it('should create user', () => {
    expect(false).toBe(true);
  });
});
`;
        const redIntDir = path.join(tempDir, "test", "red", "integration", "api");
        await fs.mkdir(redIntDir, { recursive: true });
        const testFile = path.join(redIntDir, "users.test.ts");
        await fs.writeFile(testFile, content);

        const result = await scanTddFile(testFile);

        expect(result.hasFileLevelTag).toBe(true);
        expect(result.markers).toHaveLength(1);
        expect(result.markers[0].markerType).toBe("path-based");
        expect(result.markers[0].testIdentifier).toContain("users.test.ts");
        expect(result.markers[0].testIdentifier).toContain("path-detected");
        expect(result.taskId).toBe(12);
      });

      it("should return no markers for file in test/unit/ (not test/red/)", async () => {
        const content = `// @orchestra-task: 15
import { describe, it, expect } from 'vitest';

describe('Normal unit test', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });
});
`;
        const unitDir = path.join(tempDir, "test", "unit");
        await fs.mkdir(unitDir, { recursive: true });
        const testFile = path.join(unitDir, "normal.test.ts");
        await fs.writeFile(testFile, content);

        const result = await scanTddFile(testFile);

        expect(result.hasFileLevelTag).toBe(false);
        expect(result.markers).toHaveLength(0);
        // Task ID is still extracted from content
        expect(result.taskId).toBe(15);
      });

      it("should return path-based markers for various tier subdirectories within test/red/", async () => {
        // Create files in multiple tier subdirectories under test/red/
        const tiers = ["smoke", "unit", "integration"];
        for (const tier of tiers) {
          const tierDir = path.join(tempDir, "test", "red", tier);
          await fs.mkdir(tierDir, { recursive: true });
          const content = `// @orchestra-task: 20
describe('${tier} tier test', () => {
  it('should fail', () => { expect(true).toBe(false); });
});
`;
          await fs.writeFile(path.join(tierDir, `${tier}-test.test.ts`), content);
        }

        // Verify each tier file is detected as path-based
        for (const tier of tiers) {
          const testFile = path.join(tempDir, "test", "red", tier, `${tier}-test.test.ts`);
          const result = await scanTddFile(testFile);

          expect(result.hasFileLevelTag).toBe(true);
          expect(result.markers).toHaveLength(1);
          expect(result.markers[0].markerType).toBe("path-based");
          expect(result.taskId).toBe(20);
        }
      });
    });
  });
});
