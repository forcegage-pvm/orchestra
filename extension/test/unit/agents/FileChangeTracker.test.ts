import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const {
  readFileMock,
  applyEditMock,
  openTextDocumentMock,
  MockPosition,
  MockRange,
  MockWorkspaceEdit,
  MockEventEmitter,
  MockUri,
  workspace,
} = vi.hoisted(() => {
  const readFileMock = vi.fn();
  const applyEditMock = vi.fn();
  const openTextDocumentMock = vi.fn();

  class MockPosition {
    constructor(public line: number, public character: number) {}
  }

  class MockRange {
    constructor(public start: MockPosition, public end: MockPosition) {}
  }

  class MockWorkspaceEdit {
    public operations: Array<Record<string, unknown>> = [];

    createFile(uri: MockUri, options?: Record<string, unknown>): void {
      this.operations.push({ type: "createFile", uri, options });
    }

    deleteFile(uri: MockUri, options?: Record<string, unknown>): void {
      this.operations.push({ type: "deleteFile", uri, options });
    }

    insert(uri: MockUri, position: MockPosition, text: string): void {
      this.operations.push({ type: "insert", uri, position, text });
    }

    replace(uri: MockUri, range: MockRange, text: string): void {
      this.operations.push({ type: "replace", uri, range, text });
    }
  }

  class MockEventEmitter<T> {
    private listeners = new Set<(value: T) => void>();

    event = (listener: (value: T) => void) => {
      this.listeners.add(listener);
      return { dispose: () => this.listeners.delete(listener) };
    };

    fire(value: T): void {
      for (const listener of this.listeners) {
        listener(value);
      }
    }
  }

  class MockUri {
    constructor(public fsPath: string, private value: string) {}

    static parse(value: string): MockUri {
      return new MockUri(value, value);
    }

    toString(): string {
      return this.value;
    }
  }

  const workspace = {
    fs: {
      readFile: readFileMock,
    },
    applyEdit: applyEditMock,
    openTextDocument: openTextDocumentMock,
  };

  return {
    readFileMock,
    applyEditMock,
    openTextDocumentMock,
    MockPosition,
    MockRange,
    MockWorkspaceEdit,
    MockEventEmitter,
    MockUri,
    workspace,
  };
});

vi.mock("vscode", () => ({
  EventEmitter: MockEventEmitter,
  Position: MockPosition,
  Range: MockRange,
  Uri: MockUri,
  WorkspaceEdit: MockWorkspaceEdit,
  workspace,
}));

import { FileChangeTracker } from "../../../src/agents/FileChangeTracker.js";
import type { FileChange } from "../../../src/agents/types.js";

const createBaseChange = (
  overrides: Partial<Omit<FileChange, "id" | "undone" | "undoneAt">> = {}
): Omit<FileChange, "id" | "undone" | "undoneAt"> => ({
  uri: "file:///tmp/example.txt",
  relativePath: "example.txt",
  operation: "modify",
  previousContent: "before",
  previousContentHash: "hash-before",
  newContent: "after",
  newContentHash: "hash-after",
  toolCallId: "tool-123",
  timestamp: new Date().toISOString(),
  iteration: 1,
  ...overrides,
});

const createDoc = () => ({
  lineCount: 1,
  lineAt: () => ({
    range: { end: new MockPosition(0, 0) },
  }),
});

let tracker: FileChangeTracker;

beforeEach(() => {
  let counter = 0;
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => `uuid-${++counter}`),
  });

  readFileMock.mockReset();
  applyEditMock.mockReset();
  openTextDocumentMock.mockReset();

  tracker = new FileChangeTracker();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FileChangeTracker", () => {
  it("tracks changes with generated metadata", () => {
    const change = tracker.trackChange(createBaseChange());

    expect(change.id).toBe("uuid-1");
    expect(change.undone).toBe(false);
    expect(change.undoneAt).toBeNull();
    expect(tracker.getChanges()).toHaveLength(1);
  });

  it("emits change tracked events", () => {
    const listener = vi.fn();
    tracker.onChangeTracked(listener);

    const change = tracker.trackChange(createBaseChange());

    expect(listener).toHaveBeenCalledWith(change);
  });

  it("returns summary records", () => {
    tracker.trackChange(createBaseChange());

    const summaries = tracker.getChangesSummary();

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      relativePath: "example.txt",
      operation: "modify",
      undone: false,
      toolCallId: "tool-123",
    });
  });

  it("returns diff information", async () => {
    readFileMock.mockResolvedValueOnce(new TextEncoder().encode("after"));

    const change = tracker.trackChange(createBaseChange());
    const diff = await tracker.getDiff(change.id);

    expect(diff.previousContent).toBe("before");
    expect(diff.currentContent).toBe("after");
    expect(diff.hasDiff).toBe(true);
  });

  it("returns null currentContent when file is missing", async () => {
    readFileMock.mockRejectedValueOnce(new Error("missing"));

    const change = tracker.trackChange(createBaseChange());
    const diff = await tracker.getDiff(change.id);

    expect(diff.currentContent).toBeNull();
  });

  it("undoes create changes by deleting files", async () => {
    applyEditMock.mockResolvedValueOnce(true);

    const change = tracker.trackChange(
      createBaseChange({
        operation: "create",
        previousContent: null,
        previousContentHash: null,
      })
    );

    const result = await tracker.undoChange(change.id);
    const edit = applyEditMock.mock.calls[0]?.[0] as MockWorkspaceEdit;

    expect(result.success).toBe(true);
    expect(edit.operations[0]).toMatchObject({ type: "deleteFile" });
    expect(tracker.getChange(change.id)?.undone).toBe(true);
  });

  it("undoes delete changes by recreating content", async () => {
    applyEditMock.mockResolvedValueOnce(true);

    const change = tracker.trackChange(
      createBaseChange({
        operation: "delete",
        newContent: null,
        newContentHash: null,
      })
    );

    const result = await tracker.undoChange(change.id);
    const edit = applyEditMock.mock.calls[0]?.[0] as MockWorkspaceEdit;

    expect(result.success).toBe(true);
    expect(edit.operations[0]).toMatchObject({ type: "createFile" });
    expect(edit.operations[1]).toMatchObject({ type: "insert", text: "before" });
  });

  it("undoes modify changes by restoring previous content", async () => {
    applyEditMock.mockResolvedValueOnce(true);
    openTextDocumentMock.mockResolvedValueOnce(createDoc());

    const change = tracker.trackChange(createBaseChange());
    const result = await tracker.undoChange(change.id);
    const edit = applyEditMock.mock.calls[0]?.[0] as MockWorkspaceEdit;

    expect(result.success).toBe(true);
    expect(edit.operations[0]).toMatchObject({ type: "replace", text: "before" });
  });

  it("returns an error when undo change is missing", async () => {
    const result = await tracker.undoChange("missing-id");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Change not found");
  });

  it("returns an error when undo already applied", async () => {
    applyEditMock.mockResolvedValueOnce(true);
    openTextDocumentMock.mockResolvedValueOnce(createDoc());

    const change = tracker.trackChange(createBaseChange());
    await tracker.undoChange(change.id);

    const result = await tracker.undoChange(change.id);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Change already undone");
  });

  it("returns an error when applyEdit fails", async () => {
    applyEditMock.mockResolvedValueOnce(false);
    openTextDocumentMock.mockResolvedValueOnce(createDoc());

    const change = tracker.trackChange(createBaseChange());
    const result = await tracker.undoChange(change.id);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to apply undo edit");
  });

  it("emits change undone events", async () => {
    applyEditMock.mockResolvedValueOnce(true);
    openTextDocumentMock.mockResolvedValueOnce(createDoc());

    const listener = vi.fn();
    tracker.onChangeUndone(listener);

    const change = tracker.trackChange(createBaseChange());
    await tracker.undoChange(change.id);

    expect(listener).toHaveBeenCalledWith(change);
  });

  it("undoes all changes in reverse order", async () => {
    applyEditMock.mockResolvedValue(true);
    openTextDocumentMock.mockResolvedValue(createDoc());

    const first = tracker.trackChange(createBaseChange({ operation: "create" }));
    const second = tracker.trackChange(createBaseChange({ operation: "modify" }));

    const results = await tracker.undoAll();

    expect(results[0].fileChangeId).toBe(second.id);
    expect(results[1].fileChangeId).toBe(first.id);
  });

  it("tracks counts and hasChange", () => {
    tracker.trackChange(createBaseChange({ operation: "create" }));
    tracker.trackChange(createBaseChange({ operation: "modify" }));
    tracker.trackChange(createBaseChange({ operation: "delete" }));

    const counts = tracker.getCounts();

    expect(counts.total).toBe(3);
    expect(counts.created).toBe(1);
    expect(counts.modified).toBe(1);
    expect(counts.deleted).toBe(1);
    expect(counts.undone).toBe(0);
    expect(tracker.hasChange(new MockUri("file:///tmp/example.txt", "file:///tmp/example.txt"))).toBe(true);
  });

  it("exports and imports changes", () => {
    const change = tracker.trackChange(createBaseChange());
    const exported = tracker.exportChanges();

    tracker.clear();
    expect(tracker.getChanges()).toHaveLength(0);

    tracker.importChanges(exported);
    const restored = tracker.getChanges();

    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe(change.id);
  });
});
