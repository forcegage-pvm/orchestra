/**
 * ProgressStats Component
 *
 * Displays session progress metrics: iteration counter, duration,
 * tool call statistics, and file modification count.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.2-3.3, 6.1
 */

export interface ProgressStatsProps {
  /** Current iteration number */
  iteration: number;

  /** Maximum iterations allowed */
  maxIterations: number;

  /** Session duration in milliseconds */
  durationMs: number | undefined;

  /** Total tool calls made */
  toolCallCount: number;

  /** Successful tool calls */
  successfulToolCalls: number;

  /** Failed tool calls */
  failedToolCalls: number;

  /** Array of modified file paths */
  filesModified: string[];
}

/**
 * ProgressStats - Session progress metrics display
 *
 * Shows iteration counter, smart-formatted duration, tool call stats,
 * and files modified count in a compact horizontal layout.
 *
 * Duration formatting:
 * - 0-999ms: "45ms"
 * - 1-60s: "2.3s"
 * - 60s+: "2m 5s"
 *
 * @example
 * ```tsx
 * <ProgressStats
 *   iteration={5}
 *   maxIterations={50}
 *   durationMs={154320}
 *   toolCallCount={12}
 *   successfulToolCalls={11}
 *   failedToolCalls={1}
 *   filesModified={['src/a.ts', 'src/b.ts', 'test/a.test.ts', 'test/b.test.ts']}
 * />
 * // Renders: Iteration 5/50 Duration: 2m 34s Tools: 12 calls (11 ✓ 1 ✗) Files: 4 modified
 * ```
 */
export function ProgressStats(props: ProgressStatsProps) {
  /**
   * Format duration with smart unit scaling
   */
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div class="flex items-center gap-4 text-sm text-gray-400">
      {/* Iteration counter */}
      <span>
        Iteration {props.iteration}/{props.maxIterations}
      </span>

      {/* Duration */}
      {props.durationMs !== undefined && (
        <span>Duration: {formatDuration(props.durationMs)}</span>
      )}

      {/* Tool call statistics */}
      <span>
        Tools: {props.toolCallCount} calls ({props.successfulToolCalls} ✓{" "}
        {props.failedToolCalls} ✗)
      </span>

      {/* Files modified count */}
      <span>Files: {props.filesModified.length} modified</span>
    </div>
  );
}
