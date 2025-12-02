/**
 * Orchestra VS Code Extension
 *
 * Visual Studio Code extension for Orchestra integration.
 *
 * Phase 3 implementation - not yet started.
 * The vscode module will be available when this is built as an extension.
 */

// Placeholder types for Phase 3 - vscode module will be available in extension context
interface ExtensionContext {
  subscriptions: { dispose(): void }[];
}

export function activate(_context: ExtensionContext): void {
  throw new Error("VS Code Extension not yet implemented - Phase 3");
}

export function deactivate(): void {
  // Cleanup
}
