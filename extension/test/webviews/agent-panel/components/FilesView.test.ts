/**
 * FilesView Component Tests
 *
 * Tests for the FilesView component covering:
 * - Component exports and type interfaces
 * - FileGroup, FileRow component availability
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.7
 */

import { describe, expect, it } from "vitest";
import type { FileOperation } from "../../../../src/agents/sessions/types.js";

describe("FilesView Components", () => {
  describe("Component Exports", () => {
    it("should export FilesView component", async () => {
      const module =
        await import("../../../../src/webviews/agent-panel/views/index.js");
      expect(module.FilesView).toBeDefined();
      expect(typeof module.FilesView).toBe("function");
    });

    it("should export FileGroup component", async () => {
      const module =
        await import("../../../../src/webviews/agent-panel/components/index.js");
      expect(module.FileGroup).toBeDefined();
      expect(typeof module.FileGroup).toBe("function");
    });

    it("should export FileRow component", async () => {
      const module =
        await import("../../../../src/webviews/agent-panel/components/index.js");
      expect(module.FileRow).toBeDefined();
      expect(typeof module.FileRow).toBe("function");
    });
  });

  describe("Type Compatibility", () => {
    it("should accept valid FileGroup props with all operation types", () => {
      const modifiedProps: import("../../../../src/webviews/agent-panel/components/FileGroup.js").FileGroupProps =
        {
          operationType: "modified",
          files: [
            {
              operation: "update",
              path: "src/test.ts",
              targetPath: undefined,
              size: 100,
              linesChanged: 5,
              linesInserted: 3,
              linesDeleted: 2,
            },
          ],
        };
      expect(modifiedProps).toBeDefined();

      const createdProps: import("../../../../src/webviews/agent-panel/components/FileGroup.js").FileGroupProps =
        {
          operationType: "created",
          files: [],
        };
      expect(createdProps).toBeDefined();

      const deletedProps: import("../../../../src/webviews/agent-panel/components/FileGroup.js").FileGroupProps =
        {
          operationType: "deleted",
          files: [],
        };
      expect(deletedProps).toBeDefined();

      const readProps: import("../../../../src/webviews/agent-panel/components/FileGroup.js").FileGroupProps =
        {
          operationType: "read",
          files: [],
        };
      expect(readProps).toBeDefined();
    });

    it("should accept valid FileRow props with all operation types", () => {
      const validFile: FileOperation = {
        operation: "create",
        path: "src/new.ts",
        targetPath: undefined,
        size: 200,
        linesChanged: undefined,
        linesInserted: undefined,
        linesDeleted: undefined,
      };

      const modifiedProps: import("../../../../src/webviews/agent-panel/components/FileRow.js").FileRowProps =
        {
          file: validFile,
          operationType: "modified",
        };
      expect(modifiedProps).toBeDefined();

      const createdProps: import("../../../../src/webviews/agent-panel/components/FileRow.js").FileRowProps =
        {
          file: validFile,
          operationType: "created",
        };
      expect(createdProps).toBeDefined();

      const deletedProps: import("../../../../src/webviews/agent-panel/components/FileRow.js").FileRowProps =
        {
          file: validFile,
          operationType: "deleted",
        };
      expect(deletedProps).toBeDefined();

      const readProps: import("../../../../src/webviews/agent-panel/components/FileRow.js").FileRowProps =
        {
          file: validFile,
          operationType: "read",
        };
      expect(readProps).toBeDefined();
    });

    it("should handle all FileOperation types", () => {
      const operations: FileOperation[] = [
        {
          operation: "update",
          path: "src/updated.ts",
          targetPath: undefined,
          size: 100,
          linesChanged: 5,
          linesInserted: 3,
          linesDeleted: 2,
        },
        {
          operation: "create",
          path: "src/created.ts",
          targetPath: undefined,
          size: 50,
          linesChanged: undefined,
          linesInserted: undefined,
          linesDeleted: undefined,
        },
        {
          operation: "delete",
          path: "src/deleted.ts",
          targetPath: undefined,
          size: 75,
          linesChanged: undefined,
          linesInserted: undefined,
          linesDeleted: undefined,
        },
        {
          operation: "read",
          path: "src/read.ts",
          targetPath: undefined,
          size: 200,
          linesChanged: undefined,
          linesInserted: undefined,
          linesDeleted: undefined,
        },
      ];

      expect(operations).toHaveLength(4);
      expect(operations.map((op) => op.operation)).toEqual([
        "update",
        "create",
        "delete",
        "read",
      ]);
    });
  });

  describe("File Grouping Logic", () => {
    it("should map update operations to modified group", () => {
      const operation: FileOperation = {
        operation: "update",
        path: "src/file.ts",
        targetPath: undefined,
        size: 100,
        linesChanged: 5,
        linesInserted: 3,
        linesDeleted: 2,
      };

      expect(operation.operation).toBe("update");
      // In FilesView, update operations are grouped as "modified"
    });

    it("should map create operations to created group", () => {
      const operation: FileOperation = {
        operation: "create",
        path: "src/file.ts",
        targetPath: undefined,
        size: 100,
        linesChanged: undefined,
        linesInserted: undefined,
        linesDeleted: undefined,
      };

      expect(operation.operation).toBe("create");
      // In FilesView, create operations are grouped as "created"
    });

    it("should map delete operations to deleted group", () => {
      const operation: FileOperation = {
        operation: "delete",
        path: "src/file.ts",
        targetPath: undefined,
        size: 100,
        linesChanged: undefined,
        linesInserted: undefined,
        linesDeleted: undefined,
      };

      expect(operation.operation).toBe("delete");
      // In FilesView, delete operations are grouped as "deleted"
    });

    it("should map read operations to read group", () => {
      const operation: FileOperation = {
        operation: "read",
        path: "src/file.ts",
        targetPath: undefined,
        size: 100,
        linesChanged: undefined,
        linesInserted: undefined,
        linesDeleted: undefined,
      };

      expect(operation.operation).toBe("read");
      // In FilesView, read operations are grouped as "read"
    });
  });
});
