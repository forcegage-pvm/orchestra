/**
 * SessionManager Unit Tests
 *
 * Tests the SessionManager class with mocked VS Code APIs
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { SessionManager } from "../../src/chat/SessionManager.js";
import { ConfigService } from "../../src/config/ConfigService.js";
import { OrchestraLogger } from "../../src/utils/logger.js";

// Mock database mutations - must be hoisted to avoid initialization errors
const { mockSaveSessionLabel, mockClearSessionLabel } = vi.hoisted(() => ({
  mockSaveSessionLabel: vi.fn(),
  mockClearSessionLabel: vi.fn(),
}));

vi.mock("../../src/database/mutations.js", () => ({
  saveSessionLabel: mockSaveSessionLabel,
  clearSessionLabel: mockClearSessionLabel,
}));

// Mock VS Code API
vi.mock("vscode", () => ({
  commands: {
    executeCommand: vi.fn().mockResolvedValue(undefined),
  },
  window: {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      show: vi.fn(),
    })),
    tabGroups: {
      all: [],
      activeTabGroup: {
        activeTab: { label: "Chat", isActive: true },
        tabs: [],
      },
      close: vi.fn().mockResolvedValue(true),
    },
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn(() => "info"),
    })),
    workspaceFolders: [],
  },
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path, scheme: "file", path })),
    from: vi.fn((components: { scheme: string; path: string }) => ({
      scheme: components.scheme,
      path: components.path,
      fsPath: components.path,
      toString: () => `${components.scheme}://${components.path}`,
    })),
  },
}));

describe("SessionManager", () => {
  let sessionManager: SessionManager;
  let mockLogger: OrchestraLogger;
  let mockConfigService: ConfigService;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Reset the mock to default behavior
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

    // Reset database mocks
    mockSaveSessionLabel.mockClear();
    mockClearSessionLabel.mockClear();

    // Create mock dependencies
    mockLogger = new OrchestraLogger();
    vi.spyOn(mockLogger, "info");
    vi.spyOn(mockLogger, "error");
    vi.spyOn(mockLogger, "warn");

    mockConfigService = new ConfigService();
    vi.spyOn(mockConfigService, "getModelForRole").mockReturnValue(
      "claude-sonnet-4"
    );
    vi.spyOn(mockConfigService, "getAgentForRole").mockImplementation(
      (role) => `orchestra.${role}`
    );

    // Create SessionManager instance
    sessionManager = new SessionManager(mockLogger, mockConfigService);
  });

  describe("constructor", () => {
    it("should create SessionManager with dependencies", () => {
      expect(sessionManager).toBeInstanceOf(SessionManager);
    });

    it("should initialize with inactive sessions", () => {
      expect(sessionManager.isOrchestratorActive()).toBe(false);
      expect(sessionManager.isImplementorActive()).toBe(false);
    });
  });

  describe("invokeOrchestrator", () => {
    it("should create new floating window on first call", async () => {
      const prompt = "Test orchestrator prompt";
      const files: vscode.Uri[] = [];

      await sessionManager.invokeOrchestrator(prompt, files);

      // Should call newChatWindow on first invocation
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.newChatWindow"
      );

      // Should log that it's creating a new window
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Creating new orchestrator floating window"
      );
    });

    it("should reuse existing window on subsequent calls", async () => {
      const prompt = "Test orchestrator prompt";
      const files: vscode.Uri[] = [];

      // First call
      await sessionManager.invokeOrchestrator(prompt, files);
      vi.clearAllMocks();

      // Second call
      await sessionManager.invokeOrchestrator(prompt, files);

      // Should NOT call newChatWindow on second invocation
      expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
        "workbench.action.newChatWindow"
      );

      // Should log that it's using existing window
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Using existing orchestrator window"
      );
    });

    it("should send prompt with correct parameters", async () => {
      const prompt = "I'm ready to work as the orchestrator agent.";
      const files = [vscode.Uri.file("/path/to/file1.ts")];

      await sessionManager.invokeOrchestrator(prompt, files);

      // Verify chat.open command was called with correct parameters
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        expect.objectContaining({
          query: prompt,
          isPartialQuery: false,
          mode: "orchestra.orchestrator",
          modelSelector: { id: "claude-sonnet-4" },
          attachFiles: files,
        })
      );
    });

    it("should use configured model from ConfigService", async () => {
      const customModel = "claude-opus-4";
      vi.spyOn(mockConfigService, "getModelForRole").mockReturnValue(
        customModel
      );

      await sessionManager.invokeOrchestrator("Test", []);

      expect(mockConfigService.getModelForRole).toHaveBeenCalledWith(
        "orchestrator"
      );
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        expect.objectContaining({
          modelSelector: { id: customModel },
        })
      );
    });

    it("should set orchestratorActive to true after invocation", async () => {
      expect(sessionManager.isOrchestratorActive()).toBe(false);

      await sessionManager.invokeOrchestrator("Test", []);

      expect(sessionManager.isOrchestratorActive()).toBe(true);
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(vscode.commands.executeCommand).mockRejectedValue(
        new Error("Test error")
      );

      await expect(
        sessionManager.invokeOrchestrator("Test", [])
      ).rejects.toThrow("Test error");

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to invoke orchestrator session",
        expect.any(Error)
      );
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Orchestra: Failed to invoke orchestrator - Test error"
      );
    });

    it("should log invocation details", async () => {
      const prompt = "Test prompt";
      const files = [vscode.Uri.file("/path/to/file.ts")];

      await sessionManager.invokeOrchestrator(prompt, files);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Invoking orchestrator session",
        expect.objectContaining({
          hasFiles: true,
          fileCount: 1,
          model: "claude-sonnet-4",
          agentMode: "orchestra.orchestrator",
          isFirstCall: true,
        })
      );
    });
  });

  describe("invokeImplementor", () => {
    it("should create new chat editor tab", async () => {
      const prompt = "Test implementor prompt";
      const files: vscode.Uri[] = [];

      await sessionManager.invokeImplementor(prompt, files);

      // Should call openChat to create editor tab
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.openChat"
      );
    });

    it("should send prompt with correct parameters", async () => {
      const prompt = "I'm ready to work as the implementor agent.";
      const files = [
        vscode.Uri.file("/path/to/file1.ts"),
        vscode.Uri.file("/path/to/file2.ts"),
      ];

      await sessionManager.invokeImplementor(prompt, files);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        expect.objectContaining({
          query: prompt,
          isPartialQuery: false,
          mode: "orchestra.implementor",
          modelSelector: { id: "claude-sonnet-4" },
          attachFiles: files,
        })
      );
    });

    it("should use configured model from ConfigService", async () => {
      const customModel = "claude-sonnet-3.5";
      vi.spyOn(mockConfigService, "getModelForRole").mockReturnValue(
        customModel
      );

      await sessionManager.invokeImplementor("Test", []);

      expect(mockConfigService.getModelForRole).toHaveBeenCalledWith(
        "implementor"
      );
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        expect.objectContaining({
          modelSelector: { id: customModel },
        })
      );
    });

    it("should set implementorActive to true after invocation", async () => {
      expect(sessionManager.isImplementorActive()).toBe(false);

      await sessionManager.invokeImplementor("Test", []);

      expect(sessionManager.isImplementorActive()).toBe(true);
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(vscode.commands.executeCommand).mockRejectedValue(
        new Error("Test error")
      );

      await expect(
        sessionManager.invokeImplementor("Test", [])
      ).rejects.toThrow("Test error");

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to invoke implementor session",
        expect.any(Error)
      );
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Orchestra: Failed to invoke implementor - Test error"
      );
    });

    it("should log invocation details", async () => {
      const prompt = "Test prompt";
      const files = [vscode.Uri.file("/path/to/file.ts")];

      await sessionManager.invokeImplementor(prompt, files);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Invoking implementor session",
        expect.objectContaining({
          hasFiles: true,
          fileCount: 1,
          model: "claude-sonnet-4",
          agentMode: "orchestra.implementor",
        })
      );
    });

    it("should log success message", async () => {
      await sessionManager.invokeImplementor("Test", []);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Implementor session invoked successfully"
      );
    });
  });

  describe("clearImplementorSession", () => {
    it("should reset implementorActive flag", async () => {
      // First invoke implementor
      await sessionManager.invokeImplementor("Test", []);
      expect(sessionManager.isImplementorActive()).toBe(true);

      // Then clear
      await sessionManager.clearImplementorSession();
      expect(sessionManager.isImplementorActive()).toBe(false);
    });

    it("should log clear action", async () => {
      await sessionManager.invokeImplementor("Test", []);
      vi.clearAllMocks();

      await sessionManager.clearImplementorSession();

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Clearing implementor session",
        expect.objectContaining({
          wasActive: true,
        })
      );
    });
  });

  describe("session state", () => {
    it("isOrchestratorActive should return correct state", async () => {
      expect(sessionManager.isOrchestratorActive()).toBe(false);
      await sessionManager.invokeOrchestrator("Test", []);
      expect(sessionManager.isOrchestratorActive()).toBe(true);
    });

    it("isImplementorActive should return correct state", async () => {
      expect(sessionManager.isImplementorActive()).toBe(false);
      await sessionManager.invokeImplementor("Test", []);
      expect(sessionManager.isImplementorActive()).toBe(true);
    });
  });

  describe("closeAllChatEditorTabs", () => {
    it("should close chat tabs before orchestrator invocation", async () => {
      // Set up mock with chat tabs
      vi.mocked(vscode.window.tabGroups).all = [
        {
          tabs: [
            { label: "Chat", isActive: true },
            { label: "Copilot Chat", isActive: false },
          ],
          activeTab: null,
          viewColumn: 1,
          isActive: true,
        } as unknown as vscode.TabGroup,
      ];

      await sessionManager.invokeOrchestrator("Test", []);

      // Should have attempted to close tabs
      expect(vscode.window.tabGroups.close).toHaveBeenCalled();
    });

    it("should reset implementorActive when closing tabs", async () => {
      // First invoke implementor
      await sessionManager.invokeImplementor("Test", []);
      expect(sessionManager.isImplementorActive()).toBe(true);

      // Then invoke orchestrator (which closes implementor tabs)
      await sessionManager.invokeOrchestrator("Test", []);

      // implementorActive should be reset
      expect(sessionManager.isImplementorActive()).toBe(false);
    });
  });

  describe("integration scenarios", () => {
    it("should handle orchestrator -> implementor -> orchestrator workflow", async () => {
      // Step 1: Orchestrator prepares task
      await sessionManager.invokeOrchestrator("Prepare task 1", []);
      expect(sessionManager.isOrchestratorActive()).toBe(true);

      // Step 2: Implementor works on task
      await sessionManager.invokeImplementor("Implement task 1", []);
      expect(sessionManager.isImplementorActive()).toBe(true);

      // Step 3: Orchestrator verifies
      await sessionManager.invokeOrchestrator("Verify task 1", []);
      expect(sessionManager.isOrchestratorActive()).toBe(true);
      // Implementor tabs should have been closed
      expect(sessionManager.isImplementorActive()).toBe(false);
    });

    it("should allow multiple consecutive orchestrator calls", async () => {
      await sessionManager.invokeOrchestrator("Prepare task 1", []);
      await sessionManager.invokeOrchestrator("Verify task 1", []);
      await sessionManager.invokeOrchestrator("Complete task 1", []);

      expect(sessionManager.isOrchestratorActive()).toBe(true);
    });

    it("should allow multiple consecutive implementor calls", async () => {
      await sessionManager.invokeImplementor("Implement feature A", []);
      await sessionManager.invokeImplementor("Implement feature B", []);

      expect(sessionManager.isImplementorActive()).toBe(true);
    });
  });

  describe("findTabByLabel", () => {
    it("should find tab by exact label match", () => {
      // Set up mock with test tabs
      vi.mocked(vscode.window.tabGroups).all = [
        {
          tabs: [
            { label: "index.ts", isActive: false },
            { label: "Orchestra Orchestrator", isActive: true },
            { label: "package.json", isActive: false },
          ],
          activeTab: null,
          viewColumn: 1,
          isActive: true,
        } as unknown as vscode.TabGroup,
      ];

      const result = sessionManager.findTabByLabel("Orchestra Orchestrator");

      expect(result).not.toBeNull();
      expect(result?.tab.label).toBe("Orchestra Orchestrator");
      expect(result?.index).toBe(1);
      expect(result?.tabGroup).toBeDefined();
    });

    it("should return null when tab is not found", () => {
      // Set up mock with test tabs
      vi.mocked(vscode.window.tabGroups).all = [
        {
          tabs: [
            { label: "index.ts", isActive: false },
            { label: "package.json", isActive: false },
          ],
          activeTab: null,
          viewColumn: 1,
          isActive: true,
        } as unknown as vscode.TabGroup,
      ];

      const result = sessionManager.findTabByLabel("NonExistent Tab");

      expect(result).toBeNull();
    });

    it("should search across multiple tab groups", () => {
      // Set up mock with multiple tab groups
      vi.mocked(vscode.window.tabGroups).all = [
        {
          tabs: [
            { label: "index.ts", isActive: false },
            { label: "README.md", isActive: false },
          ],
          activeTab: null,
          viewColumn: 1,
          isActive: false,
        } as unknown as vscode.TabGroup,
        {
          tabs: [
            { label: "test.ts", isActive: false },
            { label: "Orchestra Implementor", isActive: true },
          ],
          activeTab: null,
          viewColumn: 2,
          isActive: true,
        } as unknown as vscode.TabGroup,
      ];

      const result = sessionManager.findTabByLabel("Orchestra Implementor");

      expect(result).not.toBeNull();
      expect(result?.tab.label).toBe("Orchestra Implementor");
      expect(result?.index).toBe(1);
      expect(result?.tabGroup.viewColumn).toBe(2);
    });

    it("should return first match when multiple tabs have same label", () => {
      // Set up mock with duplicate labels
      vi.mocked(vscode.window.tabGroups).all = [
        {
          tabs: [
            { label: "Chat", isActive: false },
            { label: "index.ts", isActive: false },
          ],
          activeTab: null,
          viewColumn: 1,
          isActive: false,
        } as unknown as vscode.TabGroup,
        {
          tabs: [
            { label: "Chat", isActive: true },
            { label: "package.json", isActive: false },
          ],
          activeTab: null,
          viewColumn: 2,
          isActive: true,
        } as unknown as vscode.TabGroup,
      ];

      const result = sessionManager.findTabByLabel("Chat");

      expect(result).not.toBeNull();
      expect(result?.tab.label).toBe("Chat");
      expect(result?.index).toBe(0);
      expect(result?.tabGroup.viewColumn).toBe(1); // First match from first group
    });

    it("should use exact match, not partial match", () => {
      // Set up mock with similar but different labels
      vi.mocked(vscode.window.tabGroups).all = [
        {
          tabs: [
            { label: "Orchestra Orchestrator", isActive: false },
            { label: "Orchestra Implementor", isActive: false },
            { label: "Orchestra", isActive: false },
          ],
          activeTab: null,
          viewColumn: 1,
          isActive: true,
        } as unknown as vscode.TabGroup,
      ];

      const result = sessionManager.findTabByLabel("Orchestra");

      expect(result).not.toBeNull();
      expect(result?.tab.label).toBe("Orchestra");
      expect(result?.index).toBe(2); // Third tab is exact match
    });

    it("should return null when tabGroups.all is empty", () => {
      // Empty tab groups
      vi.mocked(vscode.window.tabGroups).all = [];

      const result = sessionManager.findTabByLabel("Any Label");

      expect(result).toBeNull();
    });

    it("should return null when all tab groups have empty tabs", () => {
      // Tab groups with no tabs
      vi.mocked(vscode.window.tabGroups).all = [
        {
          tabs: [],
          activeTab: null,
          viewColumn: 1,
          isActive: true,
        } as unknown as vscode.TabGroup,
      ];

      const result = sessionManager.findTabByLabel("Any Label");

      expect(result).toBeNull();
    });
  });

  describe("promptUserToSelectSession", () => {
    beforeEach(() => {
      // Mock workspace folders for workspaceRoot access
      vi.mocked(vscode.workspace).workspaceFolders = [
        {
          uri: vscode.Uri.file("/test/workspace"),
          name: "test-workspace",
          index: 0,
        },
      ] as unknown as readonly vscode.WorkspaceFolder[];

      // Reset showInformationMessage mock
      vi.mocked(vscode.window).showInformationMessage = vi
        .fn()
        .mockResolvedValue(undefined);
    });

    it("should show initial info message to user", async () => {
      await sessionManager.promptUserToSelectSession("orchestrator");

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Orchestrator session not found. Please select from chat history.",
        "Open Chat History",
        "Cancel"
      );
    });

    it("should execute chat history command", async () => {
      // Mock user clicking OK on info message
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
        "Open Chat History" as never
      );

      // Mock user confirming selection
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
        "OK" as never
      );

      // Mock active tab
      vi.mocked(vscode.window.tabGroups).activeTabGroup = {
        activeTab: { label: "Selected Chat", isActive: true },
        tabs: [],
        viewColumn: 1,
        isActive: true,
      } as unknown as vscode.TabGroup;

      await sessionManager.promptUserToSelectSession("implementor");

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.history"
      );
    });

    it("should show modal confirmation dialog", async () => {
      // Mock user clicking OK on info message
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
        "Open Chat History" as never
      );

      // Mock user confirming selection
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
        "OK" as never
      );

      // Mock active tab
      vi.mocked(vscode.window.tabGroups).activeTabGroup = {
        activeTab: { label: "Chat Session", isActive: true },
        tabs: [],
        viewColumn: 1,
        isActive: true,
      } as unknown as vscode.TabGroup;

      await sessionManager.promptUserToSelectSession("orchestrator");

      // Second call should be the modal confirmation
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining("Click OK after selecting"),
        { modal: true },
        "OK",
        "Cancel"
      );
    });

    it("should capture and return selected tab label on success", async () => {
      const expectedLabel = "My Chat Session";

      // Ensure workspace is set up
      const mockWorkspaceFolder = {
        uri: { fsPath: "/test/workspace" },
        name: "test-workspace",
        index: 0,
      };
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [mockWorkspaceFolder],
        writable: true,
        configurable: true,
      });

      // Mock user clicking OK on info message
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
        "Open Chat History" as never
      );

      // Mock user confirming selection
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
        "OK" as never
      );

      // Mock active tab with expected label
      vi.mocked(vscode.window.tabGroups).activeTabGroup = {
        activeTab: { label: expectedLabel, isActive: true },
        tabs: [],
        viewColumn: 1,
        isActive: true,
      } as unknown as vscode.TabGroup;

      const result = await sessionManager.promptUserToSelectSession(
        "orchestrator"
      );

      expect(result).toBe(expectedLabel);
    });

    it("should return null when user cancels initial dialog", async () => {
      // Mock user dismissing the info message
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
        undefined
      );

      const result = await sessionManager.promptUserToSelectSession(
        "implementor"
      );

      expect(result).toBeNull();
      // Should not execute chat history command
      expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
        "workbench.action.chat.history"
      );
    });

    it("should return null when user cancels confirmation dialog", async () => {
      // Mock user clicking OK on info message
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
        "Open Chat History" as never
      );

      // Mock user clicking Cancel on confirmation dialog
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
        "Cancel" as never
      );

      const result = await sessionManager.promptUserToSelectSession(
        "orchestrator"
      );

      expect(result).toBeNull();
    });

    it("should return null when user dismisses confirmation dialog", async () => {
      // Mock user clicking OK on info message
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
        "Open Chat History" as never
      );

      // Mock user dismissing confirmation dialog (undefined)
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
        undefined
      );

      const result = await sessionManager.promptUserToSelectSession(
        "implementor"
      );

      expect(result).toBeNull();
    });

    it("should return null when no active tab is available", async () => {
      // Mock user clicking OK on info message
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
        "Open Chat History" as never
      );

      // Mock user confirming selection
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
        "OK" as never
      );

      // Mock no active tab
      vi.mocked(vscode.window.tabGroups).activeTabGroup = {
        activeTab: null,
        tabs: [],
        viewColumn: 1,
        isActive: true,
      } as unknown as vscode.TabGroup;

      const result = await sessionManager.promptUserToSelectSession(
        "orchestrator"
      );

      expect(result).toBeNull();
    });

    it("should save label to database on successful selection", async () => {
      const expectedLabel = "Chat for Orchestrator";

      // Ensure workspace is set up
      const mockWorkspaceFolder = {
        uri: { fsPath: "/test/workspace" },
        name: "test-workspace",
        index: 0,
      };
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [mockWorkspaceFolder],
        writable: true,
        configurable: true,
      });

      // Mock user clicking OK on info message
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
        "Open Chat History" as never
      );

      // Mock user confirming selection
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
        "OK" as never
      );

      // Mock active tab
      vi.mocked(vscode.window.tabGroups).activeTabGroup = {
        activeTab: { label: expectedLabel, isActive: true },
        tabs: [],
        viewColumn: 1,
        isActive: true,
      } as unknown as vscode.TabGroup;

      const result = await sessionManager.promptUserToSelectSession(
        "orchestrator"
      );

      expect(result).toBe(expectedLabel);
      expect(mockSaveSessionLabel).toHaveBeenCalledWith(
        "/test/workspace",
        "orchestrator",
        expectedLabel
      );
    });

    it("should handle both orchestrator and implementor roles", async () => {
      const roles: Array<"orchestrator" | "implementor"> = [
        "orchestrator",
        "implementor",
      ];

      for (const role of roles) {
        vi.clearAllMocks();

        // Ensure workspace is set up
        const mockWorkspaceFolder = {
          uri: { fsPath: "/test/workspace" },
          name: "test-workspace",
          index: 0,
        };
        Object.defineProperty(vscode.workspace, "workspaceFolders", {
          value: [mockWorkspaceFolder],
          writable: true,
          configurable: true,
        });

        // Mock user clicking OK on info message
        vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
          "Open Chat History" as never
        );

        // Mock user confirming selection
        vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
          "OK" as never
        );

        // Mock active tab
        vi.mocked(vscode.window.tabGroups).activeTabGroup = {
          activeTab: { label: `Chat for ${role}`, isActive: true },
          tabs: [],
          viewColumn: 1,
          isActive: true,
        } as unknown as vscode.TabGroup;

        const result = await sessionManager.promptUserToSelectSession(role);

        expect(result).toBe(`Chat for ${role}`);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          expect.stringContaining(role.charAt(0).toUpperCase() + role.slice(1)),
          expect.anything(),
          expect.anything()
        );
      }
    });
  });
});
