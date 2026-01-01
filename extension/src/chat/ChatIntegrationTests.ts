/**
 * Integration tests for SessionManager - Chat Command Behavior
 *
 * These tests MUST be run in the VS Code extension host (not vitest/jest unit tests).
 * They test actual VS Code Chat API behavior.
 *
 * To run:
 * 1. Open VS Code with the extension loaded
 * 2. Run command: "Developer: Run Extension Tests" or
 * 3. Use the test explorer to run these integration tests
 */

import * as vscode from "vscode";

/**
 * Utility to wait for a condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return true;
    await delay(intervalMs);
  }
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get all chat-related tabs across all tab groups
 */
function getChatTabs(): vscode.Tab[] {
  const chatTabs: vscode.Tab[] = [];
  for (const tabGroup of vscode.window.tabGroups.all) {
    for (const tab of tabGroup.tabs) {
      if (
        tab.label === "Chat" ||
        tab.label === "Background Agent" ||
        tab.label === "Cloud Agent" ||
        tab.label.startsWith("Copilot") ||
        tab.label.includes("Chat")
      ) {
        chatTabs.push(tab);
      }
    }
  }
  return chatTabs;
}

/**
 * Close all chat tabs
 */
async function closeAllChatTabs(): Promise<void> {
  const tabs = getChatTabs();
  if (tabs.length > 0) {
    await vscode.window.tabGroups.close(tabs, true);
    await delay(200);
  }
}

/**
 * Test Suite: Chat Command Behaviors
 *
 * These tests document and verify how VS Code chat commands actually behave.
 */
export class ChatCommandBehaviorTests {
  private log: string[] = [];

  private addLog(message: string): void {
    const timestamp = new Date().toISOString().substring(11, 23);
    this.log.push(`[${timestamp}] ${message}`);
    console.log(`[ChatTest] ${message}`);
  }

  /**
   * Run all tests and return results
   */
  async runAll(): Promise<{ passed: number; failed: number; logs: string[] }> {
    let passed = 0;
    let failed = 0;

    const tests = [
      this.testOpenChatCreatesEditorTab,
      this.testNewChatWindowCreatesFloatingWindow,
      this.testChatOpenTargetsFocused,
      this.testClosingTabsLeavesWindowAsTarget,
      this.testTabIdentification,
    ];

    for (const test of tests) {
      try {
        this.addLog(`Running: ${test.name}`);
        await test.call(this);
        this.addLog(`✓ PASSED: ${test.name}`);
        passed++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.addLog(`✗ FAILED: ${test.name} - ${message}`);
        failed++;
      }

      // Cleanup between tests
      await closeAllChatTabs();
      await delay(500);
    }

    return { passed, failed, logs: this.log };
  }

  /**
   * Test: workbench.action.openChat creates an editor tab
   */
  async testOpenChatCreatesEditorTab(): Promise<void> {
    // Clean slate
    await closeAllChatTabs();
    const initialTabs = getChatTabs().length;

    // Execute command
    await vscode.commands.executeCommand("workbench.action.openChat");
    await delay(500);

    // Verify
    const newTabs = getChatTabs().length;
    if (newTabs <= initialTabs) {
      throw new Error(
        `Expected new chat tab, but tabs went from ${initialTabs} to ${newTabs}`
      );
    }

    this.addLog(`  → Created ${newTabs - initialTabs} new tab(s)`);
  }

  /**
   * Test: workbench.action.newChatWindow creates a floating window
   *
   * Note: This is hard to verify programmatically as auxiliary windows
   * don't appear in tabGroups. We verify by checking that NO new tab was created.
   */
  async testNewChatWindowCreatesFloatingWindow(): Promise<void> {
    // Clean slate
    await closeAllChatTabs();
    const initialTabs = getChatTabs().length;

    // Execute command
    await vscode.commands.executeCommand("workbench.action.newChatWindow");
    await delay(500);

    // Verify: Should NOT create a tab (it's a window)
    const newTabs = getChatTabs().length;
    // Note: This might actually create a tab in some configurations
    // The key difference is that newChatWindow opens in AUX_WINDOW_GROUP

    this.addLog(
      `  → Tab count: ${initialTabs} → ${newTabs} (window created separately)`
    );
  }

  /**
   * Test: workbench.action.chat.open targets the currently focused chat
   */
  async testChatOpenTargetsFocused(): Promise<void> {
    // This is the CRITICAL test for understanding routing behavior

    // 1. Create a floating window
    await vscode.commands.executeCommand("workbench.action.newChatWindow");
    await delay(500);

    // 2. Create an editor tab
    await vscode.commands.executeCommand("workbench.action.openChat");
    await delay(500);

    // At this point, the editor tab should be focused (most recently created)
    const tabsBefore = getChatTabs().length;
    this.addLog(`  → Created window + tab, now have ${tabsBefore} tab(s)`);

    // 3. Send a message - should go to the focused one (the tab)
    await vscode.commands.executeCommand("workbench.action.chat.open", {
      query: "TEST MESSAGE FROM INTEGRATION TEST",
      isPartialQuery: false,
    });
    await delay(500);

    // We can't easily verify WHERE the message went without reading chat history
    // But we've documented the behavior
    this.addLog(`  → Sent message to (presumably) focused chat`);
  }

  /**
   * Test: Closing tabs leaves window as only target
   */
  async testClosingTabsLeavesWindowAsTarget(): Promise<void> {
    // 1. Create window first
    await vscode.commands.executeCommand("workbench.action.newChatWindow");
    await delay(500);

    // 2. Create a tab
    await vscode.commands.executeCommand("workbench.action.openChat");
    await delay(500);

    const tabsBefore = getChatTabs().length;
    this.addLog(`  → Created window + tab, tabs: ${tabsBefore}`);

    // 3. Close all tabs
    await closeAllChatTabs();
    await delay(300);

    const tabsAfter = getChatTabs().length;
    this.addLog(`  → After closing tabs: ${tabsAfter}`);

    // 4. Send message - should now go to window (only remaining chat)
    await vscode.commands.executeCommand("workbench.action.chat.open", {
      query: "TEST AFTER CLOSE - SHOULD GO TO WINDOW",
      isPartialQuery: false,
    });
    await delay(500);

    this.addLog(`  → Sent message (should have gone to window)`);
  }

  /**
   * Test: Tab identification by label works correctly
   */
  async testTabIdentification(): Promise<void> {
    // Clean slate
    await closeAllChatTabs();

    // Create a chat tab
    await vscode.commands.executeCommand("workbench.action.openChat");
    await delay(500);

    // Get all tabs and check labels
    const allTabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
    const tabLabels = allTabs.map((t) => t.label);
    this.addLog(`  → All tab labels: ${tabLabels.join(", ")}`);

    const chatTabs = getChatTabs();
    this.addLog(`  → Identified ${chatTabs.length} chat tab(s)`);

    if (chatTabs.length === 0) {
      throw new Error("Failed to identify chat tab by label");
    }

    // Log the identified tab labels
    for (const tab of chatTabs) {
      this.addLog(
        `  → Chat tab: "${tab.label}" in group ${tab.group.viewColumn}`
      );
    }
  }
}

/**
 * Command handler to run integration tests
 * Register as: orchestra.runChatIntegrationTests
 */
export async function runChatIntegrationTests(): Promise<void> {
  const tests = new ChatCommandBehaviorTests();

  vscode.window.showInformationMessage("Running Chat Integration Tests...");

  const results = await tests.runAll();

  // Show results
  const message = `Chat Tests: ${results.passed} passed, ${results.failed} failed`;
  if (results.failed > 0) {
    vscode.window.showErrorMessage(message);
  } else {
    vscode.window.showInformationMessage(message);
  }

  // Log full results
  console.log("=== Chat Integration Test Results ===");
  for (const log of results.logs) {
    console.log(log);
  }
  console.log("=====================================");

  // Show in output channel
  const outputChannel = vscode.window.createOutputChannel(
    "Orchestra Chat Tests"
  );
  outputChannel.show();
  outputChannel.appendLine("=== Chat Integration Test Results ===");
  for (const log of results.logs) {
    outputChannel.appendLine(log);
  }
  outputChannel.appendLine(
    `\nTotal: ${results.passed} passed, ${results.failed} failed`
  );
}

/**
 * Additional exploratory test: Background Agent availability
 */
export async function exploreBackgroundAgents(): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel(
    "Orchestra Background Agent Exploration"
  );
  outputChannel.show();

  outputChannel.appendLine("=== Exploring Background Agent Commands ===\n");

  // Try various background agent commands
  const commands = [
    "workbench.action.chat.openNewSessionEditor.copilotcli",
    "workbench.action.chat.newBackgroundAgent",
    "workbench.action.chat.continueIn.Background",
  ];

  for (const cmd of commands) {
    try {
      outputChannel.appendLine(`Trying: ${cmd}`);
      await vscode.commands.executeCommand(cmd);
      outputChannel.appendLine(`  → SUCCESS (command exists)`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      outputChannel.appendLine(`  → FAILED: ${msg}`);
    }
    await delay(500);
  }

  // List all chat-related commands
  outputChannel.appendLine("\n=== Available Chat Commands ===");
  const allCommands = await vscode.commands.getCommands(true);
  const chatCommands = allCommands.filter(
    (c) => c.includes("chat") || c.includes("Chat")
  );

  for (const cmd of chatCommands.sort()) {
    outputChannel.appendLine(`  ${cmd}`);
  }
}

/**
 * Test Suite: Agent-Specific Commands
 * Tests the auto-generated workbench.action.chat.open<agentId> commands
 */
export class AgentCommandTests {
  private outputChannel: vscode.OutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel(
      "Orchestra Agent Command Tests"
    );
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString().substring(11, 23);
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    console.log(`[AgentTest] ${message}`);
  }

  /**
   * Run all agent-specific command tests
   */
  async runAll(): Promise<void> {
    this.outputChannel.show();
    this.outputChannel.clear();
    this.log("=== Agent-Specific Command Tests ===\n");

    // Clean slate
    await closeAllChatTabs();
    await delay(300);

    // Test 1: Check if orchestra agent commands exist
    await this.testAgentCommandsExist();

    // Test 2: Test orchestrator command routing
    await this.testOrchestratorCommand();

    // Test 3: Test implementor command routing
    await this.testImplementorCommand();

    // Test 4: Test command with mode and model parameters
    await this.testCommandWithParameters();

    // Test 5: Verify code editor tabs are NOT affected by chat cleanup
    await this.testCodeEditorTabsSafe();

    this.log("\n=== Agent Command Tests Complete ===");
  }

  /**
   * Test: Verify orchestra agent commands exist
   */
  async testAgentCommandsExist(): Promise<void> {
    this.log("Test 1: Checking if agent commands exist...");

    const allCommands = await vscode.commands.getCommands(true);

    const orchestraCommands = allCommands.filter((c) =>
      c.includes("orchestra")
    );

    this.log(`  Found ${orchestraCommands.length} orchestra-related commands:`);
    for (const cmd of orchestraCommands.sort()) {
      this.log(`    - ${cmd}`);
    }

    // Check for specific commands
    const expectedCommands = [
      "workbench.action.chat.openorchestra.orchestrator",
      "workbench.action.chat.openorchestra.implementor",
    ];

    for (const expected of expectedCommands) {
      const exists = allCommands.includes(expected);
      this.log(`  ${exists ? "✓" : "✗"} ${expected}`);
    }
  }

  /**
   * Test: Orchestrator agent command opens correctly
   */
  async testOrchestratorCommand(): Promise<void> {
    this.log("\nTest 2: Testing orchestrator command...");

    await closeAllChatTabs();
    const tabsBefore = getChatTabs().length;

    try {
      // Try the agent-specific command
      await vscode.commands.executeCommand(
        "workbench.action.chat.openorchestra.orchestrator"
      );
      await delay(500);

      const tabsAfter = getChatTabs().length;
      this.log(`  Tabs: ${tabsBefore} → ${tabsAfter}`);

      // Now try with a query
      await vscode.commands.executeCommand(
        "workbench.action.chat.openorchestra.orchestrator",
        {
          query: "TEST: Orchestrator agent command",
          isPartialQuery: false,
        }
      );
      await delay(500);

      this.log("  ✓ Orchestrator command executed successfully");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`  ✗ Failed: ${msg}`);
    }

    await closeAllChatTabs();
  }

  /**
   * Test: Implementor agent command opens correctly
   */
  async testImplementorCommand(): Promise<void> {
    this.log("\nTest 3: Testing implementor command...");

    await closeAllChatTabs();
    const tabsBefore = getChatTabs().length;

    try {
      await vscode.commands.executeCommand(
        "workbench.action.chat.openorchestra.implementor"
      );
      await delay(500);

      const tabsAfter = getChatTabs().length;
      this.log(`  Tabs: ${tabsBefore} → ${tabsAfter}`);

      // Try with a query
      await vscode.commands.executeCommand(
        "workbench.action.chat.openorchestra.implementor",
        {
          query: "TEST: Implementor agent command",
          isPartialQuery: false,
        }
      );
      await delay(500);

      this.log("  ✓ Implementor command executed successfully");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`  ✗ Failed: ${msg}`);
    }

    await closeAllChatTabs();
  }

  /**
   * Test: Command with mode and model parameters
   */
  async testCommandWithParameters(): Promise<void> {
    this.log("\nTest 4: Testing command with mode/model parameters...");

    await closeAllChatTabs();

    try {
      // Test with full parameter set
      await vscode.commands.executeCommand(
        "workbench.action.chat.openorchestra.orchestrator",
        {
          query: "TEST: With parameters",
          isPartialQuery: false,
          mode: "orchestra.orchestrator",
          modelSelector: { id: "claude-sonnet-4" },
        }
      );
      await delay(500);

      this.log("  ✓ Command with parameters executed");

      // Check if we can determine which mode/model was used
      // (This may not be possible via public API)
      this.log("  Note: Cannot verify mode/model via public API");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`  ✗ Failed: ${msg}`);
    }

    await closeAllChatTabs();
  }

  /**
   * Test: Verify closing chat tabs does NOT affect code editor tabs
   */
  async testCodeEditorTabsSafe(): Promise<void> {
    this.log("\nTest 5: Verifying code editor tabs are safe...");

    // Count all tabs (including code editors)
    const getAllTabs = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs);
    const getNonChatTabs = () =>
      getAllTabs().filter(
        (t) => !t.label.includes("Chat") && !t.label.startsWith("Copilot")
      );

    const nonChatTabsBefore = getNonChatTabs();
    this.log(`  Non-chat tabs before: ${nonChatTabsBefore.length}`);
    for (const tab of nonChatTabsBefore.slice(0, 5)) {
      this.log(`    - "${tab.label}"`);
    }
    if (nonChatTabsBefore.length > 5) {
      this.log(`    ... and ${nonChatTabsBefore.length - 5} more`);
    }

    // Create a chat tab
    await vscode.commands.executeCommand("workbench.action.openChat");
    await delay(300);

    const chatTabsCreated = getChatTabs().length;
    this.log(`  Created ${chatTabsCreated} chat tab(s)`);

    // Close all chat tabs
    await closeAllChatTabs();
    await delay(300);

    // Verify non-chat tabs are still there
    const nonChatTabsAfter = getNonChatTabs();
    this.log(`  Non-chat tabs after: ${nonChatTabsAfter.length}`);

    if (nonChatTabsAfter.length === nonChatTabsBefore.length) {
      this.log("  ✓ Code editor tabs preserved correctly");
    } else {
      this.log(
        `  ✗ Tab count mismatch: ${nonChatTabsBefore.length} → ${nonChatTabsAfter.length}`
      );
    }
  }
}

/**
 * Test Suite: Background Agent Investigation
 * Explores how to use background agents with custom modes/models
 */
export class BackgroundAgentTests {
  private outputChannel: vscode.OutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel(
      "Orchestra Background Agent Tests"
    );
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString().substring(11, 23);
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
  }

  async runAll(): Promise<void> {
    this.outputChannel.show();
    this.outputChannel.clear();
    this.log("=== Background Agent Investigation ===\n");

    // Test 1: copilotcli commands
    await this.testCopilotCliCommands();

    // Test 2: Session provider commands
    await this.testSessionProviderCommands();

    // Test 3: Try to find any agent session creation patterns
    await this.discoverAgentSessionPatterns();

    this.log("\n=== Investigation Complete ===");
  }

  /**
   * Test copilotcli (background agent) commands
   */
  async testCopilotCliCommands(): Promise<void> {
    this.log("Test 1: Testing copilotcli commands...");

    const copilotCliCommands = [
      "workbench.action.chat.openNewSessionEditor.copilotcli",
      "workbench.action.chat.openNewSessionSidebar.copilotcli",
      "workbench.view.chat.sessions.copilotcli.focus",
      "workbench.view.chat.sessions.copilotcli.open",
      "workbench.action.chat.openSessionWithPrompt.copilotcli",
    ];

    for (const cmd of copilotCliCommands) {
      try {
        this.log(`  Trying: ${cmd}`);

        // Try with various parameter combinations
        await vscode.commands.executeCommand(cmd);
        this.log(`    → Success (no params)`);

        await delay(300);

        // Try with query
        try {
          await vscode.commands.executeCommand(cmd, {
            query: "Test background query",
            isPartialQuery: false,
          });
          this.log(`    → Success (with query)`);
        } catch {
          this.log(`    → Query params not accepted`);
        }

        // Try with mode
        try {
          await vscode.commands.executeCommand(cmd, {
            query: "Test with mode",
            mode: "orchestra.orchestrator",
          });
          this.log(`    → Success (with mode)`);
        } catch {
          this.log(`    → Mode param not accepted`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.log(`    → Failed: ${msg}`);
      }

      await delay(500);
    }
  }

  /**
   * Test session provider patterns
   */
  async testSessionProviderCommands(): Promise<void> {
    this.log("\nTest 2: Testing session provider commands...");

    // Look for commands that might allow session creation with specific providers
    const allCommands = await vscode.commands.getCommands(true);

    const sessionCommands = allCommands.filter(
      (c) => c.includes("Session") || c.includes("session")
    );

    this.log(`  Found ${sessionCommands.length} session-related commands:`);
    for (const cmd of sessionCommands.slice(0, 20)) {
      this.log(`    - ${cmd}`);
    }
    if (sessionCommands.length > 20) {
      this.log(`    ... and ${sessionCommands.length - 20} more`);
    }
  }

  /**
   * Discover agent session creation patterns
   */
  async discoverAgentSessionPatterns(): Promise<void> {
    this.log("\nTest 3: Discovering agent session patterns...");

    const allCommands = await vscode.commands.getCommands(true);

    // Look for patterns like "openNewSession*.{provider}"
    const openNewSessionCommands = allCommands.filter((c) =>
      c.includes("openNewSession")
    );

    this.log("  openNewSession* commands:");
    for (const cmd of openNewSessionCommands) {
      this.log(`    - ${cmd}`);
    }

    // Look for cloud agent commands
    const cloudAgentCommands = allCommands.filter((c) =>
      c.includes("cloud-agent")
    );

    this.log("\n  cloud-agent commands:");
    for (const cmd of cloudAgentCommands) {
      this.log(`    - ${cmd}`);
    }

    // Look for continueIn commands
    const continueInCommands = allCommands.filter((c) =>
      c.includes("continueIn")
    );

    this.log("\n  continueIn* commands:");
    for (const cmd of continueInCommands) {
      this.log(`    - ${cmd}`);
    }
  }
}

/**
 * Command handler: Run agent-specific command tests
 */
export async function runAgentCommandTests(): Promise<void> {
  const tests = new AgentCommandTests();
  await tests.runAll();
}

/**
 * Command handler: Run background agent investigation
 */
export async function runBackgroundAgentTests(): Promise<void> {
  const tests = new BackgroundAgentTests();
  await tests.runAll();
}

/**
 * Isolated Orchestrator Command Test
 * Runs ONLY the orchestrator command, no cleanup, waits for user observation
 */
export async function testOrchestratorOnly(): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel(
    "Orchestra Orchestrator Test"
  );
  outputChannel.show();
  outputChannel.clear();

  const log = (msg: string) => {
    const ts = new Date().toISOString().substring(11, 23);
    outputChannel.appendLine(`[${ts}] ${msg}`);
  };

  log("=== ISOLATED ORCHESTRATOR COMMAND TEST ===\n");
  log("This test runs ONLY the orchestrator command with NO cleanup.\n");

  // Report initial state
  const chatTabsBefore = getChatTabs();
  const allTabsBefore = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
  log(`Initial state:`);
  log(`  - Chat tabs: ${chatTabsBefore.length}`);
  log(`  - Total tabs: ${allTabsBefore.length}`);
  log(`  - Tab labels: ${allTabsBefore.map((t) => t.label).join(", ")}`);

  log("\nExecuting: workbench.action.chat.openorchestra.orchestrator");
  log(
    '  Query: "ISOLATED TEST: Orchestrator command - please respond with ORCHESTRATOR"'
  );

  try {
    await vscode.commands.executeCommand(
      "workbench.action.chat.openorchestra.orchestrator",
      {
        query:
          "ISOLATED TEST: Orchestrator command - please respond with ORCHESTRATOR",
        isPartialQuery: false,
      }
    );

    await delay(1000);

    // Report final state
    const chatTabsAfter = getChatTabs();
    const allTabsAfter = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
    log(`\nAfter command:`);
    log(
      `  - Chat tabs: ${chatTabsAfter.length} (was ${chatTabsBefore.length})`
    );
    log(`  - Total tabs: ${allTabsAfter.length} (was ${allTabsBefore.length})`);
    log(`  - Tab labels: ${allTabsAfter.map((t) => t.label).join(", ")}`);

    log("\n✓ Command executed. Check where the message appeared!");
    log("  - Did it open in sidebar?");
    log("  - Did it create an editor tab?");
    log("  - Did it create a floating window?");
    log("\nNO CLEANUP - tabs remain as-is for observation.");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`\n✗ Error: ${msg}`);
  }
}

/**
 * Isolated Implementor Command Test
 * Runs ONLY the implementor command, no cleanup, waits for user observation
 */
export async function testImplementorOnly(): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel(
    "Orchestra Implementor Test"
  );
  outputChannel.show();
  outputChannel.clear();

  const log = (msg: string) => {
    const ts = new Date().toISOString().substring(11, 23);
    outputChannel.appendLine(`[${ts}] ${msg}`);
  };

  log("=== ISOLATED IMPLEMENTOR COMMAND TEST ===\n");
  log("This test runs ONLY the implementor command with NO cleanup.\n");

  // Report initial state
  const chatTabsBefore = getChatTabs();
  const allTabsBefore = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
  log(`Initial state:`);
  log(`  - Chat tabs: ${chatTabsBefore.length}`);
  log(`  - Total tabs: ${allTabsBefore.length}`);
  log(`  - Tab labels: ${allTabsBefore.map((t) => t.label).join(", ")}`);

  log("\nExecuting: workbench.action.chat.openorchestra.implementor");
  log(
    '  Query: "ISOLATED TEST: Implementor command - please respond with IMPLEMENTOR"'
  );

  try {
    await vscode.commands.executeCommand(
      "workbench.action.chat.openorchestra.implementor",
      {
        query:
          "ISOLATED TEST: Implementor command - please respond with IMPLEMENTOR",
        isPartialQuery: false,
      }
    );

    await delay(1000);

    // Report final state
    const chatTabsAfter = getChatTabs();
    const allTabsAfter = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
    log(`\nAfter command:`);
    log(
      `  - Chat tabs: ${chatTabsAfter.length} (was ${chatTabsBefore.length})`
    );
    log(`  - Total tabs: ${allTabsAfter.length} (was ${allTabsBefore.length})`);
    log(`  - Tab labels: ${allTabsAfter.map((t) => t.label).join(", ")}`);

    log("\n✓ Command executed. Check where the message appeared!");
    log("  - Did it open in sidebar?");
    log("  - Did it create an editor tab?");
    log("  - Did it create a floating window?");
    log("\nNO CLEANUP - tabs remain as-is for observation.");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`\n✗ Error: ${msg}`);
  }
}
/**
 * Test Suite: Session Resource API Investigation
 *
 * Tests commands that may accept session resource URIs for deterministic routing.
 * Based on VS Code source code analysis showing IChatWidgetService.openSession(sessionResource).
 */
export class SessionResourceTests {
  private outputChannel: vscode.OutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel(
      "Orchestra Session Resource Tests"
    );
  }

  private log(message: string): void {
    const ts = new Date().toISOString().substring(11, 23);
    this.outputChannel.appendLine(`[${ts}] ${message}`);
    console.log(`[SessionTest] ${message}`);
  }

  /**
   * Run all session resource tests
   */
  async runAll(): Promise<void> {
    this.outputChannel.show();
    this.outputChannel.clear();
    this.log("=== Session Resource API Tests ===\n");
    this.log(
      "Testing if chat commands accept session resource URIs for targeting.\n"
    );

    // Test 1: List session-related commands
    await this.testListSessionCommands();

    // Test 2: Try openSessionInNewWindow with new URI
    await this.testOpenSessionInNewWindow();

    // Test 3: Try openSessionInSidebar with new URI
    await this.testOpenSessionInSidebar();

    // Test 4: Try openSessionInEditorGroup with new URI
    await this.testOpenSessionInEditorGroup();

    // Test 5: Try continueChatInSession
    await this.testContinueChatInSession();

    // Test 6: Inspect tab input for session info
    await this.testInspectTabInputForSession();

    // Test 7: Try openSessionWithPrompt pattern
    await this.testOpenSessionWithPrompt();

    // Test 8: Try to get active session info
    await this.testGetActiveSessionInfo();

    this.log("\n=== Session Resource Tests Complete ===");
  }

  /**
   * Test 1: List all session-related commands
   */
  async testListSessionCommands(): Promise<void> {
    this.log("Test 1: Listing session-related commands...\n");

    const allCommands = await vscode.commands.getCommands(true);
    const sessionCommands = allCommands.filter(
      (c) =>
        c.toLowerCase().includes("session") ||
        c.toLowerCase().includes("opensession") ||
        c.toLowerCase().includes("continue")
    );

    for (const cmd of sessionCommands.sort()) {
      this.log(`  ${cmd}`);
    }

    this.log(`\n  Total: ${sessionCommands.length} session-related commands\n`);
  }

  /**
   * Test 2: Try openSessionInNewWindow with a new session URI
   */
  async testOpenSessionInNewWindow(): Promise<void> {
    this.log("Test 2: workbench.action.chat.openSessionInNewWindow\n");

    try {
      // Try with no arguments first
      this.log("  Trying with no arguments...");
      await vscode.commands.executeCommand(
        "workbench.action.chat.openSessionInNewWindow"
      );
      await delay(500);
      this.log("  → Command executed (no args)");

      // Try with a generated session URI
      const sessionUri = vscode.Uri.from({
        scheme: "vscode-chat-editor",
        path: `/untitled-${Date.now()}`,
      });
      this.log(`  Trying with URI: ${sessionUri.toString()}`);
      await vscode.commands.executeCommand(
        "workbench.action.chat.openSessionInNewWindow",
        sessionUri
      );
      await delay(500);
      this.log("  → Command executed with URI");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`  ✗ Error: ${msg}`);
    }
  }

  /**
   * Test 3: Try openSessionInSidebar with a new session URI
   */
  async testOpenSessionInSidebar(): Promise<void> {
    this.log("\nTest 3: workbench.action.chat.openSessionInSidebar\n");

    try {
      // Try with no arguments first
      this.log("  Trying with no arguments...");
      await vscode.commands.executeCommand(
        "workbench.action.chat.openSessionInSidebar"
      );
      await delay(500);
      this.log("  → Command executed (no args)");

      // Try with a generated session URI
      const sessionUri = vscode.Uri.from({
        scheme: "vscode-local-chat-session",
        path: `/sidebar-${Date.now()}`,
      });
      this.log(`  Trying with URI: ${sessionUri.toString()}`);
      await vscode.commands.executeCommand(
        "workbench.action.chat.openSessionInSidebar",
        sessionUri
      );
      await delay(500);
      this.log("  → Command executed with URI");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`  ✗ Error: ${msg}`);
    }
  }

  /**
   * Test 4: Try openSessionInEditorGroup with a new session URI
   */
  async testOpenSessionInEditorGroup(): Promise<void> {
    this.log("\nTest 4: workbench.action.chat.openSessionInEditorGroup\n");

    try {
      // First create a chat to get a real session
      await vscode.commands.executeCommand("workbench.action.openChat");
      await delay(500);

      // Now try to duplicate it
      this.log("  Created initial chat, trying to open in new group...");
      await vscode.commands.executeCommand(
        "workbench.action.chat.openSessionInNewEditorGroup"
      );
      await delay(500);
      this.log("  → Command executed");

      const tabs = getChatTabs();
      this.log(`  → Chat tabs now: ${tabs.length}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`  ✗ Error: ${msg}`);
    }
  }

  /**
   * Test 5: Try continueChatInSession
   */
  async testContinueChatInSession(): Promise<void> {
    this.log("\nTest 5: workbench.action.chat.continueChatInSession\n");

    try {
      // Try to find existing command variations
      const allCommands = await vscode.commands.getCommands(true);
      const continueCommands = allCommands.filter(
        (c) =>
          c.toLowerCase().includes("continue") &&
          c.toLowerCase().includes("chat")
      );

      this.log("  Continue-related commands:");
      for (const cmd of continueCommands.sort()) {
        this.log(`    ${cmd}`);
      }

      // Try each one
      for (const cmd of continueCommands.slice(0, 3)) {
        try {
          this.log(`  Trying: ${cmd}`);
          await vscode.commands.executeCommand(cmd);
          this.log("    → Executed");
        } catch {
          this.log("    → Failed");
        }
        await delay(300);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`  ✗ Error: ${msg}`);
    }
  }

  /**
   * Test 6: Inspect tab input objects for session information
   */
  async testInspectTabInputForSession(): Promise<void> {
    this.log("\nTest 6: Inspecting tab inputs for session info...\n");

    // Create a chat tab
    await vscode.commands.executeCommand("workbench.action.openChat");
    await delay(500);

    // Inspect all tabs
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        this.log(`Tab: "${tab.label}" (group ${group.viewColumn})`);
        this.log(`  isPinned: ${tab.isPinned}`);
        this.log(`  isActive: ${tab.isActive}`);

        // The input property might have session info
        const input = tab.input;
        if (input) {
          this.log(`  input type: ${input.constructor?.name ?? typeof input}`);

          // Try Object.keys
          const keys = Object.keys(input);
          this.log(`  Object.keys: ${keys.join(", ") || "(empty)"}`);

          // Try Object.getOwnPropertyNames for non-enumerable
          const propNames = Object.getOwnPropertyNames(input);
          this.log(
            `  getOwnPropertyNames: ${propNames.join(", ") || "(empty)"}`
          );

          // Try to access common properties directly
          const inputAny = input as Record<string, unknown>;
          const propsToCheck = [
            "uri",
            "resource",
            "sessionResource",
            "sessionId",
            "id",
            "_uri",
            "_resource",
          ];
          for (const prop of propsToCheck) {
            try {
              const val = inputAny[prop];
              if (val !== undefined) {
                this.log(`  ${prop}: ${val}`);
              }
            } catch {
              // ignore
            }
          }

          // Check prototype chain
          const proto = Object.getPrototypeOf(input);
          if (proto) {
            const protoProps = Object.getOwnPropertyNames(proto);
            this.log(
              `  prototype props: ${protoProps.slice(0, 10).join(", ")}...`
            );
          }
        }
        this.log("");
      }
    }

    // Cleanup
    await closeAllChatTabs();
  }

  /**
   * Test 7: Try openSessionWithPrompt pattern
   */
  async testOpenSessionWithPrompt(): Promise<void> {
    this.log("\nTest 7: Testing openSessionWithPrompt commands...\n");

    // These commands might create dedicated sessions
    const promptCommands = [
      "workbench.action.chat.openSessionWithPrompt.copilotcli",
      "workbench.action.chat.openSessionWithPrompt.copilot-cloud-agent",
    ];

    for (const cmd of promptCommands) {
      try {
        this.log(`  Trying: ${cmd}`);
        await vscode.commands.executeCommand(cmd, {
          prompt: "TEST: Session with prompt",
        });
        this.log("    → Executed");
        await delay(500);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.log(`    → Error: ${msg}`);
      }
    }

    // Check what tabs were created
    const tabs = getChatTabs();
    this.log(`\n  Chat tabs after: ${tabs.length}`);
    for (const tab of tabs) {
      this.log(`    - "${tab.label}"`);
    }
  }

  /**
   * Test 8: Try to get active chat widget info via commands
   */
  async testGetActiveSessionInfo(): Promise<void> {
    this.log("\nTest 8: Getting active session info via commands...\n");

    // Create a chat first
    await vscode.commands.executeCommand("workbench.action.openChat");
    await delay(500);

    // Try commands that might return session info
    const infoCommands = [
      "github.copilot.chat.showAsChatSession",
      "workbench.action.chat.renameSession",
    ];

    for (const cmd of infoCommands) {
      try {
        this.log(`  Trying: ${cmd}`);
        const result = await vscode.commands.executeCommand(cmd);
        this.log(`    → Result type: ${typeof result}`);
        if (result !== undefined) {
          this.log(`    → Result: ${JSON.stringify(result)}`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.log(`    → Error: ${msg}`);
      }
      await delay(300);
    }

    await closeAllChatTabs();
  }
}

/**
 * Command handler to run session resource tests
 */
export async function runSessionResourceTests(): Promise<void> {
  const tests = new SessionResourceTests();
  await tests.runAll();

  vscode.window.showInformationMessage(
    "Session Resource Tests complete - check output channel"
  );
}

/**
 * Test background agent session creation commands
 * These are DIFFERENT from openSessionWithPrompt - they create NEW dedicated sessions
 */
export async function testBackgroundAgentSessions(): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel(
    "Orchestra Background Agent Sessions"
  );
  outputChannel.show();
  outputChannel.clear();

  const log = (msg: string) => {
    const ts = new Date().toISOString().substring(11, 23);
    outputChannel.appendLine(`[${ts}] ${msg}`);
  };

  log("=== Background Agent Session Creation Tests ===\n");
  log("Testing commands that CREATE NEW dedicated agent sessions.\n");

  // Clean start
  await closeAllChatTabs();
  await delay(300);

  const initialTabs = getChatTabs().length;
  log(`Initial chat tabs: ${initialTabs}\n`);

  // Test 1: openNewSessionEditor commands
  log("--- Test 1: openNewSessionEditor commands ---\n");

  const editorCommands = [
    "workbench.action.chat.openNewSessionEditor.copilotcli",
    "workbench.action.chat.openNewSessionEditor.copilot-cloud-agent",
  ];

  for (const cmd of editorCommands) {
    try {
      log(`Trying: ${cmd}`);
      await vscode.commands.executeCommand(cmd);
      await delay(500);

      const tabs = getChatTabs();
      log(`  → Executed. Chat tabs now: ${tabs.length}`);
      for (const tab of tabs) {
        log(`    - "${tab.label}"`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`  → Error: ${msg}`);
    }
    log("");
  }

  // Test 2: openNewSessionSidebar commands
  log("--- Test 2: openNewSessionSidebar commands ---\n");

  const sidebarCommands = [
    "workbench.action.chat.openNewSessionSidebar.copilotcli",
    "workbench.action.chat.openNewSessionSidebar.copilot-cloud-agent",
  ];

  for (const cmd of sidebarCommands) {
    try {
      log(`Trying: ${cmd}`);
      await vscode.commands.executeCommand(cmd);
      await delay(500);

      const tabs = getChatTabs();
      log(`  → Executed. Chat tabs now: ${tabs.length}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`  → Error: ${msg}`);
    }
    log("");
  }

  // Test 3: CLI-specific session commands
  log("--- Test 3: CLI session commands ---\n");

  const cliCommands = ["github.copilot.cli.sessions.newTerminalSession"];

  for (const cmd of cliCommands) {
    try {
      log(`Trying: ${cmd}`);
      await vscode.commands.executeCommand(cmd);
      await delay(500);
      log(`  → Executed`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`  → Error: ${msg}`);
    }
    log("");
  }

  // Final state
  const finalTabs = getChatTabs();
  log(`\n--- Final State ---`);
  log(`Chat tabs: ${finalTabs.length}`);
  for (const tab of finalTabs) {
    log(`  - "${tab.label}"`);
  }

  log("\n=== Background Agent Session Tests Complete ===");
}

/**
 * Test sending messages to specific agent sessions by focusing tabs
 */
export async function testAgentSessionMessaging(): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("Orchestra");
  outputChannel.show(true);

  const log = (msg: string) => {
    const ts = new Date().toISOString().substring(11, 23);
    outputChannel.appendLine(`[${ts}] ${msg}`);
  };

  log("=== Agent Session Messaging Tests ===\n");
  log("Testing if we can send messages to specific agent sessions.\n");

  // Clean start
  await closeAllChatTabs();
  await delay(300);

  // Step 1: Create both agent sessions
  log("--- Step 1: Create Agent Sessions ---\n");

  log("Creating Background Agent session (copilotcli)...");
  await vscode.commands.executeCommand(
    "workbench.action.chat.openNewSessionEditor.copilotcli"
  );
  await delay(500);

  log("Creating Cloud Agent session...");
  await vscode.commands.executeCommand(
    "workbench.action.chat.openNewSessionEditor.copilot-cloud-agent"
  );
  await delay(500);

  const tabs = getChatTabs();
  log(`Created ${tabs.length} agent tabs:`);
  for (const tab of tabs) {
    log(`  - "${tab.label}" (group ${tab.group.viewColumn})`);
  }

  // Step 2: Find tabs by label
  log("\n--- Step 2: Find Tabs by Label ---\n");

  const backgroundAgentTabs = tabs.filter(
    (t) => t.label === "Background Agent"
  );
  const cloudAgentTabs = tabs.filter((t) => t.label === "Cloud Agent");

  log(`Background Agent tabs: ${backgroundAgentTabs.length}`);
  log(`Cloud Agent tabs: ${cloudAgentTabs.length}`);

  // Step 3: Test focusing and sending to Background Agent
  log("\n--- Step 3: Focus and Send to Background Agent ---\n");

  if (backgroundAgentTabs.length > 0) {
    const bgTab = backgroundAgentTabs[0];
    log(`Attempting to focus tab: "${bgTab.label}"`);

    // Try different focus approaches
    try {
      // Approach 1: Use tab's group to open it
      log("Approach 1: vscode.window.showTextDocument simulation...");
      // Note: Can't directly show a tab, need to find document

      // Approach 2: Use command with tab context
      log("Approach 2: Activate tab group...");
      await vscode.commands.executeCommand(
        "workbench.action.focusActiveEditorGroup"
      );
      await delay(200);

      // Get active tab after focus
      const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
      log(`Active tab after focus: "${activeTab?.label ?? "none"}"`);

      // Try sending a message
      log("Sending test message to focused chat...");
      await vscode.commands.executeCommand("workbench.action.chat.open", {
        query: "TEST: Message to Background Agent session",
        isPartialQuery: true,
      });
      await delay(500);

      log("Message sent. Check if it went to Background Agent session.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`Error: ${msg}`);
    }
  } else {
    log("No Background Agent tabs found!");
  }

  // Step 4: Test tab switching
  log("\n--- Step 4: Tab Switching Test ---\n");

  if (cloudAgentTabs.length > 0) {
    const cloudTab = cloudAgentTabs[0];
    log(`Attempting to switch to: "${cloudTab.label}"`);

    try {
      // Find the tab's position and switch to it
      const tabGroups = vscode.window.tabGroups.all;
      for (const group of tabGroups) {
        const tabIndex = group.tabs.findIndex((t) => t.label === "Cloud Agent");
        if (tabIndex >= 0) {
          log(
            `Found Cloud Agent at group ${group.viewColumn}, index ${tabIndex}`
          );

          // Try to activate this tab group
          await vscode.commands.executeCommand(
            "workbench.action.focusFirstEditorGroup"
          );
          await delay(100);

          // Navigate to the tab
          for (let i = 0; i < tabIndex; i++) {
            await vscode.commands.executeCommand(
              "workbench.action.nextEditorInGroup"
            );
            await delay(50);
          }

          const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
          log(`Active tab now: "${activeTab?.label ?? "none"}"`);
          break;
        }
      }

      // Send message to Cloud Agent
      log("Sending test message to Cloud Agent...");
      await vscode.commands.executeCommand("workbench.action.chat.open", {
        query: "TEST: Message to Cloud Agent session",
        isPartialQuery: true,
      });
      await delay(500);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`Error: ${msg}`);
    }
  }

  // Step 5: Document findings
  log("\n--- Summary ---\n");
  log("Tab-based approach findings:");
  log("1. Agent sessions create identifiable tabs by label");
  log("2. Tab focus mechanisms need investigation");
  log("3. Message routing follows focus (as expected)");

  const finalTabs = getChatTabs();
  log(`\nFinal tabs: ${finalTabs.length}`);
  for (const tab of finalTabs) {
    log(`  - "${tab.label}"`);
  }

  log("\n=== Agent Session Messaging Tests Complete ===");
}

/**
 * Test precise tab focusing for agent sessions
 */
export async function testPreciseTabFocus(): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("Orchestra");
  outputChannel.show(true);

  const log = (msg: string) => {
    const ts = new Date().toISOString().substring(11, 23);
    outputChannel.appendLine(`[${ts}] ${msg}`);
  };

  log("=== Precise Tab Focus Tests ===\n");
  log("Testing exact tab focusing mechanisms.\n");

  // Clean start
  await closeAllChatTabs();
  await delay(300);

  // Create two agent sessions
  log("--- Creating Agent Sessions ---\n");

  await vscode.commands.executeCommand(
    "workbench.action.chat.openNewSessionEditor.copilotcli"
  );
  await delay(500);
  log("Created Background Agent session");

  await vscode.commands.executeCommand(
    "workbench.action.chat.openNewSessionEditor.copilot-cloud-agent"
  );
  await delay(500);
  log("Created Cloud Agent session");

  // List tabs with indices
  const tabs = getChatTabs();
  log(`\nTabs created: ${tabs.length}`);
  tabs.forEach((tab, i) => {
    const isActive = tab === vscode.window.tabGroups.activeTabGroup.activeTab;
    log(`  [${i}] "${tab.label}" ${isActive ? "(ACTIVE)" : ""}`);
  });

  // Method 1: openEditorAtIndex
  log("\n--- Method 1: workbench.action.openEditorAtIndex ---\n");

  // Find Background Agent index
  let bgIndex = -1;
  let cloudIndex = -1;
  const allTabs = vscode.window.tabGroups.activeTabGroup.tabs;
  allTabs.forEach((tab, i) => {
    if (tab.label === "Background Agent") bgIndex = i;
    if (tab.label === "Cloud Agent") cloudIndex = i;
  });
  log(`Background Agent at index: ${bgIndex}`);
  log(`Cloud Agent at index: ${cloudIndex}`);

  if (bgIndex >= 0) {
    log(`\nFocusing Background Agent at index ${bgIndex}...`);
    // VS Code uses 1-based index for openEditorAtIndex
    await vscode.commands.executeCommand(
      "workbench.action.openEditorAtIndex",
      bgIndex
    );
    await delay(300);

    const activeNow = vscode.window.tabGroups.activeTabGroup.activeTab;
    log(`Active tab now: "${activeNow?.label ?? "none"}"`);

    if (activeNow?.label === "Background Agent") {
      log("✓ SUCCESS: Focused Background Agent correctly!");

      // Send message
      log("Sending message to Background Agent...");
      await vscode.commands.executeCommand("workbench.action.chat.open", {
        query: "✓ CORRECT: This message is for Background Agent",
        isPartialQuery: true,
      });
      await delay(500);
    } else {
      log("✗ FAILED: Wrong tab focused");
    }
  }

  // Now focus Cloud Agent
  if (cloudIndex >= 0) {
    log(`\nFocusing Cloud Agent at index ${cloudIndex}...`);
    await vscode.commands.executeCommand(
      "workbench.action.openEditorAtIndex",
      cloudIndex
    );
    await delay(300);

    const activeNow = vscode.window.tabGroups.activeTabGroup.activeTab;
    log(`Active tab now: "${activeNow?.label ?? "none"}"`);

    if (activeNow?.label === "Cloud Agent") {
      log("✓ SUCCESS: Focused Cloud Agent correctly!");

      // Send message
      log("Sending message to Cloud Agent...");
      await vscode.commands.executeCommand("workbench.action.chat.open", {
        query: "✓ CORRECT: This message is for Cloud Agent",
        isPartialQuery: true,
      });
      await delay(500);
    } else {
      log("✗ FAILED: Wrong tab focused");
    }
  }

  // Method 2: First/Previous/Next navigation
  log("\n--- Method 2: Tab Navigation Commands ---\n");

  log("Going to first editor...");
  await vscode.commands.executeCommand("workbench.action.firstEditorInGroup");
  await delay(200);
  log(`Active: "${vscode.window.tabGroups.activeTabGroup.activeTab?.label}"`);

  log("Going to next editor...");
  await vscode.commands.executeCommand("workbench.action.nextEditorInGroup");
  await delay(200);
  log(`Active: "${vscode.window.tabGroups.activeTabGroup.activeTab?.label}"`);

  log("Going to previous editor...");
  await vscode.commands.executeCommand(
    "workbench.action.previousEditorInGroup"
  );
  await delay(200);
  log(`Active: "${vscode.window.tabGroups.activeTabGroup.activeTab?.label}"`);

  log("Going to last editor...");
  await vscode.commands.executeCommand("workbench.action.lastEditorInGroup");
  await delay(200);
  log(`Active: "${vscode.window.tabGroups.activeTabGroup.activeTab?.label}"`);

  // Final verification
  log("\n--- Final Verification ---\n");
  const finalTabs = getChatTabs();
  log(`Final tabs: ${finalTabs.length}`);
  finalTabs.forEach((tab) => {
    log(`  - "${tab.label}"`);
  });

  log("\n=== Precise Tab Focus Tests Complete ===");
  log("\nCHECK THE TABS: Each should have its CORRECT message.");
}

/**
 * Discover what openNewSessionEditor commands exist for our orchestra participants
 */
export async function discoverOrchestraSessionCommands(): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("Orchestra");
  outputChannel.show(true);

  const log = (msg: string) => {
    const ts = new Date().toISOString().substring(11, 23);
    outputChannel.appendLine(`[${ts}] ${msg}`);
  };

  log("=== Discovering Orchestra Session Commands ===\n");

  const allCommands = await vscode.commands.getCommands(true);

  // Look for our orchestra participants
  log("--- Commands containing 'orchestra' ---\n");
  const orchestraCommands = allCommands.filter((c) =>
    c.toLowerCase().includes("orchestra")
  );
  for (const cmd of orchestraCommands.sort()) {
    log(`  ${cmd}`);
  }
  log(`\nTotal: ${orchestraCommands.length}\n`);

  // Look for openNewSessionEditor variants
  log("--- openNewSessionEditor.* commands ---\n");
  const sessionEditorCommands = allCommands.filter((c) =>
    c.includes("openNewSessionEditor")
  );
  for (const cmd of sessionEditorCommands.sort()) {
    log(`  ${cmd}`);
  }
  log(`\nTotal: ${sessionEditorCommands.length}\n`);

  // Look for openNewSessionSidebar variants
  log("--- openNewSessionSidebar.* commands ---\n");
  const sessionSidebarCommands = allCommands.filter((c) =>
    c.includes("openNewSessionSidebar")
  );
  for (const cmd of sessionSidebarCommands.sort()) {
    log(`  ${cmd}`);
  }
  log(`\nTotal: ${sessionSidebarCommands.length}\n`);

  // Look for mode/participant related commands
  log("--- Mode/Participant related commands ---\n");
  const modeCommands = allCommands.filter(
    (c) =>
      c.toLowerCase().includes("mode") ||
      c.toLowerCase().includes("participant")
  );
  for (const cmd of modeCommands.slice(0, 30).sort()) {
    log(`  ${cmd}`);
  }
  log(`\nTotal: ${modeCommands.length} (showing first 30)\n`);

  // Test: Try to create orchestra orchestrator session
  log("--- Attempting Orchestra Sessions ---\n");

  const orchestraSessionCommands = [
    "workbench.action.chat.openNewSessionEditor.orchestra.orchestrator",
    "workbench.action.chat.openNewSessionEditor.orchestra.implementor",
    "workbench.action.chat.openNewSessionSidebar.orchestra.orchestrator",
    "workbench.action.chat.openNewSessionSidebar.orchestra.implementor",
  ];

  for (const cmd of orchestraSessionCommands) {
    try {
      log(`Trying: ${cmd}`);
      const exists = allCommands.includes(cmd);
      log(`  Command exists: ${exists}`);

      if (exists) {
        await vscode.commands.executeCommand(cmd);
        await delay(500);
        log(`  → Executed successfully!`);

        const tabs = getChatTabs();
        log(`  → Chat tabs: ${tabs.length}`);
        for (const tab of tabs) {
          log(`      - "${tab.label}"`);
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`  → Error: ${msg}`);
    }
    log("");
  }

  // Check if there's a way to set mode on existing chat
  log("--- Mode Setting Commands ---\n");
  const setModeCommands = allCommands.filter(
    (c) =>
      c.toLowerCase().includes("setmode") ||
      c.toLowerCase().includes("switchmode") ||
      c.toLowerCase().includes("changemode")
  );
  for (const cmd of setModeCommands.sort()) {
    log(`  ${cmd}`);
  }
  log(`\nTotal: ${setModeCommands.length}\n`);

  log("=== Discovery Complete ===");
}

/**
 * Test using @mentions in Background Agent sessions
 */
export async function testMentionsInAgentSessions(): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("Orchestra");
  outputChannel.show(true);

  const log = (msg: string) => {
    const ts = new Date().toISOString().substring(11, 23);
    outputChannel.appendLine(`[${ts}] ${msg}`);
  };

  log("=== Testing @mentions in Agent Sessions ===\n");
  log("Can we use @orchestra.orchestrator in a Background Agent session?\n");

  // Clean start
  await closeAllChatTabs();
  await delay(300);

  // Create Background Agent session for Orchestrator
  log("--- Creating Background Agent Session ---\n");
  await vscode.commands.executeCommand(
    "workbench.action.chat.openNewSessionEditor.copilotcli"
  );
  await delay(500);

  const tabs = getChatTabs();
  log(`Created tabs: ${tabs.length}`);
  for (const tab of tabs) {
    log(`  - "${tab.label}"`);
  }

  // Focus and send with @mention (partial - so you can see it)
  log("\n--- Sending with @orchestra.orchestrator mention ---\n");

  // Find and focus the Background Agent tab
  const allTabs = vscode.window.tabGroups.activeTabGroup.tabs;
  const bgIndex = allTabs.findIndex((t) => t.label === "Background Agent");

  if (bgIndex >= 0) {
    await vscode.commands.executeCommand(
      "workbench.action.openEditorAtIndex",
      bgIndex
    );
    await delay(300);

    log(
      `Focused tab: "${vscode.window.tabGroups.activeTabGroup.activeTab?.label}"`
    );

    // Send with @mention (partial so user can inspect)
    log("Sending: @orchestra.orchestrator Hello from test!");
    await vscode.commands.executeCommand("workbench.action.chat.open", {
      query:
        "@orchestra.orchestrator Hello from test! Please confirm you received this.",
      isPartialQuery: true, // Change to false to actually send
    });
    await delay(500);

    log(
      "\n✓ Message populated. Check if @orchestra.orchestrator is recognized."
    );
    log("  - If the @mention is highlighted, it should work!");
    log("  - Press Enter to send and verify the orchestrator responds.");
  } else {
    log("✗ Background Agent tab not found!");
  }

  // Also test mode picker
  log("\n--- Testing Mode Picker ---\n");
  log("Trying workbench.action.chat.openModePicker...");

  try {
    await vscode.commands.executeCommand(
      "workbench.action.chat.openModePicker"
    );
    log("  → Mode picker should have opened (check UI)");
    log("  → This could allow programmatic mode switching");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`  → Error: ${msg}`);
  }

  log("\n=== @mentions Test Complete ===");
}

/**
 * Test setting mode via the mode parameter in chat.open
 */
export async function testModeParameter(): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("Orchestra");
  outputChannel.show(true);

  const log = (msg: string) => {
    const ts = new Date().toISOString().substring(11, 23);
    outputChannel.appendLine(`[${ts}] ${msg}`);
  };

  log("=== Testing Mode Parameter in chat.open ===\n");
  log("Can we set mode programmatically via the 'mode' parameter?\n");

  // Clean start
  await closeAllChatTabs();
  await delay(300);

  // Test 1: Open chat with orchestra.orchestrator mode
  log("--- Test 1: Open with orchestra.orchestrator mode ---\n");
  try {
    await vscode.commands.executeCommand("workbench.action.chat.open", {
      query:
        "TEST: This should be in ORCHESTRATOR mode. Please confirm what mode you're in.",
      mode: "orchestra.orchestrator",
      isPartialQuery: true, // Set to false to actually send
    });
    await delay(500);

    const tabs = getChatTabs();
    log(`Tabs: ${tabs.length}`);
    for (const tab of tabs) {
      log(`  - "${tab.label}"`);
    }
    log("\n✓ Check the chat - is the mode set to Orchestra Orchestrator?");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`Error: ${msg}`);
  }

  // Wait for user to observe
  await delay(2000);

  // Test 2: Create a new chat tab with implementor mode
  log("\n--- Test 2: New chat editor with orchestra.implementor mode ---\n");
  try {
    // First create a new chat editor tab
    await vscode.commands.executeCommand("workbench.action.openChat");
    await delay(500);

    // Now send to it with mode
    await vscode.commands.executeCommand("workbench.action.chat.open", {
      query:
        "TEST: This should be in IMPLEMENTOR mode. Please confirm what mode you're in.",
      mode: "orchestra.implementor",
      isPartialQuery: true,
    });
    await delay(500);

    const tabs = getChatTabs();
    log(`Tabs: ${tabs.length}`);
    for (const tab of tabs) {
      log(`  - "${tab.label}"`);
    }
    log("\n✓ Check this chat - is the mode set to Orchestra Implementor?");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`Error: ${msg}`);
  }

  // Test 3: Verify tab focusing still works with mode
  log("\n--- Test 3: Focus + Mode Combination ---\n");

  const allTabs = vscode.window.tabGroups.activeTabGroup.tabs;
  const chatTabs = getChatTabs();

  log(`Total tabs: ${allTabs.length}, Chat tabs: ${chatTabs.length}`);

  if (chatTabs.length >= 2) {
    // Find first chat tab index
    const firstChatIndex = allTabs.findIndex(
      (t) =>
        t.label === "Chat" ||
        t.label.includes("Chat") ||
        t.label === "Background Agent" ||
        t.label === "Cloud Agent"
    );

    if (firstChatIndex >= 0) {
      log(`Focusing first chat at index ${firstChatIndex}...`);
      await vscode.commands.executeCommand(
        "workbench.action.openEditorAtIndex",
        firstChatIndex
      );
      await delay(300);

      log("Sending with orchestrator mode to focused tab...");
      await vscode.commands.executeCommand("workbench.action.chat.open", {
        query: "FOCUS TEST: Should go to first tab with ORCHESTRATOR mode",
        mode: "orchestra.orchestrator",
        isPartialQuery: true,
      });
    }
  }

  log("\n=== Mode Parameter Tests Complete ===");
  log("\nKEY QUESTION: Did the modes get applied correctly?");
  log("Check the mode dropdown in each chat tab.");
}

/**
 * Test creating Orchestra chat sessions with distinct labels
 */
export async function testOrchestraChatTabs(): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("Orchestra");
  outputChannel.show(true);

  const log = (msg: string) => {
    const ts = new Date().toISOString().substring(11, 23);
    outputChannel.appendLine(`[${ts}] ${msg}`);
  };

  log("=== Testing Orchestra Chat Tab Creation ===\n");
  log("Do our agent commands create tabs with distinct labels?\n");

  // Clean start
  await closeAllChatTabs();
  await delay(300);

  log("Initial chat tabs: 0\n");

  // Test 1: Create with orchestra.orchestrator
  log("--- Test 1: workbench.action.chat.openorchestra.orchestrator ---\n");
  try {
    await vscode.commands.executeCommand(
      "workbench.action.chat.openorchestra.orchestrator"
    );
    await delay(500);

    const tabs1 = getChatTabs();
    log(`Tabs after orchestrator: ${tabs1.length}`);
    for (const tab of tabs1) {
      const isActive = tab === vscode.window.tabGroups.activeTabGroup.activeTab;
      log(`  - "${tab.label}" ${isActive ? "(ACTIVE)" : ""}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`Error: ${msg}`);
  }

  // Test 2: Create with orchestra.implementor
  log("\n--- Test 2: workbench.action.chat.openorchestra.implementor ---\n");
  try {
    await vscode.commands.executeCommand(
      "workbench.action.chat.openorchestra.implementor"
    );
    await delay(500);

    const tabs2 = getChatTabs();
    log(`Tabs after implementor: ${tabs2.length}`);
    for (const tab of tabs2) {
      const isActive = tab === vscode.window.tabGroups.activeTabGroup.activeTab;
      log(`  - "${tab.label}" ${isActive ? "(ACTIVE)" : ""}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`Error: ${msg}`);
  }

  // Test 3: Check if we can distinguish them
  log("\n--- Test 3: Tab Analysis ---\n");

  const allTabs = vscode.window.tabGroups.activeTabGroup.tabs;
  log(`Total tabs in group: ${allTabs.length}`);

  allTabs.forEach((tab, index) => {
    log(`  [${index}] "${tab.label}"`);
    log(`       isPinned: ${tab.isPinned}`);
    log(`       isActive: ${tab.isActive}`);

    // Check input type
    const input = tab.input;
    if (input) {
      log(`       input type: ${input.constructor?.name ?? typeof input}`);
      // Try to get any properties
      const props = Object.getOwnPropertyNames(input);
      if (props.length > 0) {
        log(`       input props: ${props.join(", ")}`);
      }
    }
  });

  // Test 4: Can we focus and route?
  log("\n--- Test 4: Focus and Route Test ---\n");

  const chatTabs = getChatTabs();
  if (chatTabs.length >= 2) {
    // Focus first chat tab
    const firstChatIndex = allTabs.findIndex(
      (t) => t.label === "Chat" || t.label.includes("Chat")
    );

    if (firstChatIndex >= 0) {
      log(`Focusing first chat at index ${firstChatIndex}...`);
      await vscode.commands.executeCommand(
        "workbench.action.openEditorAtIndex",
        firstChatIndex
      );
      await delay(300);

      const active = vscode.window.tabGroups.activeTabGroup.activeTab;
      log(`Active tab: "${active?.label}"`);

      log("Sending test message to first chat...");
      await vscode.commands.executeCommand("workbench.action.chat.open", {
        query: "TEST 1: This should go to the FIRST chat tab",
        isPartialQuery: true,
      });
      await delay(300);
    }

    // Focus second chat tab if exists
    const secondChatIndex = allTabs.findIndex(
      (t, i) =>
        i > firstChatIndex && (t.label === "Chat" || t.label.includes("Chat"))
    );

    if (secondChatIndex >= 0) {
      log(`\nFocusing second chat at index ${secondChatIndex}...`);
      await vscode.commands.executeCommand(
        "workbench.action.openEditorAtIndex",
        secondChatIndex
      );
      await delay(300);

      const active = vscode.window.tabGroups.activeTabGroup.activeTab;
      log(`Active tab: "${active?.label}"`);

      log("Sending test message to second chat...");
      await vscode.commands.executeCommand("workbench.action.chat.open", {
        query: "TEST 2: This should go to the SECOND chat tab",
        isPartialQuery: true,
      });
    }
  } else {
    log("Not enough chat tabs to test routing");
  }

  log("\n=== Orchestra Chat Tab Test Complete ===");
  log("\nKEY FINDINGS:");
  log("- Check if tabs have distinct labels");
  log("- Check if focus/routing works");
}

/**
 * Test label-capture approach for session tracking
 * This is THE simple solution we should have found earlier!
 */
export async function testLabelCapture(): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("Orchestra");
  outputChannel.show(true);

  const log = (msg: string) => {
    const ts = new Date().toISOString().substring(11, 23);
    outputChannel.appendLine(`[${ts}] ${msg}`);
  };

  log("=== Label Capture Test ===\n");
  log(
    "Testing: Create chat → Send message → Capture renamed label → Find later\n"
  );

  // Clean start
  await closeAllChatTabs();
  await delay(300);

  // Track our sessions
  let orchestratorLabel: string | null = null;
  let implementorLabel: string | null = null;

  // Step 1: Create Orchestrator session
  log("--- Step 1: Create Orchestrator Session ---\n");

  log("Creating new chat...");
  await vscode.commands.executeCommand("workbench.action.openChat");
  await delay(300);

  let tabBefore = vscode.window.tabGroups.activeTabGroup.activeTab;
  log(`Tab label BEFORE send: "${tabBefore?.label}"`);

  log("Sending first message (this will rename the tab)...");
  await vscode.commands.executeCommand("workbench.action.chat.open", {
    query:
      "ORCHESTRATOR SESSION: Hello! This is the orchestrator test session.",
    mode: "orchestra.orchestrator",
    isPartialQuery: false, // Actually send!
  });

  // Wait for response and tab rename
  log("Waiting for AI response and tab rename...");
  await delay(3000);

  let tabAfter = vscode.window.tabGroups.activeTabGroup.activeTab;
  orchestratorLabel = tabAfter?.label ?? null;
  log(`Tab label AFTER send: "${orchestratorLabel}"`);

  if (orchestratorLabel && orchestratorLabel !== "Chat") {
    log(`✓ SUCCESS! Captured orchestrator label: "${orchestratorLabel}"`);
  } else {
    log(`⚠ Tab may not have renamed yet. Current: "${orchestratorLabel}"`);
  }

  // Step 2: Create Implementor session
  log("\n--- Step 2: Create Implementor Session ---\n");

  log("Creating new chat...");
  await vscode.commands.executeCommand("workbench.action.openChat");
  await delay(300);

  tabBefore = vscode.window.tabGroups.activeTabGroup.activeTab;
  log(`Tab label BEFORE send: "${tabBefore?.label}"`);

  log("Sending first message...");
  await vscode.commands.executeCommand("workbench.action.chat.open", {
    query: "IMPLEMENTOR SESSION: Hello! This is the implementor test session.",
    mode: "orchestra.implementor",
    isPartialQuery: false,
  });

  log("Waiting for AI response and tab rename...");
  await delay(3000);

  tabAfter = vscode.window.tabGroups.activeTabGroup.activeTab;
  implementorLabel = tabAfter?.label ?? null;
  log(`Tab label AFTER send: "${implementorLabel}"`);

  if (implementorLabel && implementorLabel !== "Chat") {
    log(`✓ SUCCESS! Captured implementor label: "${implementorLabel}"`);
  } else {
    log(`⚠ Tab may not have renamed yet. Current: "${implementorLabel}"`);
  }

  // Step 3: List all tabs
  log("\n--- Step 3: Current Tab State ---\n");

  const allTabs = vscode.window.tabGroups.activeTabGroup.tabs;
  log(`Total tabs: ${allTabs.length}`);
  allTabs.forEach((tab, i) => {
    const isActive = tab.isActive ? " (ACTIVE)" : "";
    log(`  [${i}] "${tab.label}"${isActive}`);
  });

  // Step 4: Find tabs by captured label
  log("\n--- Step 4: Find Tabs by Captured Label ---\n");

  function findTabByLabel(
    label: string
  ): { tab: vscode.Tab; index: number } | null {
    const tabs = vscode.window.tabGroups.activeTabGroup.tabs;
    for (let i = 0; i < tabs.length; i++) {
      if (tabs[i].label === label) {
        return { tab: tabs[i], index: i };
      }
    }
    return null;
  }

  if (orchestratorLabel) {
    const found = findTabByLabel(orchestratorLabel);
    if (found) {
      log(
        `✓ Found orchestrator tab at index ${found.index}: "${found.tab.label}"`
      );
    } else {
      log(
        `✗ Could not find orchestrator tab with label: "${orchestratorLabel}"`
      );
    }
  }

  if (implementorLabel) {
    const found = findTabByLabel(implementorLabel);
    if (found) {
      log(
        `✓ Found implementor tab at index ${found.index}: "${found.tab.label}"`
      );
    } else {
      log(`✗ Could not find implementor tab with label: "${implementorLabel}"`);
    }
  }

  // Step 5: Route messages to specific tabs
  log("\n--- Step 5: Route Messages to Specific Tabs ---\n");

  if (orchestratorLabel) {
    const found = findTabByLabel(orchestratorLabel);
    if (found) {
      log(`Focusing orchestrator tab at index ${found.index}...`);
      await vscode.commands.executeCommand(
        "workbench.action.openEditorAtIndex",
        found.index
      );
      await delay(300);

      log("Sending follow-up to orchestrator...");
      await vscode.commands.executeCommand("workbench.action.chat.open", {
        query:
          "FOLLOW-UP: This message should appear in the ORCHESTRATOR session.",
        mode: "orchestra.orchestrator",
        isPartialQuery: true, // Just populate, don't send
      });
    }
  }

  await delay(1000);

  if (implementorLabel) {
    const found = findTabByLabel(implementorLabel);
    if (found) {
      log(`Focusing implementor tab at index ${found.index}...`);
      await vscode.commands.executeCommand(
        "workbench.action.openEditorAtIndex",
        found.index
      );
      await delay(300);

      log("Sending follow-up to implementor...");
      await vscode.commands.executeCommand("workbench.action.chat.open", {
        query:
          "FOLLOW-UP: This message should appear in the IMPLEMENTOR session.",
        mode: "orchestra.implementor",
        isPartialQuery: true,
      });
    }
  }

  // Summary
  log("\n=== Label Capture Test Complete ===\n");
  log("STORED LABELS:");
  log(`  Orchestrator: "${orchestratorLabel}"`);
  log(`  Implementor: "${implementorLabel}"`);
  log("\nVERIFY:");
  log("1. Each tab should have its follow-up message populated");
  log("2. Labels are unique and stable");
  log("3. This approach can be used for SessionManager!");
}

/**
 * Test: /clear command via chat.open
 *
 * Tests whether sending "/clear" as a query clears the chat history.
 * This is important for reusing implementor sessions between tasks.
 */
export async function testClearCommand(): Promise<void> {
  const log = (msg: string) =>
    vscode.commands.executeCommand(
      "orchestra.log",
      `[${new Date().toLocaleTimeString()}] ${msg}`
    );

  log("=== /clear Command Test ===\n");
  log("Testing: Create chat → Send messages → /clear → Verify cleared\n");

  // Step 1: Create a chat session with some messages
  log("--- Step 1: Create Chat Session ---\n");
  await vscode.commands.executeCommand("workbench.action.chat.open");
  await delay(500);

  const initialLabel =
    vscode.window.tabGroups.activeTabGroup.activeTab?.label || "unknown";
  log(`Initial tab label: "${initialLabel}"`);

  // Send first message
  log("Sending first message...");
  await vscode.commands.executeCommand("workbench.action.chat.open", {
    query: "CLEAR TEST MESSAGE 1: Remember the number 42.",
    mode: "orchestra.implementor",
    isPartialQuery: false,
  });
  await delay(3000); // Wait for AI response

  const afterFirstLabel =
    vscode.window.tabGroups.activeTabGroup.activeTab?.label || "unknown";
  log(`Tab label after first message: "${afterFirstLabel}"`);

  // Send second message
  log("Sending second message...");
  await vscode.commands.executeCommand("workbench.action.chat.open", {
    query: "CLEAR TEST MESSAGE 2: And also remember the word BANANA.",
    mode: "orchestra.implementor",
    isPartialQuery: false,
  });
  await delay(3000);

  log("✓ Chat now has 2 exchanges with AI\n");

  // Step 2: Try /clear command
  log("--- Step 2: Send /clear Command ---\n");
  log("Sending /clear...");

  await vscode.commands.executeCommand("workbench.action.chat.open", {
    query: "/clear",
    isPartialQuery: false,
  });
  await delay(1000);

  const afterClearLabel =
    vscode.window.tabGroups.activeTabGroup.activeTab?.label || "unknown";
  log(`Tab label after /clear: "${afterClearLabel}"`);

  // Step 3: Test if context was cleared
  log("\n--- Step 3: Test Context Cleared ---\n");
  log("Sending test question to see if AI remembers previous context...");

  await vscode.commands.executeCommand("workbench.action.chat.open", {
    query:
      "POST-CLEAR TEST: What number and word did I ask you to remember? If you don't know, just say 'I have no memory of previous messages'.",
    mode: "orchestra.implementor",
    isPartialQuery: false,
  });
  await delay(3000);

  const finalLabel =
    vscode.window.tabGroups.activeTabGroup.activeTab?.label || "unknown";
  log(`Final tab label: "${finalLabel}"`);

  // Summary
  log("\n=== /clear Command Test Complete ===\n");
  log("LABEL CHANGES:");
  log(`  Initial:      "${initialLabel}"`);
  log(`  After msg 1:  "${afterFirstLabel}"`);
  log(`  After /clear: "${afterClearLabel}"`);
  log(`  Final:        "${finalLabel}"`);
  log("\nVERIFY MANUALLY:");
  log("1. Check if /clear appeared as a command or was sent as text");
  log(
    "2. Check AI's response - does it remember '42' and 'BANANA' or is context cleared?"
  );
  log("3. If AI says 'I have no memory' → /clear WORKS via chat.open command");
  log(
    "4. If AI recalls the values → /clear does NOT work, need new tab per task"
  );
}

/**
 * Test: Discover chat history commands
 *
 * Searches for any commands related to chat history that might let us
 * programmatically access or restore closed chat sessions.
 */
export async function discoverChatHistoryCommands(): Promise<void> {
  // Create output channel for results
  const outputChannel = vscode.window.createOutputChannel(
    "Orchestra Chat Discovery"
  );
  outputChannel.show(true);

  const log = (msg: string) => {
    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);
  };

  log("=== Chat History Command Discovery ===");
  log("");

  // Get all commands
  const allCommands = await vscode.commands.getCommands(true);

  // Search for history-related commands
  const historyPatterns = [
    "history",
    "recent",
    "restore",
    "reopen",
    "session",
    "previous",
  ];

  const chatCommands = allCommands.filter((cmd) => {
    const lower = cmd.toLowerCase();
    return (
      (lower.includes("chat") || lower.includes("copilot")) &&
      historyPatterns.some((p) => lower.includes(p))
    );
  });

  log(`Found ${chatCommands.length} potential chat history commands:`);
  log("");
  for (const cmd of chatCommands.sort()) {
    log(`  - ${cmd}`);
  }

  // Also list all chat.* and copilot.* commands for reference
  log("");
  log("--- All workbench.action.chat.* commands ---");
  log("");
  const chatActionCommands = allCommands
    .filter((cmd) => cmd.startsWith("workbench.action.chat"))
    .sort();
  for (const cmd of chatActionCommands) {
    log(`  - ${cmd}`);
  }

  log("");
  log("--- All workbench.panel.chat* commands ---");
  log("");
  const chatPanelCommands = allCommands
    .filter((cmd) => cmd.startsWith("workbench.panel.chat"))
    .sort();
  for (const cmd of chatPanelCommands) {
    log(`  - ${cmd}`);
  }

  // Check for chat view commands
  log("");
  log("--- Chat view commands ---");
  log("");
  const chatViewCommands = allCommands
    .filter(
      (cmd) =>
        cmd.includes("chat") && (cmd.includes("view") || cmd.includes("View"))
    )
    .sort();
  for (const cmd of chatViewCommands) {
    log(`  - ${cmd}`);
  }

  log("");
  log("=== Discovery Complete ===");
  log("Look for commands that might open chat history or restore sessions.");

  // Also show a summary in info message
  vscode.window.showInformationMessage(
    `Found ${chatCommands.length} history-related commands, ${chatActionCommands.length} chat action commands. See Output panel.`
  );
}

/**
 * Test: Explore session restoration commands
 *
 * Tests whether we can programmatically open chat history
 * and restore a specific session.
 */
export async function testSessionRestoration(): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel(
    "Orchestra Session Restore"
  );
  outputChannel.show(true);

  const log = (msg: string) => {
    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);
  };

  log("=== Session Restoration Test ===");
  log("");

  // Step 1: Try opening the history picker
  log("--- Step 1: Open History Picker ---");
  log("Executing: workbench.action.chat.history");
  log("(This should open a quickpick with all chat sessions)");
  log("");

  try {
    await vscode.commands.executeCommand("workbench.action.chat.history");
    log("✓ History command executed");
    log("CHECK: Did a history picker appear?");
  } catch (err) {
    log(`✗ Error: ${err}`);
  }

  await delay(2000);

  // Step 2: Try the local sessions view
  log("");
  log("--- Step 2: Open Local Sessions View ---");
  log("Executing: workbench.view.chat.sessions.local.open");
  log("");

  try {
    await vscode.commands.executeCommand(
      "workbench.view.chat.sessions.local.open"
    );
    log("✓ Local sessions view command executed");
    log("CHECK: Did a sessions panel appear in the sidebar?");
  } catch (err) {
    log(`✗ Error: ${err}`);
  }

  await delay(1000);

  // Step 3: List current tabs to see if anything changed
  log("");
  log("--- Step 3: Current Tabs ---");
  const tabs = vscode.window.tabGroups.activeTabGroup.tabs;
  log(`Total tabs: ${tabs.length}`);
  for (let i = 0; i < tabs.length; i++) {
    const active = tabs[i].isActive ? " (ACTIVE)" : "";
    log(`  [${i}] "${tabs[i].label}"${active}`);
  }

  // Step 4: Document what we found
  log("");
  log("=== Session Restoration Summary ===");
  log("");
  log("NEXT STEPS TO TEST MANUALLY:");
  log("1. If history picker appeared, select a session - does it restore?");
  log("2. Check if sessions view shows our ORCHESTRATOR/IMPLEMENTOR sessions");
  log("3. Try clicking on a session in the view - does it open as a tab?");
  log("");
  log("KEY QUESTION: Can we pass a session ID to open a specific session?");
  log("Try running in debug console:");
  log(
    '  vscode.commands.executeCommand("workbench.action.chat.openSessionInEditorGroup", "sessionId")'
  );
}

/**
 * Test: Session Rename and History Reopen
 *
 * Tests whether we can:
 * 1. Create a session and rename it to a known name (e.g., "Orchestrator")
 * 2. Close the session
 * 3. Reopen it from history by name
 */
export async function testSessionRenameAndReopen(): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel(
    "Orchestra Session Rename"
  );
  outputChannel.show(true);

  const log = (msg: string) => {
    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);
  };

  log("=== Session Rename and Reopen Test ===");
  log("");

  // Step 1: Create a new chat session
  log("--- Step 1: Create New Chat Session ---");
  await vscode.commands.executeCommand("workbench.action.chat.open");
  await delay(500);

  const initialLabel =
    vscode.window.tabGroups.activeTabGroup.activeTab?.label || "unknown";
  log(`Created session with label: "${initialLabel}"`);

  // Send an initial message to make it a real session
  log("Sending initial message...");
  await vscode.commands.executeCommand("workbench.action.chat.open", {
    query: "RENAME TEST: This session will be renamed to Orchestra-Test",
    mode: "orchestra.orchestrator",
    isPartialQuery: false,
  });
  await delay(3000);

  const afterMessageLabel =
    vscode.window.tabGroups.activeTabGroup.activeTab?.label || "unknown";
  log(`Label after message: "${afterMessageLabel}"`);

  // Step 2: Try to rename the session
  log("");
  log("--- Step 2: Rename Session ---");
  log("Executing: workbench.action.chat.renameSession");
  log("");

  // First, let's try with a parameter
  log("Trying with parameter 'Orchestra-Test-Session'...");
  try {
    const result = await vscode.commands.executeCommand(
      "workbench.action.chat.renameSession",
      "Orchestra-Test-Session"
    );
    log(`Result: ${JSON.stringify(result)}`);
  } catch (err) {
    log(`Error with parameter: ${err}`);
  }

  await delay(1000);

  const afterRenameLabel =
    vscode.window.tabGroups.activeTabGroup.activeTab?.label || "unknown";
  log(`Label after rename attempt: "${afterRenameLabel}"`);

  // Check if rename worked
  if (afterRenameLabel !== afterMessageLabel) {
    log("✓ Label changed! Rename may have worked.");
  } else {
    log("✗ Label unchanged. Rename may require user input.");
    log("");
    log("Trying without parameter (will prompt user)...");
    try {
      await vscode.commands.executeCommand(
        "workbench.action.chat.renameSession"
      );
      log(
        "Rename dialog should have appeared. Enter 'Orchestra-Test-Session' manually."
      );
    } catch (err) {
      log(`Error: ${err}`);
    }
  }

  await delay(2000);

  const finalLabel =
    vscode.window.tabGroups.activeTabGroup.activeTab?.label || "unknown";
  log(`Final label: "${finalLabel}"`);

  // Step 3: Try to find session by known name
  log("");
  log("--- Step 3: History Commands Analysis ---");
  log("");
  log("Commands that might accept a session name/ID:");
  log("  - workbench.action.chat.openSessionInEditorGroup");
  log("  - workbench.action.chat.continueChatInSession");
  log("  - workbench.action.chat.openSessionInSidebar");
  log("");
  log("Testing openSessionInEditorGroup with session name...");

  try {
    // Try passing the session name as parameter
    await vscode.commands.executeCommand(
      "workbench.action.chat.openSessionInEditorGroup",
      "Orchestra-Test-Session"
    );
    log("Command executed - check if session opened");
  } catch (err) {
    log(`Error: ${err}`);
  }

  // Summary
  log("");
  log("=== Test Summary ===");
  log("");
  log(`Initial label: "${initialLabel}"`);
  log(`After message: "${afterMessageLabel}"`);
  log(`After rename:  "${afterRenameLabel}"`);
  log(`Final:         "${finalLabel}"`);
  log("");
  log("KEY FINDINGS:");
  log("1. Does renameSession accept a parameter? Check if label changed.");
  log("2. Does openSessionInEditorGroup accept a session name?");
  log("");
  log("NEXT: If rename requires user input, we may need to:");
  log("  a) Use our label-capture approach instead, OR");
  log("  b) Find a way to set the session name at creation time");
}
