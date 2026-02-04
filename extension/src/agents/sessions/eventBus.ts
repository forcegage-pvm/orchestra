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
 * AgentEventBus wraps a VS Code EventEmitter and exposes a typed event stream.
 */
export class AgentEventBus implements vscode.Disposable {
  private readonly _onEvent = new vscode.EventEmitter<EventBusPayload>();

  /**
   * Subscribe to event bus payloads.
   */
  public readonly onEvent: vscode.Event<EventBusPayload> =
    this._onEvent.event;

  /**
   * Emit an event bus payload.
   */
  emit(payload: EventBusPayload): void {
    this._onEvent.fire(payload);
  }

  /**
   * Dispose of the underlying EventEmitter.
   */
  dispose(): void {
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
