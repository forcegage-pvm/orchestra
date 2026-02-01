/**
 * Protocol Module Barrel Export
 *
 * Exports all message types and handler functions for the Agent Panel protocol.
 */

export type {
  ExtensionMessage,
  WebviewMessage,
  VerbosityLevel,
  SessionUpdateMessage,
  SessionListMessage,
  EventMessage,
  EventsBatchMessage,
  ClearMessage,
  SetVerbosityMessage,
  LoadSessionMessage,
  ReadyMessage,
  OpenFileMessage,
  OpenDiffMessage,
  CopyTextMessage,
  StopAgentMessage,
  ContinueSessionMessage,
  SwitchSessionMessage,
  ExportSessionMessage,
  SetVerbosityWebviewMessage,
  UserMessageMessage,
} from "./types.js";

export { handleExtensionMessage, initializeMessageHandler } from "./handler.js";
