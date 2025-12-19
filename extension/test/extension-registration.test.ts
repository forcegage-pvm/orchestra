/**
 * Tests for extension.ts - Command registration and CurrentTaskViewProvider
 *
 * Verifies Task 7: CurrentTaskViewProvider is properly registered with required dependencies
 * Verifies Task 15: All commands are properly registered and consistent with package.json
 */

import * as fs from "fs";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Parse commands from package.json contributes.commands
 */
function extractPackageJsonCommands(packageJson: {
  contributes?: { commands?: Array<{ command: string }> };
}): string[] {
  const commands = packageJson.contributes?.commands || [];
  return commands
    .map((cmd) => cmd.command)
    .filter((id) => id.startsWith("orchestra."));
}

/**
 * Extract registerCommand calls from extension.ts source code
 */
function extractRegisteredCommands(code: string): string[] {
  const commandPattern =
    /vscode\.commands\.registerCommand\(\s*["']([^"']+)["']/g;
  const matches: string[] = [];
  let match;
  while ((match = commandPattern.exec(code)) !== null) {
    matches.push(match[1] || "");
  }
  return matches.filter((id) => id.startsWith("orchestra."));
}

describe("Extension registration - Command registration (Task 15)", () => {
  let extensionCode: string;
  let packageJson: { contributes?: { commands?: Array<{ command: string }> } };

  beforeEach(() => {
    // Read the actual extension.ts file
    const extensionPath = path.join(__dirname, "..", "src", "extension.ts");
    extensionCode = fs.readFileSync(extensionPath, "utf-8");

    // Read package.json
    const packageJsonPath = path.join(__dirname, "..", "package.json");
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {
      contributes?: { commands?: Array<{ command: string }> };
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("TDD tests for command registration", () => {
    it("should have at least 5 registerCommand calls", () => {
      const registrations = extensionCode.match(
        /vscode\.commands\.registerCommand\(/g
      );
      expect(registrations).toBeTruthy();
      expect(registrations!.length).toBeGreaterThanOrEqual(5);
    });

    it("should have registerCommand patterns in extension.ts", () => {
      expect(extensionCode).toContain("vscode.commands.registerCommand(");
    });

    it("should register all commands with orchestra.* prefix", () => {
      const registeredCommands = extractRegisteredCommands(extensionCode);
      expect(registeredCommands.length).toBeGreaterThan(0);

      for (const commandId of registeredCommands) {
        expect(commandId).toMatch(/^orchestra\./);
      }
    });

    it("should have context.subscriptions.push for command registrations", () => {
      // Check that commands are added to subscriptions
      expect(extensionCode).toContain("context.subscriptions.push(");
      expect(extensionCode).toMatch(
        /context\.subscriptions\.push\([^)]*vscode\.commands\.registerCommand/
      );
    });
  });

  describe("Consistency between package.json and extension.ts", () => {
    it("should register all commands declared in package.json", () => {
      const packageCommands = extractPackageJsonCommands(packageJson);
      const registeredCommands = extractRegisteredCommands(extensionCode);

      expect(packageCommands.length).toBeGreaterThan(0);

      // Every command in package.json should be registered
      for (const commandId of packageCommands) {
        expect(
          registeredCommands,
          `Command ${commandId} from package.json should be registered in extension.ts`
        ).toContain(commandId);
      }
    });

    it("should not register commands not in package.json", () => {
      const packageCommands = extractPackageJsonCommands(packageJson);
      const registeredCommands = extractRegisteredCommands(extensionCode);

      // Every registered orchestra.* command should be in package.json
      for (const commandId of registeredCommands) {
        expect(
          packageCommands,
          `Registered command ${commandId} should be declared in package.json`
        ).toContain(commandId);
      }
    });

    it("should have all package.json commands registered (may have extras)", () => {
      const packageCommands = extractPackageJsonCommands(packageJson);
      const registeredCommands = extractRegisteredCommands(extensionCode);

      // Should have at least as many registered as in package.json
      // (Note: orchestra.initializeWorkspace may be registered multiple times for different modes)
      expect(registeredCommands.length).toBeGreaterThanOrEqual(
        packageCommands.length
      );
    });
  });

  describe("Specific command registrations", () => {
    it('should register "orchestra.openDashboard"', () => {
      expect(extensionCode).toContain(
        'vscode.commands.registerCommand("orchestra.openDashboard"'
      );
    });

    it('should register "orchestra.refreshStatus"', () => {
      expect(extensionCode).toContain(
        'vscode.commands.registerCommand("orchestra.refreshStatus"'
      );
    });

    it('should register "orchestra.openSprintSettings"', () => {
      expect(extensionCode).toContain(
        'vscode.commands.registerCommand("orchestra.openSprintSettings"'
      );
    });

    it('should register "orchestra.openTaskDetail"', () => {
      expect(extensionCode).toContain('"orchestra.openTaskDetail"');
    });

    it('should register "orchestra.installMcpServers"', () => {
      expect(extensionCode).toContain('"orchestra.installMcpServers"');
    });

    it('should register "orchestra.initializeWorkspace"', () => {
      expect(extensionCode).toContain('"orchestra.initializeWorkspace"');
    });

    it('should register "orchestra.invokeOrchestrator"', () => {
      expect(extensionCode).toContain('"orchestra.invokeOrchestrator"');
    });

    it('should register "orchestra.invokeImplementor"', () => {
      expect(extensionCode).toContain('"orchestra.invokeImplementor"');
    });

    it('should register "orchestra.startTask"', () => {
      expect(extensionCode).toContain('"orchestra.startTask"');
    });

    it('should register "orchestra.deEscalateTask"', () => {
      expect(extensionCode).toContain('"orchestra.deEscalateTask"');
    });

    it('should register "orchestra.moveToGateCheck"', () => {
      expect(extensionCode).toContain('"orchestra.moveToGateCheck"');
    });

    it('should register "orchestra.moveToImplement"', () => {
      expect(extensionCode).toContain('"orchestra.moveToImplement"');
    });

    it('should register "orchestra.forceComplete"', () => {
      expect(extensionCode).toContain('"orchestra.forceComplete"');
    });

    it('should register "orchestra.setActiveSprint"', () => {
      expect(extensionCode).toContain('"orchestra.setActiveSprint"');
    });
  });

  describe("Command registration patterns", () => {
    it("should use proper registerCommand syntax", () => {
      // Should not have syntax errors in command registrations
      const commandBlocks = extensionCode.match(
        /vscode\.commands\.registerCommand\([^)]+\)/g
      );
      expect(commandBlocks).toBeTruthy();
      expect(commandBlocks!.length).toBeGreaterThan(0);
    });

    it("should log command registration completion", () => {
      expect(extensionCode).toContain('logger.info("Commands registered")');
    });

    it("should register commands within activate function", () => {
      // Check that activate function exists and contains registerCommand
      expect(extensionCode).toContain("export async function activate(");

      // Find the section with command registrations
      const hasCommandRegistrations =
        extensionCode.includes("vscode.commands.registerCommand") &&
        extensionCode.includes("export async function activate");

      expect(hasCommandRegistrations).toBe(true);
    });
  });
});

describe("Extension registration - CurrentTaskViewProvider (Task 7)", () => {
  let extensionCode: string;

  beforeEach(() => {
    // Read the actual extension.ts file
    const extensionPath = path.join(__dirname, "..", "src", "extension.ts");
    extensionCode = fs.readFileSync(extensionPath, "utf-8");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("import statement", () => {
    it("should import CurrentTaskViewProvider from correct path", () => {
      expect(extensionCode).toContain(
        'import { CurrentTaskViewProvider } from "./views/webview/CurrentTaskViewProvider.js"'
      );
    });
  });

  describe("provider instantiation", () => {
    it("should instantiate CurrentTaskViewProvider with new keyword", () => {
      expect(extensionCode).toContain("new CurrentTaskViewProvider(");
    });

    it("should pass context.extensionUri as first parameter", () => {
      const instantiationMatch = extensionCode.match(
        /new CurrentTaskViewProvider\(([\s\S]*?)\)/
      );
      expect(instantiationMatch).toBeTruthy();
      if (instantiationMatch) {
        const params = instantiationMatch[1] || "";
        expect(params).toContain("context.extensionUri");
      }
    });

    it("should pass orchestraRoot as second parameter", () => {
      const instantiationMatch = extensionCode.match(
        /new CurrentTaskViewProvider\(([\s\S]*?)\)/
      );
      expect(instantiationMatch).toBeTruthy();
      if (instantiationMatch) {
        const params = instantiationMatch[1] || "";
        expect(params).toContain("orchestraRoot");
      }
    });

    it("should pass dbWatcher as third parameter", () => {
      const instantiationMatch = extensionCode.match(
        /new CurrentTaskViewProvider\(([\s\S]*?)\)/
      );
      expect(instantiationMatch).toBeTruthy();
      if (instantiationMatch) {
        const params = instantiationMatch[1] || "";
        expect(params).toContain("dbWatcher");
      }
    });
  });

  describe("webview view registration", () => {
    it("should register with vscode.window.registerWebviewViewProvider", () => {
      expect(extensionCode).toContain(
        "vscode.window.registerWebviewViewProvider"
      );
    });

    it('should register with view ID "orchestra.currentTask"', () => {
      const registrationMatch = extensionCode.match(
        /registerWebviewViewProvider\(([\s\S]*?)\)/
      );
      expect(registrationMatch).toBeTruthy();
      if (registrationMatch) {
        const params = registrationMatch[1] || "";
        expect(params).toContain('"orchestra.currentTask"');
      }
    });

    it("should pass currentTaskProvider as second parameter to registerWebviewViewProvider", () => {
      const registrationMatch = extensionCode.match(
        /registerWebviewViewProvider\(([\s\S]*?)\)/
      );
      expect(registrationMatch).toBeTruthy();
      if (registrationMatch) {
        const params = registrationMatch[1] || "";
        expect(params).toContain("currentTaskProvider");
      }
    });
  });

  describe("subscription management", () => {
    it("should add registration disposable to context.subscriptions", () => {
      // Check that the registration is wrapped in subscriptions.push
      const registrationBlock = extensionCode.match(
        /context\.subscriptions\.push\(([\s\S]*?)registerWebviewViewProvider([\s\S]*?)\)/
      );
      expect(registrationBlock).toBeTruthy();
    });

    it("should log successful registration", () => {
      // Check for log statement after registration
      expect(extensionCode).toContain(
        'logger.info("Current Task WebviewView registered")'
      );
    });
  });

  describe("placement in activation sequence", () => {
    it("should register after DatabaseWatcher is created", () => {
      const watcherIndex = extensionCode.indexOf("new DatabaseWatcher(");
      const providerIndex = extensionCode.indexOf(
        "new CurrentTaskViewProvider("
      );
      expect(providerIndex).toBeGreaterThan(watcherIndex);
      expect(providerIndex).toBeGreaterThan(-1);
    });

    it("should register before SprintTreeProvider", () => {
      const providerIndex = extensionCode.indexOf(
        "new CurrentTaskViewProvider("
      );
      const treeProviderIndex = extensionCode.indexOf(
        "new SprintTreeProvider("
      );
      expect(providerIndex).toBeLessThan(treeProviderIndex);
      expect(providerIndex).toBeGreaterThan(-1);
    });
  });

  describe("dependency requirements", () => {
    it("should use extensionUri from context (not extensionPath)", () => {
      // Ensure we're using the Uri, not a string path
      const instantiationMatch = extensionCode.match(
        /new CurrentTaskViewProvider\(([\s\S]*?)\)/
      );
      expect(instantiationMatch).toBeTruthy();
      if (instantiationMatch) {
        const params = instantiationMatch[1] || "";
        expect(params).toContain("extensionUri");
        expect(params).not.toMatch(/extensionPath[^]/); // Not using extensionPath in provider
      }
    });

    it("should use orchestraRoot (workspace root string)", () => {
      const instantiationMatch = extensionCode.match(
        /new CurrentTaskViewProvider\(([\s\S]*?)\)/
      );
      expect(instantiationMatch).toBeTruthy();
      if (instantiationMatch) {
        const params = instantiationMatch[1] || "";
        expect(params).toContain("orchestraRoot");
      }
    });

    it("should use dbWatcher instance (not create new)", () => {
      const instantiationMatch = extensionCode.match(
        /new CurrentTaskViewProvider\(([\s\S]*?)\)/
      );
      expect(instantiationMatch).toBeTruthy();
      if (instantiationMatch) {
        const params = instantiationMatch[1] || "";
        // Should pass existing dbWatcher, not create new one
        expect(params).toContain("dbWatcher");
        expect(params).not.toContain("new DatabaseWatcher");
      }
    });
  });

  describe("code comment and organization", () => {
    it("should include Task 7 reference in comment", () => {
      expect(extensionCode).toContain("Task 7");
    });

    it("should be in the correct section (after database watcher, with step 5b)", () => {
      // Check it's numbered as step 5b between 5 and 6
      expect(extensionCode).toMatch(/5b\.\s+Register Current Task WebviewView/);
    });
  });
});

describe("Extension registration - ContextFileResolver (Task 8)", () => {
  let extensionCode: string;

  beforeEach(() => {
    const extensionPath = path.join(__dirname, "..", "src", "extension.ts");
    extensionCode = fs.readFileSync(extensionPath, "utf-8");
  });

  describe("import statement", () => {
    it("should import ContextFileResolver from prompts/ContextFileResolver.js", () => {
      expect(extensionCode).toContain("import { ContextFileResolver } from \"./prompts/ContextFileResolver.js\"");
    });
  });

  describe("module-level variable", () => {
    it("should declare contextFileResolver variable with optional type", () => {
      expect(extensionCode).toMatch(/let contextFileResolver:\s*ContextFileResolver\s*\|\s*undefined/);
    });
  });

  describe("getContextFileResolver export function", () => {
    it("should export getContextFileResolver function", () => {
      expect(extensionCode).toContain("export function getContextFileResolver()");
    });

    it("should return ContextFileResolver type", () => {
      expect(extensionCode).toMatch(/export function getContextFileResolver\(\):\s*ContextFileResolver/);
    });

    it("should throw error if not initialized", () => {
      expect(extensionCode).toContain("if (!contextFileResolver)");
      expect(extensionCode).toContain('throw new Error("ContextFileResolver not initialized');
    });

    it("should return contextFileResolver instance when initialized", () => {
      const functionMatch = extensionCode.match(
        /export function getContextFileResolver\(\):[^{]+{([\s\S]*?)\n}/
      );
      expect(functionMatch).toBeTruthy();
      if (functionMatch) {
        const body = functionMatch[1] || "";
        expect(body).toContain("return contextFileResolver");
      }
    });
  });

  describe("activation and instantiation", () => {
    it("should instantiate ContextFileResolver in activate function", () => {
      expect(extensionCode).toMatch(/contextFileResolver\s*=\s*new ContextFileResolver\(/);
    });

    it("should pass orchestraRoot as constructor parameter", () => {
      expect(extensionCode).toMatch(/new ContextFileResolver\(orchestraRoot\)/);
    });

    it("should initialize after orchestraRoot is detected", () => {
      const orchestraRootIndex = extensionCode.indexOf("Orchestra workspace detected:");
      const initIndex = extensionCode.indexOf("new ContextFileResolver(");
      expect(initIndex).toBeGreaterThan(orchestraRootIndex);
      expect(initIndex).toBeGreaterThan(-1);
    });

    it("should log initialization", () => {
      expect(extensionCode).toContain('logger.info("ContextFileResolver initialized")');
    });

    it("should include Task 8 reference in comment", () => {
      const initMatch = extensionCode.match(
        /\/\/.*ContextFileResolver.*Task 8/i
      );
      expect(initMatch).toBeTruthy();
    });
  });
});
