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
    it("should accept valid FileGroup props", () => {
      const validProps: import("../../../../src/webviews/agent-panel/components/FileGroup.js").FileGroupProps =
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
      expect(validProps).toBeDefined();
    });

    it("should accept valid FileRow props", () => {
      const validFile: FileOperation = {
        operation: "create",
        path: "src/new.ts",
        targetPath: undefined,
        size: 200,
        linesChanged: undefined,
        linesInserted: undefined,
        linesDeleted: undefined,
      };

      const validProps: import("../../../../src/webviews/agent-panel/components/FileRow.js").FileRowProps =
        {
          file: validFile,
          operationType: "created",
        };
      expect(validProps).toBeDefined();
    });
  });
});
