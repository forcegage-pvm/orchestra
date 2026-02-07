/**
 * Session Event Bus
 *
 * In-memory event bus for real-time session updates using VS Code's
 * EventEmitter pattern.
 *
 * Specification: specs/011-agent-panel-rework/011a-realtime-event-streaming/spec.md
 */

import * as vscode from "vscode";
import type { EventBusPayload } from "./types.js";

/**
 * Debug tag for filtering in DevTools console.
 * Filter with: [ORCH-EVENT] in browser console
 */
const DEBUG_TAG = "[ORCH-EVENT]";

/**
 * Format payload for logging - extracts key identifiers without dumping full content
 */
function formatPayloadForLog(payload: EventBusPayload): string {
  switch (payload.type) {
    case "session_start":
      return `session_start sessionId=${payload.session.id} role=${payload.session.role}`;
    case "session_end":
      return `session_end sessionId=${payload.sessionId} status=${payload.status}`;
    case "session_event": {
      const e = payload.event;
      const base = `${e.type} id=${e.id.slice(0, 8)} session=${e.sessionId.slice(0, 8)} iter=${e.iteration}`;
      // Add event-specific identifiers
      if ("toolName" in e) {
        return `${base} tool=${e.toolName}`;
      }
      if ("code" in e && "severity" in e) {
        return `${base} code=${e.code} severity=${e.severity}`;
      }
      return base;
    }
    default:
      return `unknown payload type`;
  }
}

/**
 * AgentEventBus wraps a VS Code EventEmitter and exposes a typed event stream.
 */
export class AgentEventBus implements vscode.Disposable {
  private readonly _onEvent = new vscode.EventEmitter<EventBusPayload>();

  /**
   * Subscribe to event bus payloads.
   */
  public readonly onEvent: vscode.Event<EventBusPayload> = this._onEvent.event;

  /**
   * Emit an event bus payload.
   * All session events flow through this single point.
   */
  emit(payload: EventBusPayload): void {
    try {
      // Log every event with identifiable tag for DevTools filtering
      console.log(`${DEBUG_TAG} EMIT:`, formatPayloadForLog(payload));
      this._onEvent.fire(payload);
    } catch (error) {
      // Log error with same tag, then re-throw to fail loudly
      console.error(
        `${DEBUG_TAG} ERROR during emit:`,
        formatPayloadForLog(payload),
        error,
      );
      throw error;
    }
  }

  /**
   * Dispose of the underlying EventEmitter.
   */
  dispose(): void {
    console.log(`${DEBUG_TAG} EventBus disposed`);
    this._onEvent.dispose();
  }
}

let agentEventBusInstance: AgentEventBus | undefined;

/**
 * Get the singleton AgentEventBus instance.
 */
export const getAgentEventBus = (): AgentEventBus => {
  if (!agentEventBusInstance) {
    agentEventBusInstance = new AgentEventBus();
  }
  return agentEventBusInstance;
};

/**
 * Dispose the singleton AgentEventBus instance (if created).
 */
export const disposeAgentEventBus = (): void => {
  if (!agentEventBusInstance) {
    return;
  }
  agentEventBusInstance.dispose();
  agentEventBusInstance = undefined;
};
