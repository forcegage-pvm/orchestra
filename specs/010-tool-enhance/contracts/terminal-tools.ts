/**
 * Terminal Tools Contracts
 * Feature: 010-tool-enhance
 *
 * 9 tools for process management and command execution
 */

// ============================================
// Common Types
// ============================================

export type ProcessStatus =
  | "STARTING"
  | "RUNNING"
  | "READY"
  | "STOPPED"
  | "FAILED";

export interface ProcessInfo {
  process_id: string;
  command: string;
  status: ProcessStatus;
  cwd: string;
  started_at: number;
  pid?: number;
  exit_code?: number;
  ready_pattern?: string;
}

// ============================================
// run_command
// ============================================

export interface RunCommandInput {
  command: string;
  cwd?: string;
  timeout_ms?: number; // default: 30000
  stdin?: string;
  env?: Record<string, string>;
}

export interface RunCommandResult {
  success: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  timed_out: boolean;
  warning?: string; // e.g., "shell integration unavailable"
}

// ============================================
// start_process
// ============================================

export interface StartProcessInput {
  command: string;
  cwd?: string;
  ready_pattern?: string;
  ready_timeout_ms?: number; // default: 30000
  env?: Record<string, string>;
}

export interface StartProcessResult {
  success: boolean;
  process_id: string;
  status: ProcessStatus;
  initial_output: string;
  error?: string;
}

// ============================================
// stop_process
// ============================================

export interface StopProcessInput {
  process_id: string;
  graceful_timeout_ms?: number; // default: 5000
}

export interface StopProcessResult {
  success: boolean;
  process_id: string;
  exit_code: number;
  force_killed: boolean;
}

// ============================================
// get_process_output
// ============================================

export interface GetProcessOutputInput {
  process_id: string;
  since_last_read?: boolean;
  max_lines?: number; // default: 100
  include_ansi?: boolean; // default: false
}

export interface GetProcessOutputResult {
  success: boolean;
  process_id: string;
  status: ProcessStatus;
  output: string;
  truncated: boolean;
  lines_returned: number;
  total_lines: number;
}

// ============================================
// list_processes
// ============================================

export interface ListProcessesInput {
  status_filter?: ProcessStatus[];
  include_completed?: boolean; // default: false
}

export interface ListProcessesResult {
  success: boolean;
  processes: ProcessInfo[];
  count: number;
}

// ============================================
// send_input
// ============================================

export interface SendInputInput {
  process_id: string;
  text: string;
  press_enter?: boolean; // default: true
  special_key?: "ctrl+c" | "ctrl+d" | "ctrl+z";
}

export interface SendInputResult {
  success: boolean;
  process_id: string;
  bytes_sent: number;
  error?: string;
}

// ============================================
// wait_for_pattern
// ============================================

export interface WaitForPatternInput {
  process_id: string;
  pattern: string; // regex
  timeout_ms?: number; // default: 30000
}

export interface WaitForPatternResult {
  success: boolean;
  matched: boolean;
  matched_line?: string;
  wait_time_ms: number;
  timed_out: boolean;
}

// ============================================
// find_port_process
// ============================================

export interface FindPortProcessInput {
  port: number;
}

export interface FindPortProcessResult {
  success: boolean;
  in_use: boolean;
  process_id?: string; // if managed by ProcessManager
  pid?: number;
  command?: string;
}

// ============================================
// execute_with_retry
// ============================================

export interface ExecuteWithRetryInput {
  command: string;
  cwd?: string;
  max_retries?: number; // default: 3
  retry_delay_ms?: number; // default: 1000
  success_exit_codes?: number[]; // default: [0]
  success_pattern?: string; // regex
  timeout_ms?: number;
}

export interface ExecuteWithRetryResult {
  success: boolean;
  attempts: number;
  final_exit_code: number;
  stdout: string;
  stderr: string;
  total_duration_ms: number;
}
