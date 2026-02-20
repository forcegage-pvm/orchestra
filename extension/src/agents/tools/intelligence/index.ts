/**
 * Intelligence tools index
 *
 * Barrel exports and registration helper for Dart/Flutter intelligence tools.
 * These tools integrate with dart mcp-server (Dart SDK 3.9+) and the existing
 * DartRunner for test execution.
 *
 * Tools:
 *   dart_analyze        - Static analysis via dart mcp-server
 *   dart_resolve_symbol - Semantic symbol resolution via dart mcp-server
 *   dart_run_tests      - Test execution via dart test / flutter test CLI
 *
 * dart_analyze and dart_resolve_symbol require dart mcp-server (Dart SDK 3.9+)
 * and degrade gracefully when unavailable. dart_run_tests only requires the
 * Dart or Flutter SDK and works independently of dart mcp-server.
 */

import type { ToolRegistry } from "../../ToolRegistry.js";
import { dartAnalyzeTool } from "./dartAnalyze.js";
import { dartResolveSymbolTool } from "./dartResolveSymbol.js";
import { dartRunTestsTool } from "./dartRunTests.js";

/**
 * All intelligence tools available for registration.
 */
export const intelligenceTools = [
  dartAnalyzeTool,
  dartResolveSymbolTool,
  dartRunTestsTool,
] as const;

/**
 * Register all intelligence tools with the given registry.
 * @param registry ToolRegistry instance to register tools with
 */
export function registerIntelligenceTools(registry: ToolRegistry): void {
  registry.registerAll([...intelligenceTools]);
}

// Export individual tools for direct access
export { dartAnalyzeTool, dartResolveSymbolTool, dartRunTestsTool };

// Export DartMcpClient lifecycle functions for extension.ts
export {
  DartMcpClient,
  getGlobalDartMcpClient,
  setGlobalDartMcpClient,
} from "./DartMcpClient.js";

// Export types
export type { DartAnalyzeInput } from "./dartAnalyze.js";
export type { DartMcpCallResult, DartMcpStatus } from "./DartMcpClient.js";
export type { DartResolveSymbolInput } from "./dartResolveSymbol.js";
export type { DartRunTestsInput } from "./dartRunTests.js";
