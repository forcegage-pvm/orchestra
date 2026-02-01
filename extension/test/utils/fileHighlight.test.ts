/**
 * Tests for fileHighlight utility
 *
 * Verifies decoration creation, range calculation, timeout/dispose behavior,
 * and edge case handling.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { highlightRange } from "../../src/utils/fileHighlight.js";

// Hoist mock variables to top-level scope for vi.mock
const {
  mockDecorationType,
  disposeSpy,
  createTextEditorDecorationTypeSpy,
} = vi.hoisted(() => {
  const disposeSpy = vi.fn();
  const mockDecorationType = {
    dispose: disposeSpy,
    key: "mock-decoration",
  } as unknown as vscode.TextEditorDecorationType;

  const createTextEditorDecorationTypeSpy = vi.fn(() => mockDecorationType);

  return {
    mockDecorationType,
    disposeSpy,
    createTextEditorDecorationTypeSpy,
  };
});

// Mock vscode module
vi.mock("vscode", () => {
  return {
    Position: class Position {
      constructor(
        public line: number,
        public character: number,
      ) {}
    },
    Range: class Range {
      constructor(
        public start: { line: number; character: number },
        public end: { line: number; character: number },
      ) {}
    },
    OverviewRulerLane: {
      Full: 1,
    },
    window: {
      createTextEditorDecorationType: createTextEditorDecorationTypeSpy,
    },
  };
});

describe("fileHighlight", () => {
  describe("highlightRange", () => {
    let mockEditor: vscode.TextEditor;
    let setDecorationsSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.useFakeTimers();

      // Reset spies
      disposeSpy.mockClear();
      createTextEditorDecorationTypeSpy.mockClear();

      // Mock editor
      setDecorationsSpy = vi.fn();
      mockEditor = {
        setDecorations: setDecorationsSpy,
      } as unknown as vscode.TextEditor;
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should create decoration type with visible highlight style", () => {
      highlightRange(mockEditor, 10);

      expect(createTextEditorDecorationTypeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          backgroundColor: expect.any(String),
          isWholeLine: true,
        }),
      );
    });

    it("should apply decoration to single line when endLine not provided", () => {
      highlightRange(mockEditor, 10);

      expect(setDecorationsSpy).toHaveBeenCalledWith(mockDecorationType, [
        expect.any(vscode.Range),
      ]);

      const range = setDecorationsSpy.mock.calls[0][1][0] as vscode.Range;
      expect(range.start.line).toBe(9); // 10 - 1 (0-based)
      expect(range.end.line).toBe(9);
    });

    it("should apply decoration to range when endLine provided", () => {
      highlightRange(mockEditor, 10, 15);

      const range = setDecorationsSpy.mock.calls[0][1][0] as vscode.Range;
      expect(range.start.line).toBe(9); // 10 - 1 (0-based)
      expect(range.end.line).toBe(14); // 15 - 1 (0-based)
    });

    it("should auto-dispose decoration after 2 seconds", () => {
      highlightRange(mockEditor, 10);

      expect(disposeSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(2000);

      expect(disposeSpy).toHaveBeenCalled();
    });

    it("should not auto-dispose before 2 seconds", () => {
      highlightRange(mockEditor, 10);

      vi.advanceTimersByTime(1999);

      expect(disposeSpy).not.toHaveBeenCalled();
    });

    it("should return disposable that allows early cancellation", () => {
      const disposable = highlightRange(mockEditor, 10);

      expect(disposable).toBeDefined();
      expect(disposable?.dispose).toBeInstanceOf(Function);

      disposable?.dispose();

      expect(disposeSpy).toHaveBeenCalled();

      // Verify timeout is cleared (advancing time should not call dispose again)
      vi.advanceTimersByTime(2000);
      expect(disposeSpy).toHaveBeenCalledTimes(1);
    });

    it("should handle line 1 correctly (edge case)", () => {
      highlightRange(mockEditor, 1);

      const range = setDecorationsSpy.mock.calls[0][1][0] as vscode.Range;
      expect(range.start.line).toBe(0); // 1 - 1 = 0
    });

    it("should handle negative line numbers by clamping to 0", () => {
      highlightRange(mockEditor, -5);

      const range = setDecorationsSpy.mock.calls[0][1][0] as vscode.Range;
      expect(range.start.line).toBe(0); // Math.max(0, -5 - 1) = 0
    });

    it("should return undefined when editor is undefined", () => {
      const result = highlightRange(undefined, 10);

      expect(result).toBeUndefined();
      expect(setDecorationsSpy).not.toHaveBeenCalled();
    });

    it("should handle endLine before line by using Math.max", () => {
      highlightRange(mockEditor, 15, 10);

      const range = setDecorationsSpy.mock.calls[0][1][0] as vscode.Range;
      // Both should be converted correctly even if out of order
      expect(range.start.line).toBe(14); // 15 - 1
      expect(range.end.line).toBe(9); // 10 - 1
    });
  });
});
