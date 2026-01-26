/**
 * FileChangeTracker - Tracks agent file modifications for undo capability
 *
 * Implements the IFileChangeTracker contract used by the agent system.
 *
 * @module agents/FileChangeTracker
 */

import {
  EventEmitter,
  Position,
  Range,
  Uri,
  WorkspaceEdit,
  workspace,
  type Disposable,
} from "vscode";
import type { FileChange, FileOperation } from "./types.js";

/**
 * File change summary for UI display
 */
export interface FileChangeSummary {
  path: string;
  relativePath: string;
  operation: FileOperation;
  undone: boolean;
  timestamp: string;
  toolCallId: string;
}

/**
 * Diff content for file comparison
 */
export interface FileDiff {
  uri: Uri;
  relativePath: string;
  operation: FileOperation;
  previousContent: string | null;
  currentContent: string | null;
  hasDiff: boolean;
}

/**
 * Undo result
 */
export interface UndoResult {
  success: boolean;
  fileChangeId: string;
  path: string;
  error?: string;
}

/**
 * File Change Tracker - Tracks agent file modifications
 */
export interface IFileChangeTracker {
  trackChange(change: Omit<FileChange, "id" | "undone" | "undoneAt">): FileChange;
  getChanges(): FileChange[];
  getChangesSummary(): FileChangeSummary[];
  getChangesByOperation(operation: FileOperation): FileChange[];
  getChange(id: string): FileChange | undefined;
  getDiff(changeId: string): Promise<FileDiff>;
  undoChange(id: string): Promise<UndoResult>;
  undoAll(): Promise<UndoResult[]>;
  hasChange(uri: Uri): boolean;
  getCounts(): {
    total: number;
    created: number;
    modified: number;
    deleted: number;
    undone: number;
  };
  clear(): void;
  onChangeTracked(callback: (change: FileChange) => void): Disposable;
  onChangeUndone(callback: (change: FileChange) => void): Disposable;
  exportChanges(): FileChange[];
  importChanges(changes: FileChange[]): void;
}

/**
 * FileChangeTracker manages file change tracking and undo operations
 */
export class FileChangeTracker implements IFileChangeTracker {
  private changes: FileChange[] = [];
  private readonly changeTrackedEmitter = new EventEmitter<FileChange>();
  private readonly changeUndoneEmitter = new EventEmitter<FileChange>();

  trackChange(
    change: Omit<FileChange, "id" | "undone" | "undoneAt">
  ): FileChange {
    const trackedChange: FileChange = {
      ...change,
      id: crypto.randomUUID(),
      undone: false,
      undoneAt: null,
    };

    this.changes.push(trackedChange);
    this.changeTrackedEmitter.fire(trackedChange);

    return trackedChange;
  }

  getChanges(): FileChange[] {
    return [...this.changes];
  }

  getChangesSummary(): FileChangeSummary[] {
    return this.changes.map((change) => ({
      path: Uri.parse(change.uri).fsPath,
      relativePath: change.relativePath,
      operation: change.operation,
      undone: change.undone,
      timestamp: change.timestamp,
      toolCallId: change.toolCallId,
    }));
  }

  getChangesByOperation(operation: FileOperation): FileChange[] {
    return this.changes.filter((change) => change.operation === operation);
  }

  getChange(id: string): FileChange | undefined {
    return this.changes.find((change) => change.id === id);
  }

  async getDiff(changeId: string): Promise<FileDiff> {
    const change = this.getChange(changeId);

    if (!change) {
      throw new Error(`File change not found: ${changeId}`);
    }

    const uri = Uri.parse(change.uri);
    let currentContent: string | null = null;

    try {
      const bytes = await workspace.fs.readFile(uri);
      currentContent = new TextDecoder().decode(bytes);
    } catch {
      currentContent = null;
    }

    const previousContent = change.previousContent ?? null;

    return {
      uri,
      relativePath: change.relativePath,
      operation: change.operation,
      previousContent,
      currentContent,
      hasDiff: previousContent !== currentContent,
    };
  }

  async undoChange(id: string): Promise<UndoResult> {
    const change = this.getChange(id);

    if (!change) {
      return {
        success: false,
        fileChangeId: id,
        path: "",
        error: "Change not found",
      };
    }

    if (change.undone) {
      return {
        success: false,
        fileChangeId: change.id,
        path: Uri.parse(change.uri).fsPath,
        error: "Change already undone",
      };
    }

    const uri = Uri.parse(change.uri);
    const edit = new WorkspaceEdit();

    try {
      switch (change.operation) {
        case "create": {
          edit.deleteFile(uri, { ignoreIfNotExists: true });
          break;
        }
        case "delete": {
          edit.createFile(uri, { overwrite: true });
          edit.insert(uri, new Position(0, 0), change.previousContent ?? "");
          break;
        }
        case "modify": {
          const document = await workspace.openTextDocument(uri);
          const endLine = Math.max(document.lineCount - 1, 0);
          const endPosition = document.lineAt(endLine).range.end;
          const fullRange = new Range(new Position(0, 0), endPosition);
          edit.replace(uri, fullRange, change.previousContent ?? "");
          break;
        }
        default: {
          return {
            success: false,
            fileChangeId: change.id,
            path: uri.fsPath,
            error: `Unsupported operation: ${change.operation}`,
          };
        }
      }

      const success = await workspace.applyEdit(edit);

      if (!success) {
        return {
          success: false,
          fileChangeId: change.id,
          path: uri.fsPath,
          error: "Failed to apply undo edit",
        };
      }

      change.undone = true;
      change.undoneAt = new Date().toISOString();
      this.changeUndoneEmitter.fire(change);

      return {
        success: true,
        fileChangeId: change.id,
        path: uri.fsPath,
      };
    } catch (error) {
      return {
        success: false,
        fileChangeId: change.id,
        path: uri.fsPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async undoAll(): Promise<UndoResult[]> {
    const results: UndoResult[] = [];

    for (const change of [...this.changes].reverse()) {
      results.push(await this.undoChange(change.id));
    }

    return results;
  }

  hasChange(uri: Uri): boolean {
    const uriString = uri.toString();
    return this.changes.some((change) => change.uri === uriString);
  }

  getCounts(): {
    total: number;
    created: number;
    modified: number;
    deleted: number;
    undone: number;
  } {
    const total = this.changes.length;
    const created = this.getChangesByOperation("create").length;
    const modified = this.getChangesByOperation("modify").length;
    const deleted = this.getChangesByOperation("delete").length;
    const undone = this.changes.filter((change) => change.undone).length;

    return { total, created, modified, deleted, undone };
  }

  clear(): void {
    this.changes = [];
  }

  onChangeTracked(callback: (change: FileChange) => void): Disposable {
    return this.changeTrackedEmitter.event(callback);
  }

  onChangeUndone(callback: (change: FileChange) => void): Disposable {
    return this.changeUndoneEmitter.event(callback);
  }

  exportChanges(): FileChange[] {
    return this.changes.map((change) => ({ ...change }));
  }

  importChanges(changes: FileChange[]): void {
    this.changes = changes.map((change) => ({ ...change }));
  }
}
