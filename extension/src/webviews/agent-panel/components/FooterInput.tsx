/**
 * FooterInput Component
 *
 * Interactive input bar at the bottom of the panel for sending messages to the agent.
 * Supports Enter to send, Shift+Enter for newlines, and appropriate disabled states.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 6.5
 */

import { Icon } from "@iconify-icon/solid";
import { createSignal } from "solid-js";
import type { AgentSession } from "../../../agents/sessions/types.js";

export interface FooterInputProps {
  /** Current agent session (null when no active session) */
  session: AgentSession | null;

  /** Callback when user submits a message */
  onSendMessage?: (text: string) => void;
}

/**
 * FooterInput - Text input with Send button for agent interaction
 *
 * Visual layout:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Type a message to continue the session...             [Send →] │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * **Behavior:**
 * - Disabled when no session is active
 * - Enabled during running: Allows injecting messages for next iteration
 * - Enabled when session is paused/completed: Allows continuation
 * - Submit: Injects message into conversation (agent sees it next iteration)
 * - Enter: Send message
 * - Shift+Enter: Insert newline
 *
 * @example
 * ```tsx
 * <FooterInput
 *   session={currentSession()}
 *   onSendMessage={(text) => handleUserMessage(text)}
 * />
 * ```
 */
export function FooterInput(props: FooterInputProps) {
  const [inputText, setInputText] = createSignal("");

  /**
   * Determine if input should be disabled
   */
  const isDisabled = () => {
    if (!props.session) return true; // No session active

    // Disabled when initializing or failed
    const disabledStatuses = ["initializing", "failed"];
    return disabledStatuses.includes(props.session.status);
  };

  /**
   * Check if session is actively running (for placeholder text)
   */
  const isRunning = () => {
    if (!props.session) return false;
    const runningStatuses = ["running", "thinking", "waiting_for_tool"];
    return runningStatuses.includes(props.session.status);
  };

  /**
   * Check if session has stopped and can be continued
   */
  const isStopped = () => {
    if (!props.session) return false;
    const stoppedStatuses = ["completed", "paused", "cancelled"];
    return stoppedStatuses.includes(props.session.status);
  };

  /**
   * Determine if input is enabled for interaction
   */
  const isEnabled = () => {
    if (!props.session) return false;

    // Enabled when session exists and not initializing
    return !isDisabled();
  };

  /**
   * Get placeholder text based on session state
   */
  const placeholderText = () => {
    if (!props.session) return "No active session";
    if (props.session.status === "failed")
      return "Session failed - start a new session";
    if (isRunning()) return "Inject a message to the agent...";
    if (isStopped()) return "Continue the session with a message...";
    return "Type a message...";
  };

  /**
   * Handle send button click
   */
  const handleSend = () => {
    const text = inputText().trim();
    if (!text || isDisabled()) return;

    // Notify parent component
    props.onSendMessage?.(text);

    // Clear input
    setInputText("");
  };

  /**
   * Handle keyboard events
   * - Enter: Send message (if not disabled)
   * - Shift+Enter: Insert newline
   */
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault(); // Prevent newline
      handleSend();
    }
    // Shift+Enter allows default newline behavior
  };

  return (
    <div class="border-t border-gray-700 bg-zinc-900 p-4">
      <div class="flex items-end gap-3">
        {/* Text input area */}
        <textarea
          value={inputText()}
          onInput={(e) => setInputText(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          disabled={isDisabled()}
          placeholder={placeholderText()}
          rows={1}
          class={`flex-1 resize-none rounded-lg px-4 py-3 text-sm bg-gray-800 border ${
            isDisabled()
              ? "border-gray-700 text-gray-500 cursor-not-allowed"
              : "border-gray-600 text-gray-200 focus:border-blue-500 focus:outline-none"
          } placeholder-gray-500 transition-colors`}
          style={{
            "max-height": "120px",
            "min-height": "44px",
          }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={isDisabled() || !inputText().trim()}
          class={`px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
            isDisabled() || !inputText().trim()
              ? "bg-gray-800 text-gray-600 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
          title={isDisabled() ? "Agent is running" : "Send message (Enter)"}
        >
          <span>Send</span>
          <Icon icon="lucide:send" class="w-4 h-4" />
        </button>
      </div>

      {/* Hint text */}
      {isEnabled() && (
        <div class="mt-2 text-xs text-gray-500">
          Press Enter to send, Shift+Enter for new line
        </div>
      )}
    </div>
  );
}
