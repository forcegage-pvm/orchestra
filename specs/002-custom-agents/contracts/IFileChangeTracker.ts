/**
 * File Change Tracker Interface
 * 
 * Tracks file modifications made by agents for undo capability.
 * 
 * @module contracts/IFileChangeTracker
 */

import type { Disposable, Uri } from "vscode";
import type { FileChange, FileOperation } from "./types";

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
  /**
   * Track a file change
   * 
   * @param change - Change details
   */
  trackChange(change: Omit<FileChange, "id" | "undone" | "undoneAt">): FileChange;
  
  /**
   * Get all tracked changes
   */
  getChanges(): FileChange[];
  
  /**
   * Get changes summary for UI
   */
  getChangesSummary(): FileChangeSummary[];
  
  /**
   * Get changes by operation type
   */
  getChangesByOperation(operation: FileOperation): FileChange[];
  
  /**
   * Get change by ID
   */
  getChange(id: string): FileChange | undefined;
  
  /**
   * Get diff for a file change
   */
  getDiff(changeId: string): Promise<FileDiff>;
  
  /**
   * Undo a specific file change
   * 
   * @param id - File change ID
   * @returns Undo result
   */
  undoChange(id: string): Promise<UndoResult>;
  
  /**
   * Undo all changes in reverse order
   * 
   * @returns Array of undo results
   */
  undoAll(): Promise<UndoResult[]>;
  
  /**
   * Check if a file has been modified
   */
  hasChange(uri: Uri): boolean;
  
  /**
   * Get change count by type
   */
  getCounts(): {
    total: number;
    created: number;
    modified: number;
    deleted: number;
    undone: number;
  };
  
  /**
   * Clear all tracked changes
   * Does NOT undo the changes, just clears tracking.
   */
  clear(): void;
  
  /**
   * Subscribe to change events
   */
  onChangeTracked(callback: (change: FileChange) => void): Disposable;
  
  /**
   * Subscribe to undo events
   */
  onChangeUndone(callback: (change: FileChange) => void): Disposable;
  
  /**
   * Export changes for session persistence
   */
  exportChanges(): FileChange[];
  
  /**
   * Import changes from session persistence
   */
  importChanges(changes: FileChange[]): void;
}
