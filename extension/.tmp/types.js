/**
 * Tool Type System (Zod Schemas + TypeScript Types)
 */
import { z } from "zod";
import { ToolErrorCode } from "./errors.js";
// ============================================================================
// Tool Input Schema
// ============================================================================
/**
 * Schema definition for tool input validation
 * Defines the structure of parameters accepted by an AgentTool
 */
export const ToolInputSchemaSchema = z.object({
    type: z.literal("object"),
    properties: z.record(z.object({
        type: z.string(),
        description: z.string().optional(),
        default: z.unknown().optional(),
        enum: z.array(z.string()).optional(),
    })),
    required: z.array(z.string()).optional(),
});
// ============================================================================
// Tool Result Types
// ============================================================================
/**
 * Enumeration of tool error codes
 */
export const ToolErrorCodeSchema = z.nativeEnum(ToolErrorCode);
/**
 * Schema for structured tool errors
 */
export const ToolErrorSchema = z.object({
    code: ToolErrorCodeSchema,
    message: z.string().min(1),
    suggestion: z.string().optional(),
    details: z.record(z.unknown()).optional(),
});
/**
 * Schema for tool result content items
 */
export const ToolResultContentSchema = z.object({
    type: z.enum(["text", "json", "data", "error"]),
    value: z.string(),
    mimeType: z.string().optional(),
});
/**
 * Schema for tool invocation metadata
 */
export const ToolMetadataSchema = z.object({
    toolName: z.string().min(1),
    callId: z.string().uuid(),
    durationMs: z.number().int().nonnegative(),
    inputHash: z.string().optional(),
    outputTruncated: z.boolean().optional(),
    warnings: z.array(z.string()).optional(),
    retryCount: z.number().int().nonnegative().optional(),
});
/**
 * Signal that a tool can emit to control agent execution
 * - "pause": Agent should pause and wait for user input
 * - "stop": Agent should stop execution completely
 */
export const ToolSignalSchema = z.enum(["pause", "stop"]).optional();
/**
 * Schema for complete tool execution result
 */
export const ToolResultSchema = z.object({
    success: z.boolean(),
    content: z.array(ToolResultContentSchema),
    error: ToolErrorSchema.optional(),
    metadata: ToolMetadataSchema,
    signal: ToolSignalSchema,
});
// ============================================================================
// Terminal Tool Types
// ============================================================================
/**
 * Schema for run_command tool input
 */
export const RunCommandInputSchema = z.object({
    command: z.string().min(1),
    cwd: z.string().optional(),
    timeout_ms: z.number().int().nonnegative().optional(),
    stdin: z.string().optional(),
    env: z.record(z.string()).optional(),
    expect_failure: z.boolean().optional(),
});
/**
 * Schema for start_process tool input
 */
export const StartProcessInputSchema = z.object({
    command: z.string().min(1),
    cwd: z.string().optional(),
    ready_pattern: z.string().optional(),
    ready_timeout_ms: z.number().int().nonnegative().optional(),
    env: z.record(z.string()).optional(),
});
/**
 * Schema for get_process_output tool input
 */
export const GetProcessOutputInputSchema = z.object({
    process_id: z.string().min(1),
    since_last_read: z.boolean().optional(),
    max_lines: z.number().int().positive().optional(),
    include_ansi: z.boolean().optional(),
});
/**
 * Schema for stop_process tool input
 */
export const StopProcessInputSchema = z.object({
    process_id: z.string().min(1),
    graceful_timeout_ms: z.number().int().nonnegative().optional(),
});
/**
 * Schema for send_input tool input
 */
export const SendInputInputSchema = z.object({
    process_id: z.string().min(1),
    text: z.string(),
    press_enter: z.boolean().optional(),
    special_key: z.enum(["ctrl+c", "ctrl+d", "ctrl+z"]).optional(),
});
/**
 * Schema for wait_for_pattern tool input
 */
export const WaitForPatternInputSchema = z.object({
    process_id: z.string().min(1),
    pattern: z.string().min(1),
    timeout_ms: z.number().int().nonnegative().optional(),
});
/**
 * Schema for find_port_process tool input
 */
export const FindPortProcessInputSchema = z.object({
    port: z.number().int().positive(),
});
/**
 * Schema for execute_with_retry tool input
 */
export const ExecuteWithRetryInputSchema = z.object({
    command: z.string().min(1),
    cwd: z.string().optional(),
    max_retries: z.number().int().positive().optional(),
    retry_delay_ms: z.number().int().nonnegative().optional(),
    success_exit_codes: z.array(z.number().int()).optional(),
    success_pattern: z.string().optional(),
    timeout_ms: z.number().int().nonnegative().optional(),
});
// ============================================================================
// File Editing Tool Types
// ============================================================================
/**
 * Schema for smart_replace tool input
 */
export const SmartReplaceInputSchema = z.object({
    file_path: z.string().min(1),
    old_text: z.string(),
    new_text: z.string(),
    start_line_hint: z.number().int().positive().optional(),
    occurrence: z.number().int().positive().optional(),
    fuzzy_threshold: z.number().min(0).max(1).optional(),
    dry_run: z.boolean().optional(),
    /** If true, check for TypeScript/ESLint errors after edit (adds ~500ms delay) */
    validate: z.boolean().optional(),
    /** If true, apply auto-fixes after edit (organize imports, fix lint errors, etc.). Adds ~300ms delay. */
    autofix: z.boolean().optional(),
});
/**
 * Schema for edit_lines tool input
 */
export const EditLinesInputSchema = z.object({
    file_path: z.string().min(1),
    start_line: z.number().int().positive(),
    end_line: z.number().int().positive(),
    new_content: z.string(),
    create_if_missing: z.boolean().optional(),
    preserve_indentation: z.boolean().optional(),
    dry_run: z.boolean().optional(),
    /** If true, check for TypeScript/ESLint errors after edit (adds ~500ms delay) */
    validate: z.boolean().optional(),
    /** If true, apply auto-fixes after edit (organize imports, fix lint errors, etc.). Adds ~300ms delay. */
    autofix: z.boolean().optional(),
});
/**
 * Schema for insert_at_line tool input
 */
export const InsertAtLineInputSchema = z.object({
    file_path: z.string().min(1),
    line: z.number().int().positive(),
    content: z.string(),
    auto_indent: z.boolean().optional(),
    dry_run: z.boolean().optional(),
    /** If true, apply auto-fixes after insertion (organize imports, fix lint errors, etc.). Adds ~300ms delay. */
    autofix: z.boolean().optional(),
});
/**
 * Schema for delete_section tool input
 */
export const DeleteSectionInputSchema = z.object({
    file_path: z.string().min(1),
    start_line: z.number().int().positive(),
    end_line: z.number().int().positive(),
    dry_run: z.boolean().optional(),
    /** If true, apply auto-fixes after deletion (organize imports, fix lint errors, etc.). Adds ~300ms delay. */
    autofix: z.boolean().optional(),
});
/**
 * Schema for validate_edit tool input
 */
export const ValidateEditInputSchema = z.object({
    file_path: z.string().min(1),
    new_content: z.string(),
    timeout_ms: z.number().int().nonnegative().optional(),
});
/**
 * Schema for bulk_replace tool input
 */
export const BulkReplaceInputSchema = z.object({
    pattern: z.string().min(1),
    replacement: z.string(),
    is_regex: z.boolean().optional(),
    include_glob: z.string().optional(),
    exclude_glob: z.string().optional(),
    case_sensitive: z.boolean().optional(),
    whole_word: z.boolean().optional(),
    max_files: z.number().int().positive().optional(),
    max_replacements: z.number().int().positive().optional(),
    preview_only: z.boolean().optional(),
});
// ============================================================================
// Filesystem Tool Types
// ============================================================================
/**
 * Schema for move_file tool input
 */
export const MoveFileInputSchema = z.object({
    source_path: z.string().min(1),
    destination_path: z.string().min(1),
    overwrite: z.boolean().optional(),
});
/**
 * Schema for copy_file tool input
 */
export const CopyFileInputSchema = z.object({
    source_path: z.string().min(1),
    destination_path: z.string().min(1),
    overwrite: z.boolean().optional(),
});
/**
 * Schema for move_directory tool input
 */
export const MoveDirectoryInputSchema = z.object({
    source_path: z.string().min(1),
    destination_path: z.string().min(1),
    overwrite: z.boolean().optional(),
});
