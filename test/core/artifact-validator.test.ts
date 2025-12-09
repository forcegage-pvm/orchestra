/**
 * Artifact Validator Tests
 *
 * TDD tests for validating that artifacts claimed in signal_completion
 * actually exist on the filesystem.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Artifact,
  validateArtifacts,
} from "../../src/core/artifact-validator.js";

describe("Artifact Validator", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("validateArtifacts", () => {
    it("should pass when all artifacts exist", async () => {
      // Create test files
      const file1 = path.join(tempDir, "file1.ts");
      const file2 = path.join(tempDir, "file2.ts");
      fs.writeFileSync(file1, "content1");
      fs.writeFileSync(file2, "content2");

      const artifacts: Artifact[] = [
        { path: file1, type: "CREATE", description: "File 1" },
        { path: file2, type: "CREATE", description: "File 2" },
      ];

      const result = await validateArtifacts(artifacts, tempDir);

      expect(result.allValid).toBe(true);
      expect(result.validCount).toBe(2);
      expect(result.invalidCount).toBe(0);
      expect(result.missing).toHaveLength(0);
    });

    it("should fail when artifacts are missing", async () => {
      const artifacts: Artifact[] = [
        { path: "nonexistent.ts", type: "CREATE", description: "Missing file" },
      ];

      const result = await validateArtifacts(artifacts, tempDir);

      expect(result.allValid).toBe(false);
      expect(result.validCount).toBe(0);
      expect(result.invalidCount).toBe(1);
      expect(result.missing).toContain("nonexistent.ts");
    });

    it("should handle relative paths", async () => {
      // Create file in subdirectory
      const subdir = path.join(tempDir, "src");
      fs.mkdirSync(subdir);
      fs.writeFileSync(path.join(subdir, "index.ts"), "export {}");

      const artifacts: Artifact[] = [
        { path: "src/index.ts", type: "CREATE", description: "Index file" },
      ];

      const result = await validateArtifacts(artifacts, tempDir);

      expect(result.allValid).toBe(true);
    });

    it("should handle absolute paths", async () => {
      const absolutePath = path.join(tempDir, "absolute.ts");
      fs.writeFileSync(absolutePath, "content");

      const artifacts: Artifact[] = [
        {
          path: absolutePath,
          type: "CREATE",
          description: "Absolute path file",
        },
      ];

      const result = await validateArtifacts(artifacts, tempDir);

      expect(result.allValid).toBe(true);
    });

    it("should skip validation for DELETE type artifacts", async () => {
      const artifacts: Artifact[] = [
        {
          path: "deleted-file.ts",
          type: "DELETE",
          description: "Deleted file",
        },
      ];

      const result = await validateArtifacts(artifacts, tempDir);

      expect(result.allValid).toBe(true);
      expect(result.skipped).toContain("deleted-file.ts");
    });

    it("should validate UPDATE type artifacts exist", async () => {
      const file = path.join(tempDir, "updated.ts");
      fs.writeFileSync(file, "updated content");

      const artifacts: Artifact[] = [
        { path: file, type: "UPDATE", description: "Updated file" },
      ];

      const result = await validateArtifacts(artifacts, tempDir);

      expect(result.allValid).toBe(true);
    });

    it("should fail if UPDATE artifact does not exist", async () => {
      const artifacts: Artifact[] = [
        {
          path: "missing-update.ts",
          type: "UPDATE",
          description: "Updated file",
        },
      ];

      const result = await validateArtifacts(artifacts, tempDir);

      expect(result.allValid).toBe(false);
      expect(result.missing).toContain("missing-update.ts");
    });

    it("should handle empty artifacts list", async () => {
      const result = await validateArtifacts([], tempDir);

      expect(result.allValid).toBe(true);
      expect(result.validCount).toBe(0);
      expect(result.invalidCount).toBe(0);
    });

    it("should provide detailed results for each artifact", async () => {
      const existingFile = path.join(tempDir, "exists.ts");
      fs.writeFileSync(existingFile, "content");

      const artifacts: Artifact[] = [
        { path: existingFile, type: "CREATE", description: "Exists" },
        { path: "missing.ts", type: "CREATE", description: "Missing" },
        { path: "deleted.ts", type: "DELETE", description: "Deleted" },
      ];

      const result = await validateArtifacts(artifacts, tempDir);

      expect(result.details).toHaveLength(3);
      expect(result.details[0].valid).toBe(true);
      expect(result.details[1].valid).toBe(false);
      expect(result.details[2].skipped).toBe(true);
    });

    it("should handle directories as artifacts", async () => {
      const dir = path.join(tempDir, "newdir");
      fs.mkdirSync(dir);

      const artifacts: Artifact[] = [
        { path: "newdir", type: "CREATE", description: "New directory" },
      ];

      const result = await validateArtifacts(artifacts, tempDir);

      expect(result.allValid).toBe(true);
    });
  });
});
