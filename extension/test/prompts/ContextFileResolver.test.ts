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
import type { Handover } from "../../src/database/queries.js";

// Mock the queries module
vi.mock("../../src/database/queries.js", () => ({
  getHandover: vi.fn(),
}));

describe("ContextFileResolver", () => {
  let workspaceRoot: string;
  let getHandoverMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Set workspace root for tests (use Windows-style path for tests on Windows)
    workspaceRoot = process.platform === "win32" ? "C:\\test\\workspace" : "/test/workspace";

    // Get the mock function
    const queries = await import("../../src/database/queries.js");
    getHandoverMock = queries.getHandover as ReturnType<typeof vi.fn>;
    
    // Reset mock before each test
    getHandoverMock.mockReset();
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
});
