/**
 * Test Agent Commands
 *
 * Development-only commands for testing agent functionality.
 * Run from Command Palette when debugging the extension (F5).
 */

import * as vscode from "vscode";
import { ToolRegistry } from "../agents/ToolRegistry.js";
import { editFileTool } from "../agents/tools/coding/editFile.js";
import { listDirectoryTool } from "../agents/tools/coding/listDirectory.js";
import { readFileTool } from "../agents/tools/coding/readFile.js";
import { getAgentRunner } from "../extension.js";
import { getLogger } from "../utils/logger.js";

const logger = getLogger();

/**
 * Find the first available language model and return its ID
 */
async function findAvailableModelId(): Promise<string | null> {
  // Try Claude first (best for coding tasks)
  const claudeModels = await vscode.lm.selectChatModels({ family: "claude" });
  if (claudeModels.length > 0 && claudeModels[0]) {
    return claudeModels[0].id;
  }

  // Try GPT-4
  const gpt4Models = await vscode.lm.selectChatModels({ family: "gpt-4o" });
  if (gpt4Models.length > 0 && gpt4Models[0]) {
    return gpt4Models[0].id;
  }

  // Try any model
  const allModels = await vscode.lm.selectChatModels({});
  if (allModels.length > 0 && allModels[0]) {
    return allModels[0].id;
  }

  return null;
}

/**
 * Format an AgentOutput for display
 */
function formatOutput(output: {
  type: string;
  text?: string;
  toolName?: string;
  toolResult?: string;
  errorMessage?: string;
}): string {
  if (output.text) {
    return output.text.substring(0, 100);
  }
  if (output.toolName) {
    return `Tool: ${output.toolName}`;
  }
  if (output.toolResult) {
    return output.toolResult.substring(0, 100);
  }
  if (output.errorMessage) {
    return `Error: ${output.errorMessage}`;
  }
  return "(no content)";
}

/**
 * Test 1: Basic Agent Invocation
 *
 * Starts an agent with a simple prompt and monitors output.
 * Verifies the agent loop runs and produces output.
 */
export async function testBasicAgentInvocation(): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel(
    "Orchestra Agent Test",
    { log: true },
  );
  outputChannel.show();
  outputChannel.appendLine("=== Test: Basic Agent Invocation ===");
  outputChannel.appendLine("");

  try {
    // First, find an available model
    outputChannel.appendLine("Searching for available models...");
    const modelId = await findAvailableModelId();

    if (!modelId) {
      outputChannel.appendLine("");
      outputChannel.appendLine("❌ TEST FAILED: No language models available.");
      outputChannel.appendLine(
        "   Ensure GitHub Copilot or another LM extension is installed and signed in.",
      );
      vscode.window.showErrorMessage(
        "Agent test failed: No language models available. Install GitHub Copilot.",
      );
      return;
    }

    outputChannel.appendLine(`Found model: ${modelId}`);
    outputChannel.appendLine("");

    const runner = getAgentRunner();

    // Subscribe to outputs
    const outputs: string[] = [];
    const disposable = runner.onOutput((output) => {
      const line = `[${output.type}] ${formatOutput(output)}`;
      outputs.push(line);
      outputChannel.appendLine(line);
    });

    // Subscribe to state changes
    runner.onStateChange((state) => {
      outputChannel.appendLine(
        `[STATE] ${state.status} - iteration ${state.iteration}`,
      );
    });

    outputChannel.appendLine("Starting agent with simple prompt...");
    outputChannel.appendLine("");

    // Start agent with a simple task that should complete quickly
    await runner.start("implementor", {
      prompt:
        "List the files in the current directory and tell me what you see. Use the list_directory tool with path '.'",
      model: modelId,
    });

    // Wait for completion or timeout
    const startTime = Date.now();
    const timeout = 30000; // 30 seconds

    while (runner.getSession()?.status === "running") {
      if (Date.now() - startTime > timeout) {
        outputChannel.appendLine("");
        outputChannel.appendLine("⚠️ TIMEOUT: Agent still running after 30s");
        await runner.stop();
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const session = runner.getSession();
    outputChannel.appendLine("");
    outputChannel.appendLine("=== Results ===");
    outputChannel.appendLine(`Status: ${session?.status}`);
    outputChannel.appendLine(`Iterations: ${session?.currentIteration}`);
    outputChannel.appendLine(`Messages: ${session?.messages.length}`);
    outputChannel.appendLine(`Outputs received: ${outputs.length}`);
    outputChannel.appendLine("");

    if (session?.status === "completed") {
      outputChannel.appendLine("✅ TEST PASSED: Agent completed successfully");
      vscode.window.showInformationMessage(
        "Agent test passed! Check 'Orchestra Agent Test' output for details.",
      );
    } else if (session?.status === "failed") {
      outputChannel.appendLine(
        `❌ TEST FAILED: Agent failed - check output for details`,
      );
      vscode.window.showErrorMessage(
        "Agent test failed. Check output for details.",
      );
    } else {
      outputChannel.appendLine(
        `⚠️ TEST INCONCLUSIVE: Status is ${session?.status}`,
      );
      vscode.window.showWarningMessage(
        `Agent test inconclusive: ${session?.status}`,
      );
    }

    disposable.dispose();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`❌ TEST ERROR: ${message}`);
    logger.error("Test failed", error);
    vscode.window.showErrorMessage(`Agent test error: ${message}`);
  }
}

/**
 * Test 2: Direct Tool Execution
 *
 * Tests tool execution without going through the LLM.
 * Verifies tools are properly registered and functional.
 */
export async function testDirectToolExecution(): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel(
    "Orchestra Tool Test",
    { log: true },
  );
  outputChannel.show();
  outputChannel.appendLine("=== Test: Direct Tool Execution ===");
  outputChannel.appendLine("");

  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

  outputChannel.appendLine(`Workspace: ${workspaceRoot}`);
  outputChannel.appendLine("");

  // Create a minimal registry with test tools
  const registry = new ToolRegistry();
  registry.register(readFileTool);
  registry.register(listDirectoryTool);
  registry.register(editFileTool);

  const testContext = {
    workspaceRoot,
    sessionId: "test-session",
    iteration: 1,
  };

  let passed = 0;
  let failed = 0;

  // Test 1: list_directory
  outputChannel.appendLine("Test 1: list_directory tool");
  try {
    const result = await registry.execute(
      "list_directory",
      { path: "." },
      testContext,
      { timeout: 5000 },
    );
    outputChannel.appendLine(`  Success: ${result.result.success}`);
    if (result.result.success) {
      const entries = result.result.output.split("\n").slice(0, 5);
      outputChannel.appendLine(`  First 5 entries: ${entries.join(", ")}`);
      outputChannel.appendLine("  ✅ PASSED");
      passed++;
    } else {
      outputChannel.appendLine(`  Error: ${result.result.error}`);
      outputChannel.appendLine("  ❌ FAILED");
      failed++;
    }
  } catch (error) {
    outputChannel.appendLine(`  Exception: ${error}`);
    outputChannel.appendLine("  ❌ FAILED");
    failed++;
  }
  outputChannel.appendLine("");

  // Test 2: read_file on package.json
  outputChannel.appendLine("Test 2: read_file tool (package.json)");
  try {
    const result = await registry.execute(
      "read_file",
      { path: "package.json", startLine: 1, endLine: 5 },
      testContext,
      { timeout: 5000 },
    );
    outputChannel.appendLine(`  Success: ${result.result.success}`);
    if (result.result.success) {
      const preview = result.result.output.substring(0, 100);
      outputChannel.appendLine(`  Content preview: ${preview}...`);
      outputChannel.appendLine("  ✅ PASSED");
      passed++;
    } else {
      outputChannel.appendLine(`  Error: ${result.result.error}`);
      outputChannel.appendLine("  ❌ FAILED");
      failed++;
    }
  } catch (error) {
    outputChannel.appendLine(`  Exception: ${error}`);
    outputChannel.appendLine("  ❌ FAILED");
    failed++;
  }
  outputChannel.appendLine("");

  // Test 3: read_file on non-existent file (should fail gracefully)
  outputChannel.appendLine(
    "Test 3: read_file on non-existent file (expected failure)",
  );
  try {
    const result = await registry.execute(
      "read_file",
      { path: "this-file-does-not-exist.xyz" },
      testContext,
      { timeout: 5000 },
    );
    if (!result.result.success) {
      outputChannel.appendLine(`  Expected error: ${result.result.error}`);
      outputChannel.appendLine("  ✅ PASSED (correctly returned error)");
      passed++;
    } else {
      outputChannel.appendLine("  Unexpectedly succeeded");
      outputChannel.appendLine("  ❌ FAILED");
      failed++;
    }
  } catch (error) {
    // Some implementations throw, which is also acceptable
    outputChannel.appendLine(`  Exception (acceptable): ${error}`);
    outputChannel.appendLine("  ✅ PASSED (threw expected error)");
    passed++;
  }
  outputChannel.appendLine("");

  // Summary
  outputChannel.appendLine("=== Summary ===");
  outputChannel.appendLine(`Passed: ${passed}`);
  outputChannel.appendLine(`Failed: ${failed}`);
  outputChannel.appendLine("");

  if (failed === 0) {
    outputChannel.appendLine("✅ ALL TOOL TESTS PASSED");
    vscode.window.showInformationMessage(
      `Tool tests passed! ${passed}/${passed + failed} tests succeeded.`,
    );
  } else {
    outputChannel.appendLine("❌ SOME TOOL TESTS FAILED");
    vscode.window.showErrorMessage(
      `Tool tests: ${passed} passed, ${failed} failed. Check output for details.`,
    );
  }
}

/**
 * Test 3: Model Availability Check
 *
 * Checks if language models are available for agent use.
 */
export async function testModelAvailability(): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel(
    "Orchestra Model Test",
    { log: true },
  );
  outputChannel.show();
  outputChannel.appendLine("=== Test: Model Availability ===");
  outputChannel.appendLine("");

  try {
    // Check for available models
    outputChannel.appendLine("Checking available language models...");
    outputChannel.appendLine("");

    // Try to get models with different family filters
    const families = [
      { vendor: "anthropic", family: "claude" },
      { vendor: "copilot", family: "gpt-4" },
      { vendor: undefined, family: undefined }, // all models
    ];

    for (const filter of families) {
      const filterDesc = filter.vendor
        ? `${filter.vendor}/${filter.family}`
        : "all models";
      outputChannel.appendLine(`Searching for: ${filterDesc}`);

      try {
        const models = await vscode.lm.selectChatModels(
          filter.vendor ? { vendor: filter.vendor, family: filter.family } : {},
        );

        if (models.length > 0) {
          outputChannel.appendLine(`  Found ${models.length} model(s):`);
          for (const model of models.slice(0, 5)) {
            outputChannel.appendLine(`    - ${model.id}`);
          }
          if (models.length > 5) {
            outputChannel.appendLine(`    ... and ${models.length - 5} more`);
          }
        } else {
          outputChannel.appendLine("  No models found");
        }
      } catch (error) {
        outputChannel.appendLine(`  Error: ${error}`);
      }
      outputChannel.appendLine("");
    }

    outputChannel.appendLine("=== Model Check Complete ===");
    outputChannel.appendLine("");
    outputChannel.appendLine(
      "If no models are found, ensure you have GitHub Copilot or another",
    );
    outputChannel.appendLine(
      "language model extension installed and signed in.",
    );

    vscode.window.showInformationMessage(
      "Model availability check complete. See output for details.",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`❌ ERROR: ${message}`);
    vscode.window.showErrorMessage(`Model check error: ${message}`);
  }
}

/**
 * Register all test commands
 */
export function registerTestCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "orchestra.testBasicAgent",
      testBasicAgentInvocation,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "orchestra.testDirectTools",
      testDirectToolExecution,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "orchestra.testModelAvailability",
      testModelAvailability,
    ),
  );

  logger.info("Test commands registered");
}
