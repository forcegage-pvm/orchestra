/**
 * Tests for TDD Red Marker Scanner
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { scanForTddRedMarkers } from "../../src/core/tdd-marker-scanner.js";

describe("TDD Marker Scanner", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tdd-scanner-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Dart patterns", () => {
    it("should detect @Tags(['tdd-red']) annotation", async () => {
      const content = `
import 'package:test/test.dart';

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
        "test.dart::MyGroup::should fail intentionally"
      );
      expect(markers[0].markerType).toBe("@Tags(['tdd-red'])");
      expect(markers[0].lineNumber).toBe(6);
    });

    it("should detect @Tags(['red']) annotation", async () => {
      const content = `
void main() {
  @Tags(['red'])
  test('red test', () {
    fail('not implemented');
  });
}
`;
      const testFile = path.join(tempDir, "test.dart");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].markerType).toBe("@Tags(['red'])");
      expect(markers[0].testIdentifier).toBe("test.dart::::red test");
    });

    it("should detect tests in tdd-red directory", async () => {
      const tddRedDir = path.join(tempDir, "tdd-red");
      await fs.mkdir(tddRedDir);

      const content = `
void main() {
  test('test in red directory', () {
    expect(false, isTrue);
  });
}
`;
      const testFile = path.join(tddRedDir, "red_test.dart");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].testIdentifier).toBe(
        "red_test.dart::::test in red directory"
      );
      expect(markers[0].markerType).toBe("tdd-red-directory");
    });
  });

  describe("TypeScript patterns", () => {
    it("should detect it.skip", async () => {
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

      expect(markers).toHaveLength(1);
      expect(markers[0].testIdentifier).toBe(
        "test.test.ts::Feature::should work eventually"
      );
      expect(markers[0].markerType).toBe("it.skip");
      expect(markers[0].lineNumber).toBe(3);
    });

    it("should detect test.skip", async () => {
      const content = `
describe('Suite', () => {
  test.skip('pending test', () => {
    expect(1).toBe(2);
  });
});
`;
      const testFile = path.join(tempDir, "suite.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].markerType).toBe("test.skip");
    });

    it("should detect it.todo", async () => {
      const content = `
describe('Feature', () => {
  it.todo('implement later');
});
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].testIdentifier).toBe(
        "test.test.ts::Feature::implement later"
      );
      expect(markers[0].markerType).toBe("it.todo");
    });

    it("should detect test.todo", async () => {
      const content = `
test.todo('future test');
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].markerType).toBe("test.todo");
    });

    it("should detect xit", async () => {
      const content = `
describe('Suite', () => {
  xit('disabled test', () => {
    expect(false).toBe(true);
  });
});
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].markerType).toBe("xit");
    });

    it("should detect xtest", async () => {
      const content = `
xtest('excluded test', () => {
  throw new Error('should not run');
});
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].markerType).toBe("xtest");
    });

    it("should detect xdescribe", async () => {
      const content = `
xdescribe('Disabled suite', () => {
  it('test 1', () => {});
  it('test 2', () => {});
});
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].markerType).toBe("xdescribe");
    });

    it("should detect describe.skip", async () => {
      const content = `
describe.skip('Skipped suite', () => {
  it('will not run', () => {});
});
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      expect(markers[0].markerType).toBe("describe.skip");
    });
  });

  describe("Multiple markers", () => {
    it("should detect multiple markers in one file", async () => {
      const content = `
describe('Suite', () => {
  it.skip('skipped test', () => {});
  
  it.todo('future test');
  
  xit('another skipped', () => {});
});
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(3);
      expect(markers[0].markerType).toBe("it.skip");
      expect(markers[1].markerType).toBe("it.todo");
      expect(markers[2].markerType).toBe("xit");
    });
  });

  describe("Edge cases", () => {
    it("should handle empty file", async () => {
      const testFile = path.join(tempDir, "empty.test.ts");
      await fs.writeFile(testFile, "");

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(0);
    });

    it("should handle file with no markers", async () => {
      const content = `
describe('Normal tests', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });
});
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(0);
    });

    it("should handle nested describe blocks", async () => {
      const content = `
describe('Outer', () => {
  describe('Inner', () => {
    it.skip('nested skip', () => {});
  });
});
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(1);
      // Should use the last describe block as group
      expect(markers[0].testIdentifier).toContain("Inner");
    });

    it("should handle different quote styles", async () => {
      const content = `
describe("Double quotes", () => {
  it.skip("test with doubles", () => {});
  it.skip('test with singles', () => {});
  it.skip(\`test with backticks\`, () => {});
});
`;
      const testFile = path.join(tempDir, "test.test.ts");
      await fs.writeFile(testFile, content);

      const markers = await scanForTddRedMarkers(testFile);

      expect(markers).toHaveLength(3);
    });
  });
});
