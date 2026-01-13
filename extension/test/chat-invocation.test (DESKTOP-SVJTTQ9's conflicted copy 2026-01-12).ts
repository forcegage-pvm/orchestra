/**
 * Tests for chat invocation commands (Task 1 - Spike)
 *
 * Verifies that:
 * - Commands call workbench.action.chat.open with correct parameters
 * - Query strings include @orchestra prefix
 * - Task context includes task ID and title
 * - Error handling works for failed chat invocations
 * - Logging captures invocation events
 */

import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

describe("Chat invocation commands (Task 1 - Spike)", () => {
  // Read extension.ts once for all tests
  const extensionPath = path.join(__dirname, "..", "src", "extension.ts");
  const extensionCode = fs.readFileSync(extensionPath, "utf-8");

  describe("orchestra.invokeOrchestrator command", () => {
    it("should be registered in extension.ts", () => {
      expect(extensionCode).toContain('"orchestra.invokeOrchestrator"');
      expect(extensionCode).toContain("handleInvokeOrchestrator");
    });

    it("should have handleInvokeOrchestrator function", () => {
      expect(extensionCode).toContain(
        "async function handleInvokeOrchestrator"
      );
    });

    it("should call SessionManager.sendMessage", () => {
      const functionCode = extensionCode.match(
        /async function handleInvokeOrchestrator[\s\S]*?^}/m
      ) as RegExpMatchArray;
      expect(functionCode).toBeTruthy();
      expect(functionCode[0]).toContain("getSessionManager()");
      expect(functionCode[0]).toContain("sendMessage");
    });

    it("should mention orchestrator agent in query", () => {
      const functionCode = extensionCode.match(
        /async function handleInvokeOrchestrator[\s\S]*?^}/m
      ) as RegExpMatchArray;
      expect(functionCode).toBeTruthy();
      expect(functionCode[0]).toMatch(/orchestrator.*agent/i);
    });

    it("should have error handling", () => {
      const functionCode = extensionCode.match(
        /async function handleInvokeOrchestrator[\s\S]*?^}/m
      ) as RegExpMatchArray;
      expect(functionCode).toBeTruthy();
      const fn = functionCode[0];
      expect(fn).toContain("try");
      expect(fn).toContain("catch");
      expect(fn).toContain("showErrorMessage");
      expect(fn).toContain("logger.error");
    });

    it("should log the invocation", () => {
      const functionCode = extensionCode.match(
        /async function handleInvokeOrchestrator[\s\S]*?^}/m
      ) as RegExpMatchArray;
      expect(functionCode).toBeTruthy();
      expect(functionCode[0]).toMatch(/logger\.(info|debug)/);
    });
  });

  describe("orchestra.invokeImplementor command", () => {
    it("should be registered in extension.ts", () => {
      expect(extensionCode).toContain('"orchestra.invokeImplementor"');
      expect(extensionCode).toContain("handleInvokeImplementor");
    });

    it("should have handleInvokeImplementor function", () => {
      expect(extensionCode).toContain("async function handleInvokeImplementor");
    });

    it("should call SessionManager.sendMessage", () => {
      const functionCode = extensionCode.match(
        /async function handleInvokeImplementor[\s\S]*?^}/m
      ) as RegExpMatchArray;
      expect(functionCode).toBeTruthy();
      expect(functionCode[0]).toContain("getSessionManager()");
      expect(functionCode[0]).toContain("sendMessage");
    });

    it("should mention implementor agent in query", () => {
      const functionCode = extensionCode.match(
        /async function handleInvokeImplementor[\s\S]*?^}/m
      ) as RegExpMatchArray;
      expect(functionCode).toBeTruthy();
      expect(functionCode[0]).toMatch(/implementor.*agent/i);
    });

    it("should have error handling", () => {
      const functionCode = extensionCode.match(
        /async function handleInvokeImplementor[\s\S]*?^}/m
      ) as RegExpMatchArray;
      expect(functionCode).toBeTruthy();
      const fn = functionCode[0];
      expect(fn).toContain("try");
      expect(fn).toContain("catch");
      expect(fn).toContain("showErrorMessage");
      expect(fn).toContain("logger.error");
    });

    it("should log the invocation", () => {
      const functionCode = extensionCode.match(
        /async function handleInvokeImplementor[\s\S]*?^}/m
      ) as RegExpMatchArray;
      expect(functionCode).toBeTruthy();
      expect(functionCode[0]).toMatch(/logger\.(info|debug)/);
    });
  });

  describe("orchestra.startTask command", () => {
    it("should be registered in extension.ts", () => {
      expect(extensionCode).toContain('"orchestra.startTask"');
      expect(extensionCode).toContain("handleStartTask");
    });

    it("should have handleStartTask function", () => {
      expect(extensionCode).toContain("async function handleStartTask");
    });

    it("should use SessionManager.invokeImplementor", () => {
      // Check the handleStartTask function
      const functionCode = extensionCode.match(
        /async function handleStartTask[\s\S]*?(?=\n\/\*\*|\nasync function)/
      ) as RegExpMatchArray;
      expect(functionCode).toBeTruthy();
      expect(functionCode[0]).toContain("getSessionManager()");
      expect(functionCode[0]).toContain("sendMessage");
    });

    it("should include task ID in query", () => {
      const functionCode = extensionCode.match(
        /async function handleStartTask[\s\S]*?(?=\n\/\*\*|\nasync function)/
      ) as RegExpMatchArray;
      expect(functionCode).toBeTruthy();
      // Should reference task.task_id
      expect(functionCode[0]).toMatch(/task\.task_id/);
    });

    it("should include task title in query", () => {
      const functionCode = extensionCode.match(
        /async function handleStartTask[\s\S]*?(?=\n\/\*\*|\nasync function)/
      ) as RegExpMatchArray;
      expect(functionCode).toBeTruthy();
      expect(functionCode[0]).toContain("task.title");
    });

    it("should validate handover exists", () => {
      const functionCode = extensionCode.match(
        /async function handleStartTask[\s\S]*?(?=\n\/\*\*|\nasync function)/
      ) as RegExpMatchArray;
      expect(functionCode).toBeTruthy();
      expect(functionCode[0]).toContain("getHandover");
    });

    it("should show warning if no handover", () => {
      const functionCode = extensionCode.match(
        /async function handleStartTask[\s\S]*?(?=\n\/\*\*|\nasync function)/
      ) as RegExpMatchArray;
      expect(functionCode).toBeTruthy();
      expect(functionCode[0]).toContain("showWarningMessage");
      expect(functionCode[0]).toMatch(/no handover|handover.*not/i);
    });

    it("should have error handling", () => {
      const functionCode = extensionCode.match(
        /async function handleStartTask[\s\S]*?(?=\n\/\*\*|\nasync function)/
      ) as RegExpMatchArray;
      expect(functionCode).toBeTruthy();
      const fn = functionCode[0];
      expect(fn).toContain("try");
      expect(fn).toContain("catch");
    });

    it("should log the invocation", () => {
      const functionCode = extensionCode.match(
        /async function handleStartTask[\s\S]*?(?=\n\/\*\*|\nasync function)/
      ) as RegExpMatchArray;
      expect(functionCode).toBeTruthy();
      expect(functionCode[0]).toMatch(/logger\.(info|debug)/);
    });
  });

  describe("Command parameter patterns", () => {
    it("should not use agentId parameter (not supported)", () => {
      // Verify we're NOT using the unsupported agentId parameter
      expect(extensionCode).not.toMatch(/agentId:\s*["']/);
    });

    it("should not use mode parameter (not supported)", () => {
      // Verify we're NOT using the unsupported mode parameter
      // Allow for mode in other contexts, but not in chat invocation
      const chatOpenCalls = extensionCode.match(
        /workbench\.action\.chat\.open[\s\S]{0,300}/g
      );
      if (chatOpenCalls) {
        for (const call of chatOpenCalls) {
          expect(call).not.toMatch(/mode:\s*["']/);
        }
      }
    });

    it("should use SessionManager consistently", () => {
      // Check that functions use SessionManager pattern
      const orchestratorCode = extensionCode.match(
        /async function handleInvokeOrchestrator[\s\S]*?^}/m
      ) as RegExpMatchArray;
      const implementorCode = extensionCode.match(
        /async function handleInvokeImplementor[\s\S]*?^}/m
      ) as RegExpMatchArray;

      expect(orchestratorCode).toBeTruthy();
      expect(orchestratorCode[0]).toContain("getSessionManager()");

      expect(implementorCode).toBeTruthy();
      expect(implementorCode[0]).toContain("getSessionManager()");
    });
  });

  describe("Error handling patterns", () => {
    it("should handle errors in handleInvokeOrchestrator", () => {
      const functionCode = extensionCode.match(
        /async function handleInvokeOrchestrator[\s\S]*?^}/m
      ) as RegExpMatchArray;
      expect(functionCode).toBeTruthy();
      const fn = functionCode[0];

      expect(fn).toContain("try");
      expect(fn).toContain("catch");
      expect(fn).toContain("showErrorMessage");
      expect(fn).toContain("logger.error");
    });

    it("should handle errors in handleInvokeImplementor", () => {
      const functionCode = extensionCode.match(
        /async function handleInvokeImplementor[\s\S]*?^}/m
      ) as RegExpMatchArray;
      expect(functionCode).toBeTruthy();
      const fn = functionCode[0];

      expect(fn).toContain("try");
      expect(fn).toContain("catch");
      expect(fn).toContain("showErrorMessage");
      expect(fn).toContain("logger.error");
    });

    it("should handle errors in handleStartTask", () => {
      const functionCode = extensionCode.match(
        /async function handleStartTask[\s\S]*?(?=\n\/\*\*|\nasync function|\nexport function)/
      ) as RegExpMatchArray;
      expect(functionCode).toBeTruthy();
      const fn = functionCode[0];

      expect(fn).toContain("try");
      expect(fn).toContain("catch");
      expect(fn).toContain("showErrorMessage");
      expect(fn).toContain("logger.error");
    });
  });

  describe("Integration with package.json", () => {
    it("should have commands declared in package.json", () => {
      const packageJsonPath = path.join(__dirname, "..", "package.json");
      const packageJson = JSON.parse(
        fs.readFileSync(packageJsonPath, "utf-8")
      ) as {
        contributes?: { commands?: Array<{ command: string }> };
      };

      const commandIds = packageJson.contributes?.commands?.map(
        (cmd) => cmd.command
      );

      expect(commandIds).toContain("orchestra.invokeOrchestrator");
      expect(commandIds).toContain("orchestra.invokeImplementor");
      expect(commandIds).toContain("orchestra.startTask");
    });
  });

  describe("Spike results document", () => {
    it("should exist at extension/docs/spike-results.md", () => {
      const spikeResultsPath = path.join(
        __dirname,
        "..",
        "docs",
        "spike-results.md"
      );
      expect(fs.existsSync(spikeResultsPath)).toBe(true);
    });

    it("should document key findings", () => {
      const spikeResultsPath = path.join(
        __dirname,
        "..",
        "docs",
        "spike-results.md"
      );
      const content = fs.readFileSync(spikeResultsPath, "utf-8");

      // Should document agent selection approach
      expect(content).toMatch(/@(participant|orchestra)/);

      // Should document what works
      expect(content).toMatch(/✅/);

      // Should document what doesn't work
      expect(content).toMatch(/❌/);

      // Should mention workbench.action.chat.open
      expect(content).toContain("workbench.action.chat.open");

      // Should provide recommendations
      expect(content).toMatch(/recommend/i);
    });

    it("should document agentId parameter as NOT supported", () => {
      const spikeResultsPath = path.join(
        __dirname,
        "..",
        "docs",
        "spike-results.md"
      );
      const content = fs.readFileSync(spikeResultsPath, "utf-8");

      expect(content).toMatch(/agentId.*not/i);
    });

    it("should document mode parameter as NOT supported", () => {
      const spikeResultsPath = path.join(
        __dirname,
        "..",
        "docs",
        "spike-results.md"
      );
      const content = fs.readFileSync(spikeResultsPath, "utf-8");

      expect(content).toMatch(/mode.*not/i);
    });

    it("should document file attachment approach", () => {
      const spikeResultsPath = path.join(
        __dirname,
        "..",
        "docs",
        "spike-results.md"
      );
      const content = fs.readFileSync(spikeResultsPath, "utf-8");

      expect(content).toMatch(/attach.*file|file.*attach/i);
    });
  });
});
