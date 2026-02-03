/**
 * File Editing Tools Contracts
 * Feature: 010-tool-enhance
 *
 * 6 tools for file editing with fuzzy matching and validation
 */

// ============================================
// Common Types
// ============================================

export type MatchType = "exact" | "whitespace_normalized" | "fuzzy";

export interface MatchResult {
  type: MatchType;
  line_start: number;
  line_end: number;
  similarity: number; // 0.0-1.0
  matched_text: string;
}

// ============================================
// smart_replace
// ============================================

export interface SmartReplaceInput {
  file_path: string;
  old_text: string;
  new_text: string;
  start_line_hint?: number;
  occurrence?: number; // default: 1
  fuzzy_threshold?: number; // default: 0.85
  dry_run?: boolean; // default: false
}

export interface SmartReplaceResult {
  success: boolean;
  file_path: string;
  match_type: MatchType;
  similarity: number;
  lines_changed: {
    start: number;
    end: number;
    count: number;
  };
  diff_preview?: string; // unified diff format
  warning?: string;
}

// ============================================
// edit_lines
// ============================================

export interface EditLinesInput {
  file_path: string;
  start_line: number; // 1-based
  end_line: number; // 1-based, inclusive
  new_content: string;
  preserve_indentation?: boolean; // default: false
  dry_run?: boolean;
}

export interface EditLinesResult {
  success: boolean;
  file_path: string;
  lines_replaced: number;
  new_line_count: number;
  diff_preview?: string;
}

// ============================================
// insert_at_line
// ============================================

export interface InsertAtLineInput {
  file_path: string;
  line: number; // 1-based, insert before this line
  content: string;
  auto_indent?: boolean; // default: true
  dry_run?: boolean;
}

export interface InsertAtLineResult {
  success: boolean;
  file_path: string;
  inserted_at: number;
  lines_inserted: number;
  diff_preview?: string;
}

// ============================================
// delete_section
// ============================================

export interface DeleteSectionInput {
  file_path: string;
  start_line: number;
  end_line: number;
  dry_run?: boolean;
}

export interface DeleteSectionResult {
  success: boolean;
  file_path: string;
  lines_deleted: number;
  deleted_content: string;
  diff_preview?: string;
}

// ============================================
// validate_edit (DD-001: standalone only)
// ============================================

export interface ValidateEditInput {
  file_path: string;
  old_text: string;
  new_text: string;
}

export interface ValidateEditResult {
  success: boolean;
  syntax_valid: boolean;
  match_found: boolean;
  errors: DiagnosticInfo[];
  warnings: DiagnosticInfo[];
  diff_preview?: string;
}

export interface DiagnosticInfo {
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning";
  source?: string;
  fix_suggestion?: string;
}

// ============================================
// bulk_replace (text/regex only, not AST)
// ============================================

export interface BulkReplaceInput {
  pattern: string;
  replacement: string;
  is_regex?: boolean; // default: false
  include_glob?: string; // default: "**/*"
  exclude_glob?: string;
  case_sensitive?: boolean; // default: true
  whole_word?: boolean; // default: false
  max_files?: number;
  max_replacements?: number;
  preview_only?: boolean; // default: false
}

export interface BulkReplaceResult {
  success: boolean;
  files_scanned: number;
  files_modified: number;
  total_replacements: number;
  changes: FileChangeInfo[];
  errors: FileErrorInfo[];
}

export interface FileChangeInfo {
  file_path: string;
  replacements: number;
  preview?: string; // if preview_only
}

export interface FileErrorInfo {
  file_path: string;
  error: string;
}
