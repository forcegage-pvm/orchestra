/**
 * Tests for ContextFileResolver
 *
 * Verifies that ContextFileResolver correctly resolves context_files
 * from handover database records to vscode.Uri arrays.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { ContextFileResolver } from "../../src/prompts/ContextFileResolver.js";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import type { Handover } from "../../src/database/queries.js";

// Mock the queries module
vi.mock("../../src/database/queries.js", () => ({
  getHandover: vi.fn(),
}));

// Mock the fs module
vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

describe("ContextFileResolver", () => {
  let workspaceRoot: string;
  let getHandoverMock: ReturnType<typeof vi.fn>;
  let existsSyncMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Suppress console.warn during tests to prevent stderr noise
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // Set workspace root for tests (use Windows-style path for tests on Windows)
    workspaceRoot = process.platform === "win32" ? "C:\\test\\workspace" : "/test/workspace";
    // Get the mock function
    const queries = await import("../../src/database/queries.js");
    getHandoverMock = queries.getHandover as ReturnType<typeof vi.fn>;
    
    // Get the fs mock
    existsSyncMock = fs.existsSync as ReturnType<typeof vi.fn>;
    
    // Reset mocks before each test
    getHandoverMock.mockReset();
    existsSyncMock.mockReset();
    
    // Default: all files exist
    existsSyncMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should accept workspaceRoot parameter", () => {
      const resolver = new ContextFileResolver(workspaceRoot);
      expect(resolver).toBeInstanceOf(ContextFileResolver);
    });

    it("should store workspaceRoot for later use", () => {
      const resolver = new ContextFileResolver(workspaceRoot);
      
      // Mock getHandover to return null
      getHandoverMock.mockReturnValue(null);
      
      // Verify by calling getContextFiles with a non-existent task
      const result = resolver.getContextFiles(999);
      
      // Should have called getHandover with correct workspace
      expect(getHandoverMock).toHaveBeenCalledWith(workspaceRoot, 999);
      expect(result).toEqual([]);
    });
  });

  describe("getContextFiles", () => {
    it("should return vscode.Uri array", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: "Test",
        context_files: '["src/config.ts", "src/utils/helpers.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      const result = resolver.getContextFiles(1);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0]).toBeInstanceOf(vscode.Uri);
      expect(result[1]).toBeInstanceOf(vscode.Uri);
    });

    it("should resolve paths relative to workspaceRoot", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: null,
        context_files: '["src/foo.ts", "lib/bar.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      const result = resolver.getContextFiles(1);

      expect(result.length).toBe(2);
      // vscode.Uri.file() returns objects with path property
      expect(result[0].path).toContain("src");
      expect(result[0].path).toContain("foo.ts");
      expect(result[1].path).toContain("lib");
      expect(result[1].path).toContain("bar.ts");
    });

    it("should return vscode.Uri.file() for each path", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: null,
        context_files: '["src/test.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      const result = resolver.getContextFiles(1);

      expect(result.length).toBe(1);
      expect(result[0].scheme).toBe("file");
      expect(result[0].path).toBe(path.join(workspaceRoot, "src", "test.ts"));
    });

    it("should handle null handover gracefully", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue(null);

      const result = resolver.getContextFiles(999);

      expect(result).toEqual([]);
    });

    it("should handle null context_files gracefully", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: null,
        context_files: null,
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      const result = resolver.getContextFiles(1);

      expect(result).toEqual([]);
    });

    it("should handle empty context_files array gracefully", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: null,
        context_files: "[]",
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      const result = resolver.getContextFiles(1);

      expect(result).toEqual([]);
    });

    it("should handle invalid JSON in context_files gracefully", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: null,
        context_files: "not valid json",
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      const result = resolver.getContextFiles(1);

      expect(result).toEqual([]);
    });

    it("should parse context_files JSON array correctly", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: null,
        context_files: '["path/to/file1.ts", "path/to/file2.ts", "path/to/file3.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      const result = resolver.getContextFiles(1);

      expect(result.length).toBe(3);
      expect(result[0].path).toBe(path.join(workspaceRoot, "path", "to", "file1.ts"));
      expect(result[1].path).toBe(path.join(workspaceRoot, "path", "to", "file2.ts"));
      expect(result[2].path).toBe(path.join(workspaceRoot, "path", "to", "file3.ts"));
    });

    it("should handle single file in context_files", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: null,
        context_files: '["README.md"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      const result = resolver.getContextFiles(1);

      expect(result.length).toBe(1);
      expect(result[0].path).toBe(path.join(workspaceRoot, "README.md"));
    });

    it("should handle paths with nested directories", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: null,
        context_files: '["src/deep/nested/path/file.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      const result = resolver.getContextFiles(1);

      expect(result.length).toBe(1);
      expect(result[0].path).toBe(
        path.join(workspaceRoot, "src", "deep", "nested", "path", "file.ts")
      );
    });

    it("should handle multiple tasks independently", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      // First call
      getHandoverMock.mockReturnValueOnce({
        id: 1,
        task_id: 10,
        priority: "P1",
        context: null,
        context_files: '["task10/file.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      // Second call
      getHandoverMock.mockReturnValueOnce({
        id: 2,
        task_id: 11,
        priority: "P1",
        context: null,
        context_files: '["task11/file.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      const result1 = resolver.getContextFiles(10);
      const result2 = resolver.getContextFiles(11);

      expect(result1.length).toBe(1);
      expect(result2.length).toBe(1);
      expect(result1[0].path).toBe(path.join(workspaceRoot, "task10", "file.ts"));
      expect(result2[0].path).toBe(path.join(workspaceRoot, "task11", "file.ts"));
    });
  });

  describe("integration with database", () => {
    it("should query getHandover from database/queries.ts", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 12,
        priority: "P1",
        context: null,
        context_files: '["integration/test.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      const result = resolver.getContextFiles(12);

      expect(result.length).toBe(1);
      expect(result[0].path).toContain("integration");
      expect(getHandoverMock).toHaveBeenCalledWith(workspaceRoot, 12);
    });

    it("should work with different workspace roots", () => {
      const workspace1 = process.platform === "win32" ? "C:\\workspace1" : "/workspace1";
      const workspace2 = process.platform === "win32" ? "C:\\workspace2" : "/workspace2";
      
      const resolver1 = new ContextFileResolver(workspace1);
      const resolver2 = new ContextFileResolver(workspace2);

      // Mock calls for workspace1
      getHandoverMock.mockReturnValueOnce({
        id: 1,
        task_id: 13,
        priority: "P1",
        context: null,
        context_files: '["ws1/file.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      // Mock calls for workspace2
      getHandoverMock.mockReturnValueOnce({
        id: 2,
        task_id: 13,
        priority: "P1",
        context: null,
        context_files: '["ws2/file.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      const result1 = resolver1.getContextFiles(13);
      const result2 = resolver2.getContextFiles(13);

      expect(result1[0].path).toBe(path.join(workspace1, "ws1", "file.ts"));
      expect(result2[0].path).toBe(path.join(workspace2, "ws2", "file.ts"));
      
      expect(getHandoverMock).toHaveBeenCalledWith(workspace1, 13);
      expect(getHandoverMock).toHaveBeenCalledWith(workspace2, 13);
    });
  });

  describe("getContextFilesWithStatus", () => {
    it("should return array of objects with uri and exists properties", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: "Test",
        context_files: '["src/config.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      existsSyncMock.mockReturnValue(true);

      const result = resolver.getContextFilesWithStatus(1);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0]).toHaveProperty("uri");
      expect(result[0]).toHaveProperty("exists");
      expect(result[0].uri).toBeInstanceOf(vscode.Uri);
      expect(typeof result[0].exists).toBe("boolean");
    });

    it("should return exists: true when file exists", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: null,
        context_files: '["src/existing.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      existsSyncMock.mockReturnValue(true);

      const result = resolver.getContextFilesWithStatus(1);

      expect(result.length).toBe(1);
      expect(result[0].exists).toBe(true);
    });

    it("should return exists: false when file does not exist", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: null,
        context_files: '["src/missing.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      existsSyncMock.mockReturnValue(false);

      const result = resolver.getContextFilesWithStatus(1);

      expect(result.length).toBe(1);
      expect(result[0].exists).toBe(false);
    });

    it("should call fs.existsSync for each file path", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: null,
        context_files: '["src/file1.ts", "src/file2.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      existsSyncMock.mockReturnValue(true);

      resolver.getContextFilesWithStatus(1);

      expect(existsSyncMock).toHaveBeenCalledTimes(2);
      expect(existsSyncMock).toHaveBeenCalledWith(path.join(workspaceRoot, "src", "file1.ts"));
      expect(existsSyncMock).toHaveBeenCalledWith(path.join(workspaceRoot, "src", "file2.ts"));
    });

    it("should log console.warn for missing files", () => {
      const resolver = new ContextFileResolver(workspaceRoot);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: null,
        context_files: '["src/missing.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      existsSyncMock.mockReturnValue(false);

      resolver.getContextFilesWithStatus(1);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Context file not found")
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("missing.ts")
      );

      warnSpy.mockRestore();
    });

    it("should not log console.warn for existing files", () => {
      const resolver = new ContextFileResolver(workspaceRoot);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: null,
        context_files: '["src/existing.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      existsSyncMock.mockReturnValue(true);

      resolver.getContextFilesWithStatus(1);

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("should handle mixed existing and missing files", () => {
      const resolver = new ContextFileResolver(workspaceRoot);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: null,
        context_files: '["src/existing.ts", "src/missing.ts", "src/another.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      // First and third files exist, second doesn't
      existsSyncMock
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      const result = resolver.getContextFilesWithStatus(1);

      expect(result.length).toBe(3);
      expect(result[0].exists).toBe(true);
      expect(result[1].exists).toBe(false);
      expect(result[2].exists).toBe(true);

      // Only one warning for the missing file
      expect(warnSpy).toHaveBeenCalledTimes(1);

      warnSpy.mockRestore();
    });

    it("should return empty array for null handover", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue(null);

      const result = resolver.getContextFilesWithStatus(999);

      expect(result).toEqual([]);
    });

    it("should return empty array for null context_files", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: null,
        context_files: null,
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      const result = resolver.getContextFilesWithStatus(1);

      expect(result).toEqual([]);
    });

    it("should return empty array for invalid JSON", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: null,
        context_files: "not valid json",
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      const result = resolver.getContextFilesWithStatus(1);

      expect(result).toEqual([]);
    });
  });

  describe("getContextFiles with file existence filtering", () => {
    it("should only return URIs for existing files", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: null,
        context_files: '["src/existing.ts", "src/missing.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      existsSyncMock
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const result = resolver.getContextFiles(1);

      expect(result.length).toBe(1);
      expect(result[0].path).toContain("existing.ts");
    });

    it("should return empty array when no files exist", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: null,
        context_files: '["src/missing1.ts", "src/missing2.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      existsSyncMock.mockReturnValue(false);

      const result = resolver.getContextFiles(1);

      expect(result).toEqual([]);
    });

    it("should return all URIs when all files exist", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      getHandoverMock.mockReturnValue({
        id: 1,
        task_id: 1,
        priority: "P1",
        context: null,
        context_files: '["src/file1.ts", "src/file2.ts", "src/file3.ts"]',
        acceptance_criteria: "[]",
        file_operations: "[]",
        deliverables: "[]",
        test_file: null,
        test_requirements: null,
        constraints: null,
        reference_links: null,
        created_at: "2023-01-01",
        updated_at: "2023-01-01",
      } as Handover);

      existsSyncMock.mockReturnValue(true);

      const result = resolver.getContextFiles(1);

      expect(result.length).toBe(3);
    });
  });
});
