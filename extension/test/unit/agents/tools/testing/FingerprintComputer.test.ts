/**
 * FingerprintComputer unit tests
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FingerprintComputer } from "../../../../../../src/core/testing/FingerprintComputer.js";

describe("FingerprintComputer", () => {
  let computer: FingerprintComputer;
  let tempDir: string;

  beforeEach(async () => {
    computer = new FingerprintComputer();
    tempDir = await mkdtemp(join(tmpdir(), "fingerprint-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("compute()", () => {
    it("should return hash for single file", async () => {
      const filePath = join(tempDir, "test.ts");
      await writeFile(filePath, "export const value = 42;", "utf-8");

      const result = await computer.compute([filePath]);

      expect(result.hash).toBeDefined();
      expect(result.hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex is 64 chars
      expect(result.fileCount).toBe(1);
      expect(result.files).toEqual([filePath]);
    });

    it("should return same hash for same files regardless of input order", async () => {
      const file1 = join(tempDir, "a.ts");
      const file2 = join(tempDir, "b.ts");
      const file3 = join(tempDir, "c.ts");

      await writeFile(file1, "const a = 1;", "utf-8");
      await writeFile(file2, "const b = 2;", "utf-8");
      await writeFile(file3, "const c = 3;", "utf-8");

      const result1 = await computer.compute([file1, file2, file3]);
      const result2 = await computer.compute([file3, file1, file2]);
      const result3 = await computer.compute([file2, file3, file1]);

      expect(result1.hash).toBe(result2.hash);
      expect(result1.hash).toBe(result3.hash);
      expect(result1.files).toEqual([file1, file2, file3]); // Sorted order
      expect(result2.files).toEqual([file1, file2, file3]);
      expect(result3.files).toEqual([file1, file2, file3]);
    });

    it("should return different hash when file content changes", async () => {
      const filePath = join(tempDir, "test.ts");

      await writeFile(filePath, "const value = 42;", "utf-8");
      const result1 = await computer.compute([filePath]);

      await writeFile(filePath, "const value = 99;", "utf-8");
      const result2 = await computer.compute([filePath]);

      expect(result1.hash).not.toBe(result2.hash);
    });

    it("should handle missing files gracefully", async () => {
      const existingFile = join(tempDir, "exists.ts");
      const missingFile = join(tempDir, "missing.ts");

      await writeFile(existingFile, "const valid = true;", "utf-8");

      const result = await computer.compute([existingFile, missingFile]);

      expect(result.fileCount).toBe(1);
      expect(result.files).toEqual([existingFile]);
      expect(result.hash).toBeDefined();
    });

    it("should return correct fileCount and files array", async () => {
      const file1 = join(tempDir, "one.ts");
      const file2 = join(tempDir, "two.ts");
      const file3 = join(tempDir, "three.ts");

      await writeFile(file1, "1", "utf-8");
      await writeFile(file2, "2", "utf-8");
      await writeFile(file3, "3", "utf-8");

      const result = await computer.compute([file1, file2, file3]);

      expect(result.fileCount).toBe(3);
      expect(result.files).toHaveLength(3);
      expect(result.files).toContain(file1);
      expect(result.files).toContain(file2);
      expect(result.files).toContain(file3);
    });

    it("should produce valid hex-encoded SHA-256 string", async () => {
      const filePath = join(tempDir, "test.ts");
      await writeFile(filePath, "test content", "utf-8");

      const result = await computer.compute([filePath]);

      expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.hash.length).toBe(64);
    });

    it("should handle empty file array", async () => {
      const result = await computer.compute([]);

      expect(result.hash).toBeDefined();
      expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.fileCount).toBe(0);
      expect(result.files).toEqual([]);
    });

    it("should produce different hashes for different file paths with same content", async () => {
      const file1 = join(tempDir, "path1.ts");
      const file2 = join(tempDir, "path2.ts");

      await writeFile(file1, "same content", "utf-8");
      await writeFile(file2, "same content", "utf-8");

      const result1 = await computer.compute([file1]);
      const result2 = await computer.compute([file2]);

      // Hashes should differ because path is included in fingerprint
      expect(result1.hash).not.toBe(result2.hash);
    });

    it("should handle all files missing without crashing", async () => {
      const missing1 = join(tempDir, "missing1.ts");
      const missing2 = join(tempDir, "missing2.ts");

      const result = await computer.compute([missing1, missing2]);

      expect(result.fileCount).toBe(0);
      expect(result.files).toEqual([]);
      expect(result.hash).toBeDefined();
    });
  });
});
