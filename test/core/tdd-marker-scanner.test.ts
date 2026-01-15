/**
 * Tests for TDD Red Marker Scanner
 *
 * The scanner detects TDD red markers using the SINGLE-TOKEN format:
 * - Dart: @Tags(['tdd-red:task-N']) or tags: ['tdd-red:task-N']
 * - TypeScript: [tdd-red:task-N] prefix in test/describe name
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanForTddRedMarkers } from "../../src/core/tdd-marker-scanner.js";

describe("TDD Marker Scanner", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tdd-scanner-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Dart patterns - single token format", () => {
    it("should detect @Tags(['tdd-red:task-3']) annotation", async () => {
      const content = `
import 'package:test/test.dart';

void main() {
  group('MyGroup', () {
    @Tags(['tdd-red:task-3'])
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
        "test.dart::MyGroup::should fail intentionally"
      );
      expect(markers[0].markerType).toBe("@Tags(['tdd-red:task-3'])");
      expect(markers[0].lineNumber).toBe(6);
    });

    it("should detect file-level @Tags(['tdd-red:task-5']) before void main()", async () => {
      const content = `@Tags(['tdd-red:task-5'])
library;

import 'package:test/test.dart';

void main() {
  group('XAxisConfig', () {
    group('construction', () {
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

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(2);
      expect(markers[0].testIdentifier).toContain("should have default values");
      expect(markers[0].markerType).toBe(
        "file-level-@Tags(['tdd-red:task-5'])"
      );
      expect(markers[1].testIdentifier).toContain(
        "should accept custom values"
      );
      expect(markers[1].markerType).toBe(
        "file-level-@Tags(['tdd-red:task-5'])"
      );
    });

    it("should detect inline tags: ['tdd-red:task-7'] parameter in test()", async () => {
      const content = `
void main() {
  test('red phase test', () {
    expect(false, isTrue);
  }, tags: ['tdd-red:task-7']);
}
`;
      const testFile = path.join(tempDir, "inline_tags_test.dart");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].testIdentifier).toBe(
        "inline_tags_test.dart::::red phase test"
      );
      expect(markers[0].markerType).toBe("tags:['tdd-red:task-7']");
    });

    it("should detect @Tags with double quotes", async () => {
      const content = `
void main() {
  @Tags(["tdd-red:task-10"])
  test('double quote test', () {
    fail('not implemented');
  });
}
`;
      const testFile = path.join(tempDir, "double_quote_test.dart");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].markerType).toBe("@Tags(['tdd-red:task-10'])");
    });

    it("should NOT detect old format @Tags(['tdd-red']) without task ID", async () => {
      const content = `
void main() {
  @Tags(['tdd-red'])
  test('old format test', () {
    fail('not implemented');
  });
}
`;
      const testFile = path.join(tempDir, "old_format_test.dart");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      // Should NOT detect old format
      expect(markers).toHaveLength(0);
    });
  });

  describe("TypeScript patterns - [tdd-red:task-N] in name", () => {
    it("should detect [tdd-red:task-3] in test name", async () => {
      const content = `
describe('Feature', () => {
  it('[tdd-red:task-3] should work eventually', () => {
    expect(true).toBe(false);
  });
});
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].testIdentifier).toBe(
        "test.test.ts::Feature::[tdd-red:task-3] should work eventually"
      );
      expect(markers[0].markerType).toBe("[tdd-red:task-3]");
      expect(markers[0].lineNumber).toBe(3);
    });

    it("should detect [tdd-red:task-5] in describe name", async () => {
      const content = `
describe('[tdd-red:task-5] Feature group', () => {
  it('test one', () => {
    expect(1).toBe(2);
  });
  it('test two', () => {
    expect(true).toBe(false);
  });
});
`;
      const testFile = path.join(tempDir, "suite.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].markerType).toBe("[tdd-red:task-5]");
      expect(markers[0].testIdentifier).toContain("Feature group");
    });

    it("should detect it.skip with [tdd-red:task-N]", async () => {
      const content = `
describe('Feature', () => {
  it.skip('[tdd-red:task-4] pending feature', () => {
    expect(true).toBe(false);
  });
});
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].markerType).toBe("[tdd-red:task-4]");
    });

    it("should NOT detect it.skip without [tdd-red:task-N]", async () => {
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

      // Should NOT detect - no tdd-red:task-N marker
      expect(markers).toHaveLength(0);
    });

    it("should NOT detect old format [tdd-red] without task ID", async () => {
      const content = `
describe('Feature', () => {
  it('[tdd-red] old format test', () => {
    expect(true).toBe(false);
  });
});
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      // Should NOT detect old format
      expect(markers).toHaveLength(0);
    });
  });

  describe("Multiple markers", () => {
    it("should detect multiple markers in one file", async () => {
      const content = `
describe('Suite', () => {
  it('[tdd-red:task-3] test one', () => {});
  it('[tdd-red:task-3] test two', () => {});
  it('[tdd-red:task-5] different task', () => {});
});
`;
      const testFile = path.join(tempDir, "multi.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(3);
      expect(
        markers.filter((m) => m.markerType === "[tdd-red:task-3]")
      ).toHaveLength(2);
      expect(
        markers.filter((m) => m.markerType === "[tdd-red:task-5]")
      ).toHaveLength(1);
    });
  });

  describe("Edge cases", () => {
    it("should handle nested describe blocks", async () => {
      const content = `
describe('Outer', () => {
  describe('Inner', () => {
    it('[tdd-red:task-3] nested test', () => {});
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
      const content = `
describe("Feature", () => {
  it("[tdd-red:task-3] double quotes", () => {});
  it(\`[tdd-red:task-4] template literal\`, () => {});
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
});
