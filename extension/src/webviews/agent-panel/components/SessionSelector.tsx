/**
 * SessionSelector Component
 *
 * Dropdown selector for switching between sessions within a task+role context.
 * Groups sessions by role and emits switch_session messages to the extension.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.2-3.3, T065
 */

import { For } from "solid-js";
import type { AgentSession } from "../../../agents/sessions/types.js";

export interface SessionSelectorProps {
  /** Current session ID being viewed */
  currentSessionId?: string;

  /** Available sessions for this task+role */
  availableSessions?: AgentSession[];

  /** Handler for session change - emits switch_session */
  onSessionChange?: (sessionId: string) => void;
}

/**
 * SessionSelector - Dropdown for switching between sessions
 *
 * Displays current session and allows switching to other sessions
 * within the same task and role context.
 * Emits switch_session message via postMessage when selection changes.
 *
 * @example
 * ```tsx
 * <SessionSelector
 *   currentSessionId="abc123"
 *   availableSessions={[session1, session2, session3]}
 *   onSessionChange={(sessionId) => window.vscode.postMessage({type: 'switch_session', sessionId})}
 * />
 * ```
 */
export function SessionSelector(props: SessionSelectorProps) {
  const handleChange = (event: Event) => {
    const target = event.target as HTMLSelectElement;
    const sessionId = target.value;
    if (sessionId && props.onSessionChange) {
      props.onSessionChange(sessionId);
    }
  };

  const formatSessionLabel = (session: AgentSession) => {
    const date = new Date(session.startedAt);
    const timeStr = date.toLocaleTimeString();
    const statusEmoji = session.status === "completed" ? "✓" : "•";
    return `${statusEmoji} ${timeStr} - ${session.role}`;
  };

  return (
    <div class="flex items-center gap-2">
      <select
        class="bg-gray-800 text-gray-200 text-sm px-2 py-1 rounded border border-gray-700 focus:outline-none focus:border-blue-500 cursor-pointer"
        value={props.currentSessionId ?? ""}
        onChange={handleChange}
        disabled={
          !props.availableSessions || props.availableSessions.length === 0
        }
      >
        <option value="" disabled>
          Select Session
        </option>
        <For each={props.availableSessions}>
          {(session) => (
            <option value={session.sessionId}>
              {formatSessionLabel(session)}
            </option>
          )}
        </For>
      </select>
    </div>
  );
}
