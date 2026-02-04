/**
 * File Operations Contracts
 * Feature: 010-tool-enhance
 *
 * 3 tools for basic file/directory move and copy operations
 * Note: These do NOT update imports (LSP-dependent, deferred)
 */

// ============================================
// move_file (basic, no import updates)
// ============================================

export interface MoveFileInput {
  source: string;
  destination: string;
  overwrite?: boolean; // default: false
}

export interface MoveFileResult {
  success: boolean;
  source: string;
  destination: string;
  created_directories?: string[]; // parent dirs created
  error?: string;
}

// ============================================
// copy_file
// ============================================

export interface CopyFileInput {
  source: string;
  destination: string;
  overwrite?: boolean; // default: false
}

export interface CopyFileResult {
  success: boolean;
  source: string;
  destination: string;
  created_directories?: string[];
  error?: string;
}

// ============================================
// move_directory
// ============================================

export interface MoveDirectoryInput {
  source: string;
  destination: string;
  overwrite?: boolean; // default: false
}

export interface MoveDirectoryResult {
  success: boolean;
  source: string;
  destination: string;
  files_moved: number;
  directories_moved: number;
  created_directories?: string[];
  error?: string;
}
