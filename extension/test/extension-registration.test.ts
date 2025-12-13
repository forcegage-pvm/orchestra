/**
 * Tests for extension.ts - CurrentTaskViewProvider registration
 *
 * Verifies Task 7: CurrentTaskViewProvider is properly registered with required dependencies
 */

import * as fs from "fs";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Extension registration - CurrentTaskViewProvider", () => {
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
