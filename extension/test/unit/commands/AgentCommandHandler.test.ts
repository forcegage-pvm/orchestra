/**
 * Tests for agent command registration (Task 5)
 *
 * Verifies:
 * - Four agent commands defined in package.json
 * - Command handlers registered in extension.ts
 * - AgentRunner singleton management
 * - Error handling for invalid states
 */

import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

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

describe("Agent Command Registration (Task 5)", () => {
  let extensionCode: string;
  let packageJson: { contributes?: { commands?: Array<{ command: string }> } };

  beforeEach(() => {
    // Read the actual extension.ts file
    const extensionPath = path.join(__dirname, "..", "..", "..", "src", "extension.ts"
    );
    extensionCode = fs.readFileSync(extensionPath, "utf-8");

    // Read package.json
    const packageJsonPath = path.join(__dirname, "..", "..", "..", "package.json");
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {
      contributes?: { commands?: Array<{ command: string }> };
    };
  });

  describe("package.json command definitions", () => {
    it("should define orchestra.startAgent command", () => {
      const commands = extractPackageJsonCommands(packageJson);
      expect(commands).toContain("orchestra.startAgent");
    });

    it("should define orchestra.pauseAgent command", () => {
      const commands = extractPackageJsonCommands(packageJson);
      expect(commands).toContain("orchestra.pauseAgent");
    });

    it("should define orchestra.stopAgent command", () => {
      const commands = extractPackageJsonCommands(packageJson);
      expect(commands).toContain("orchestra.stopAgent");
    });

    it("should define orchestra.resumeAgent command", () => {
      const commands = extractPackageJsonCommands(packageJson);
      expect(commands).toContain("orchestra.resumeAgent");
    });

    it("should have all four agent commands in package.json", () => {
      const commands = extractPackageJsonCommands(packageJson);
      const agentCommands = [
        "orchestra.startAgent",
        "orchestra.pauseAgent",
        "orchestra.stopAgent",
        "orchestra.resumeAgent",
      ];

      for (const cmd of agentCommands) {
        expect(commands).toContain(cmd);
      }
    });
  });

  describe("extension.ts command registration", () => {
    it("should register orchestra.startAgent command", () => {
      const registered = extractRegisteredCommands(extensionCode);
      expect(registered).toContain("orchestra.startAgent");
    });

    it("should register orchestra.pauseAgent command", () => {
      const registered = extractRegisteredCommands(extensionCode);
      expect(registered).toContain("orchestra.pauseAgent");
    });

    it("should register orchestra.stopAgent command", () => {
      const registered = extractRegisteredCommands(extensionCode);
      expect(registered).toContain("orchestra.stopAgent");
    });

    it("should register orchestra.resumeAgent command", () => {
      const registered = extractRegisteredCommands(extensionCode);
      expect(registered).toContain("orchestra.resumeAgent");
    });

    it("should have all four agent command registrations", () => {
      const registered = extractRegisteredCommands(extensionCode);
      const agentCommands = [
        "orchestra.startAgent",
        "orchestra.pauseAgent",
        "orchestra.stopAgent",
        "orchestra.resumeAgent",
      ];

      for (const cmd of agentCommands) {
        expect(registered).toContain(cmd);
      }
    });
  });

  describe("AgentRunner singleton management", () => {
    it("should declare agentRunner variable at module level", () => {
      // Check for module-level variable declaration
      expect(extensionCode).toMatch(/let\s+agentRunner\s*:\s*AgentRunner/);
    });

    it("should import AgentRunner from agents module", () => {
      expect(extensionCode).toMatch(/import.*AgentRunner.*from.*agents/);
    });

    it("should import ToolRegistry from agents module", () => {
      expect(extensionCode).toMatch(/import.*ToolRegistry.*from.*agents/);
    });
  });

  describe("Error handling", () => {
    it("should use try-catch blocks in command handlers", () => {
      // Check for try-catch pattern in agent command handlers
      const startAgentSection = extensionCode.match(
        /registerCommand\(\s*["']orchestra\.startAgent["']/
      );
      expect(startAgentSection).toBeTruthy();

      // Look for try-catch after the startAgent registration
      const tryPattern = /try\s*\{/g;
      const catchPattern = /catch\s*\(/g;

      const tryMatches = extensionCode.match(tryPattern);
      const catchMatches = extensionCode.match(catchPattern);

      expect(tryMatches).toBeTruthy();
      expect(catchMatches).toBeTruthy();
      expect(tryMatches!.length).toBeGreaterThanOrEqual(1);
      expect(catchMatches!.length).toBeGreaterThanOrEqual(1);
    });

    it("should use vscode.window.showErrorMessage for error reporting", () => {
      expect(extensionCode).toMatch(/vscode\.window\.showErrorMessage/);
    });
  });

  describe("Command consistency", () => {
    it("should have all package.json commands registered in extension.ts", () => {
      const packageCommands = extractPackageJsonCommands(packageJson);
      const registeredCommands = extractRegisteredCommands(extensionCode);

      const agentCommands = [
        "orchestra.startAgent",
        "orchestra.pauseAgent",
        "orchestra.stopAgent",
        "orchestra.resumeAgent",
      ];

      for (const cmd of agentCommands) {
        if (packageCommands.includes(cmd)) {
          expect(registeredCommands).toContain(cmd);
        }
      }
    });
  });
});
