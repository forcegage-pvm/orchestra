/**
 * Global type declarations for Agent Panel webview
 */

import type { WebviewMessage } from "./protocol/types.js";

/**
 * VS Code webview API
 */
interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  interface Window {
    vscode: VsCodeApi;
  }

  /**
   * Acquire VS Code webview API
   * This function is injected by VS Code into the webview context
   */
  function acquireVsCodeApi(): VsCodeApi;
}

export {};
