/**
 * Protocol Module Barrel Export
 *
 * Exports all message types and handler functions for the Agent Panel protocol.
 */

export type {
  ClearMessage,
  ContinueSessionMessage,
  CopyTextMessage,
  EventMessage,
  EventsBatchMessage,
  ExportSessionMessage,
  ExtensionMessage,
  LoadSessionMessage,
  OpenDiffMessage,
  OpenFileMessage,
  ReadyMessage,
  SessionListMessage,
  SessionUpdateMessage,
  SetVerbosityMessage,
  SetVerbosityWebviewMessage,
  StopAgentMessage,
  SwitchSessionMessage,
  UserMessageMessage,
  VerbosityLevel,
  WebviewMessage,
} from "./types.js";

export { handleExtensionMessage, initializeMessageHandler } from "./handler.js";
