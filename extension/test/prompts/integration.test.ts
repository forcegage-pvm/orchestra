/**
 * Integration tests for Prompt System
 *
 * Verifies that PromptBuilder and ContextFileResolver work together correctly
 * in a full workflow simulation (PREPARE → IMPLEMENT → VERIFY → RETRY).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { Handover } from "../../src/database/queries.js";
import { ContextFileResolver } from "../../src/prompts/ContextFileResolver.js";
import {
  PromptBuilder,
  type PromptContext,
  type Sprint,
  type Task,
} from "../../src/prompts/PromptBuilder.js";

// Mock database queries
vi.mock("../../src/database/queries.js", () => ({
  getHandover: vi.fn(),
}));

// Mock fs for ContextFileResolver
vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

describe("Prompt System Integration", () => {
  let builder: PromptBuilder;
  let workspaceRoot: string;
  let getHandoverMock: ReturnType<typeof vi.fn>;
  let existsSyncMock: ReturnType<typeof vi.fn>;

  // Shared test fixtures
  const mockTask: Task = {
    task_id: 42,
    title: "Implement Authentication Service",
    category: "feature",
    phase_id: "core",
    description:
      "Create authentication service with JWT token generation and validation. Support user login, logout, and token refresh.",
  };

  const mockSprint: Sprint = {
    sprint_id: "003B",
    title: "Security & Auth Sprint",
  };

  const mockHandover: Handover = {
    id: 1,
    task_id: 42,
    priority: "P1",
    context:
      "Authentication is critical for the app. Use JWT tokens with RS256 signing.",
    context_files: JSON.stringify([
      "src/auth/types.ts",
      "src/auth/jwt.ts",
      "docs/security-spec.md",
    ]),
    acceptance_criteria: JSON.stringify([
      { criterion: "AuthService class exists", verification: "File check" },
      { criterion: "JWT token generation works", verification: "Unit test" },
    ]),
    file_operations: JSON.stringify([
      { operation: "CREATE", path: "src/auth/AuthService.ts" },
      { operation: "UPDATE", path: "src/auth/index.ts" },
    ]),
    deliverables: JSON.stringify(["AuthService.ts", "AuthService.test.ts"]),
    test_file: "test/auth/AuthService.test.ts",
    test_requirements: "Unit tests with 90%+ coverage",
    constraints: "Must use RS256 algorithm",
    reference_links: "https://jwt.io",
    created_at: "2025-12-19T10:00:00Z",
    updated_at: "2025-12-19T10:00:00Z",
  };

  beforeEach(async () => {
    builder = new PromptBuilder();
    workspaceRoot =
      process.platform === "win32" ? "C:\\test\\workspace" : "/test/workspace";

    // Get mocks
    const queries = await import("../../src/database/queries.js");
    getHandoverMock = queries.getHandover as ReturnType<typeof vi.fn>;

    const fs = await import("fs");
    existsSyncMock = fs.existsSync as ReturnType<typeof vi.fn>;

    // Reset mocks
    getHandoverMock.mockReset();
    existsSyncMock.mockReset();

    // Default: all files exist
    existsSyncMock.mockReturnValue(true);
  });

  describe("PromptBuilder generates all 4 stage prompts", () => {
    it("should generate PREPARE stage prompt with correct structure", () => {
      const context: PromptContext = {
        task: mockTask,
        sprint: mockSprint,
      };

      const prompt = builder.buildPreparePrompt(context);

      expect(prompt).toBeTruthy();
      expect(prompt).toContain("As Orchestrator");
      expect(prompt).toContain("Task 42");
      expect(prompt).toContain("Implement Authentication Service");
      expect(prompt).toContain("003B");
      expect(prompt).toContain("Security & Auth Sprint");
    });

    it("should generate IMPLEMENT stage prompt with correct structure", () => {
      const context: PromptContext = {
        task: mockTask,
        sprint: mockSprint,
        handoverPath: ".orchestra/handover/task-42.md",
      };

      const prompt = builder.buildImplementPrompt(context);

      expect(prompt).toBeTruthy();
      expect(prompt).toContain("As Implementor");
      expect(prompt).toContain("Task 42");
      expect(prompt).toContain("Implement Authentication Service");
      expect(prompt).toContain(".orchestra/handover/task-42.md");
    });

    it("should generate VERIFY stage prompt with correct structure", () => {
      const context: PromptContext = {
        task: mockTask,
        sprint: mockSprint,
      };

      const prompt = builder.buildVerifyPrompt(context);

      expect(prompt).toBeTruthy();
      expect(prompt).toContain("As Orchestrator");
      expect(prompt).toContain("verify Task 42");
      expect(prompt).toContain("Implement Authentication Service");
    });

    it("should generate RETRY stage prompt with correct structure", () => {
      const context: PromptContext = {
        task: mockTask,
        sprint: mockSprint,
        feedbackPath: ".orchestra/feedback/task-42-attempt-1.md",
        retryCount: 1,
        maxRetries: 3,
      };

      const prompt = builder.buildRetryPrompt(context);

      expect(prompt).toBeTruthy();
      expect(prompt).toContain("As Implementor");
      expect(prompt).toContain("Task 42");
      expect(prompt).toContain("did not pass verification");
      expect(prompt).toContain("Retry Attempt 1");
      expect(prompt).toContain(".orchestra/feedback/task-42-attempt-1.md");
    });

    it("should generate all 4 prompts with shared context", () => {
      const baseContext: PromptContext = {
        task: mockTask,
        sprint: mockSprint,
      };

      const preparePrompt = builder.buildPreparePrompt(baseContext);
      const implementPrompt = builder.buildImplementPrompt({
        ...baseContext,
        handoverPath: ".orchestra/handover/task-42.md",
      });
      const verifyPrompt = builder.buildVerifyPrompt(baseContext);
      const retryPrompt = builder.buildRetryPrompt({
        ...baseContext,
        feedbackPath: ".orchestra/feedback/task-42-attempt-1.md",
        retryCount: 1,
      });

      // All prompts should be non-empty
      expect(preparePrompt.length).toBeGreaterThan(0);
      expect(implementPrompt.length).toBeGreaterThan(0);
      expect(verifyPrompt.length).toBeGreaterThan(0);
      expect(retryPrompt.length).toBeGreaterThan(0);

      // All prompts should mention the task
      expect(preparePrompt).toContain("Task 42");
      expect(implementPrompt).toContain("Task 42");
      expect(verifyPrompt).toContain("Task 42");
      expect(retryPrompt).toContain("Task 42");
    });
  });

  describe("ContextFileResolver resolves handover context_files", () => {
    it("should resolve context files from handover data", () => {
      const resolver = new ContextFileResolver(workspaceRoot);
      getHandoverMock.mockReturnValue(mockHandover);

      const uris = resolver.getContextFiles(42);

      expect(getHandoverMock).toHaveBeenCalledWith(workspaceRoot, 42);
      expect(uris).toHaveLength(3);
      expect(uris[0]).toBeInstanceOf(vscode.Uri);
      expect(uris[1]).toBeInstanceOf(vscode.Uri);
      expect(uris[2]).toBeInstanceOf(vscode.Uri);
    });

    it("should return empty array for null handover", () => {
      const resolver = new ContextFileResolver(workspaceRoot);
      getHandoverMock.mockReturnValue(null);

      const uris = resolver.getContextFiles(999);

      expect(uris).toEqual([]);
    });

    it("should filter out non-existent files", () => {
      const resolver = new ContextFileResolver(workspaceRoot);
      getHandoverMock.mockReturnValue(mockHandover);

      // First file exists, second doesn't, third exists
      existsSyncMock.mockImplementation((path: string) => {
        return !path.includes("jwt.ts");
      });

      const uris = resolver.getContextFiles(42);

      expect(uris).toHaveLength(2);
    });

    it("should get context files with existence status", () => {
      const resolver = new ContextFileResolver(workspaceRoot);
      getHandoverMock.mockReturnValue(mockHandover);

      existsSyncMock.mockImplementation((path: string) => {
        return !path.includes("security-spec.md");
      });

      const filesWithStatus = resolver.getContextFilesWithStatus(42);

      expect(filesWithStatus).toHaveLength(3);
      expect(filesWithStatus[0].exists).toBe(true);
      expect(filesWithStatus[1].exists).toBe(true);
      expect(filesWithStatus[2].exists).toBe(false);
      expect(filesWithStatus[2].uri).toBeInstanceOf(vscode.Uri);
    });
  });

  describe("Full workflow simulation", () => {
    it("should simulate PREPARE → IMPLEMENT → VERIFY → RETRY workflow", () => {
      const resolver = new ContextFileResolver(workspaceRoot);
      getHandoverMock.mockReturnValue(mockHandover);

      // PREPARE stage - Orchestrator prepares task
      const prepareContext: PromptContext = {
        task: mockTask,
        sprint: mockSprint,
      };
      const preparePrompt = builder.buildPreparePrompt(prepareContext);

      expect(preparePrompt).toContain("prepare Task 42");
      expect(preparePrompt).toContain("get_task");
      expect(preparePrompt).toContain("prepare_task");

      // Orchestrator creates handover (simulated by mocking)
      const contextFiles = resolver.getContextFiles(42);
      expect(contextFiles).toHaveLength(3);

      // IMPLEMENT stage - Implementor receives handover
      const implementContext: PromptContext = {
        task: mockTask,
        sprint: mockSprint,
        handoverPath: ".orchestra/handover/task-42.md",
      };
      const implementPrompt = builder.buildImplementPrompt(implementContext);

      expect(implementPrompt).toContain("assigned Task 42");
      expect(implementPrompt).toContain("get_current_task");
      expect(implementPrompt).toContain("signal_completion");
      expect(implementPrompt).toContain(".orchestra/handover/task-42.md");

      // Implementor signals completion (simulated)
      // ...

      // VERIFY stage - Orchestrator verifies
      const verifyContext: PromptContext = {
        task: mockTask,
        sprint: mockSprint,
      };
      const verifyPrompt = builder.buildVerifyPrompt(verifyContext);

      expect(verifyPrompt).toContain("verify Task 42");
      expect(verifyPrompt).toContain("get_signal");
      expect(verifyPrompt).toContain("run_verification_checks");
      expect(verifyPrompt).toContain("submit_verification_judgment");

      // Verification fails (simulated) → RETRY stage
      const retryContext: PromptContext = {
        task: mockTask,
        sprint: mockSprint,
        feedbackPath: ".orchestra/feedback/task-42-attempt-1.md",
        retryCount: 1,
        maxRetries: 3,
      };
      const retryPrompt = builder.buildRetryPrompt(retryContext);

      expect(retryPrompt).toContain("did not pass verification");
      expect(retryPrompt).toContain("Retry Attempt 1");
      expect(retryPrompt).toContain("get_current_task");
      expect(retryPrompt).toContain("get_feedback");
      expect(retryPrompt).toContain("signal_completion");
      expect(retryPrompt).toContain(".orchestra/feedback/task-42-attempt-1.md");
    });

    it("should handle task with no context files", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      const handoverWithoutContext: Handover = {
        ...mockHandover,
        context_files: null,
      };
      getHandoverMock.mockReturnValue(handoverWithoutContext);

      const contextFiles = resolver.getContextFiles(42);
      expect(contextFiles).toEqual([]);

      // Workflow should still proceed
      const implementContext: PromptContext = {
        task: mockTask,
        sprint: mockSprint,
        handoverPath: ".orchestra/handover/task-42.md",
      };
      const implementPrompt = builder.buildImplementPrompt(implementContext);

      expect(implementPrompt).toContain("assigned Task 42");
      expect(implementPrompt).toContain("get_current_task");
    });

    it("should handle multiple retry attempts", () => {
      const retryAttempts = [1, 2, 3];

      for (const attempt of retryAttempts) {
        const retryContext: PromptContext = {
          task: mockTask,
          sprint: mockSprint,
          feedbackPath: `.orchestra/feedback/task-42-attempt-${attempt}.md`,
          retryCount: attempt,
          maxRetries: 3,
        };
        const retryPrompt = builder.buildRetryPrompt(retryContext);

        expect(retryPrompt).toContain(`Retry Attempt ${attempt}`);
        expect(retryPrompt).toContain(`task-42-attempt-${attempt}.md`);
        expect(retryPrompt).toContain("did not pass verification");
      }
    });
  });

  describe("MCP tool references in prompts", () => {
    it("should reference correct tools in PREPARE prompt", () => {
      const context: PromptContext = {
        task: mockTask,
        sprint: mockSprint,
      };

      const prompt = builder.buildPreparePrompt(context);

      // Orchestrator tools for PREPARE stage
      expect(prompt).toContain("get_task");
      expect(prompt).toContain("prepare_task");

      // Should NOT contain implementor tools
      expect(prompt).not.toContain("signal_completion");
      expect(prompt).not.toContain("get_feedback");
    });

    it("should reference correct tools in IMPLEMENT prompt", () => {
      const context: PromptContext = {
        task: mockTask,
        sprint: mockSprint,
        handoverPath: ".orchestra/handover/task-42.md",
      };

      const prompt = builder.buildImplementPrompt(context);

      // Implementor tools for IMPLEMENT stage
      expect(prompt).toContain("get_current_task");
      expect(prompt).toContain("signal_completion");

      // Should NOT contain orchestrator tools
      expect(prompt).not.toContain("prepare_task");
      expect(prompt).not.toContain("get_signal");
      expect(prompt).not.toContain("run_verification_checks");
    });

    it("should reference correct tools in VERIFY prompt", () => {
      const context: PromptContext = {
        task: mockTask,
        sprint: mockSprint,
      };

      const prompt = builder.buildVerifyPrompt(context);

      // Orchestrator tools for VERIFY stage
      expect(prompt).toContain("get_signal");
      expect(prompt).toContain("run_verification_checks");
      expect(prompt).toContain("submit_verification_judgment");

      // Should NOT contain implementor tools
      expect(prompt).not.toContain("signal_completion");
      expect(prompt).not.toContain("get_feedback");
    });

    it("should reference correct tools in RETRY prompt", () => {
      const context: PromptContext = {
        task: mockTask,
        sprint: mockSprint,
        feedbackPath: ".orchestra/feedback/task-42-attempt-1.md",
        retryCount: 1,
      };

      const prompt = builder.buildRetryPrompt(context);

      // Implementor tools for RETRY stage
      expect(prompt).toContain("get_current_task");
      expect(prompt).toContain("get_feedback");
      expect(prompt).toContain("signal_completion");

      // Should NOT contain orchestrator-only verification tools
      expect(prompt).not.toContain("run_verification_checks");
      expect(prompt).not.toContain("submit_verification_judgment");
    });

    it("should maintain tool separation between orchestrator and implementor", () => {
      const context: PromptContext = {
        task: mockTask,
        sprint: mockSprint,
      };

      const preparePrompt = builder.buildPreparePrompt(context);
      const implementPrompt = builder.buildImplementPrompt({
        ...context,
        handoverPath: ".orchestra/handover/task-42.md",
      });
      const verifyPrompt = builder.buildVerifyPrompt(context);
      const retryPrompt = builder.buildRetryPrompt({
        ...context,
        feedbackPath: ".orchestra/feedback/task-42-attempt-1.md",
        retryCount: 1,
      });

      // Orchestrator-only tools
      const orchestratorTools = [
        "get_task",
        "prepare_task",
        "get_signal",
        "run_verification_checks",
        "submit_verification_judgment",
      ];

      // Implementor-only tools
      const implementorTools = [
        "get_current_task",
        "signal_completion",
        "get_feedback",
      ];

      // Prepare and Verify are orchestrator stages
      for (const tool of orchestratorTools) {
        if (tool === "get_task" || tool === "prepare_task") {
          expect(preparePrompt).toContain(tool);
        }
        if (
          tool === "get_signal" ||
          tool === "run_verification_checks" ||
          tool === "submit_verification_judgment"
        ) {
          expect(verifyPrompt).toContain(tool);
        }
      }

      // Implement and Retry are implementor stages
      for (const tool of implementorTools) {
        if (tool === "get_current_task" || tool === "signal_completion") {
          expect(implementPrompt).toContain(tool);
          expect(retryPrompt).toContain(tool);
        }
        if (tool === "get_feedback") {
          expect(retryPrompt).toContain(tool);
        }
      }
    });
  });

  describe("Edge cases and error handling", () => {
    it("should handle minimal task data", () => {
      const minimalTask: Task = {
        task_id: 1,
        title: "Minimal Task",
        description: "Minimal description",
      };

      const minimalSprint: Sprint = {
        sprint_id: "001",
        title: "Minimal Sprint",
      };

      const context: PromptContext = {
        task: minimalTask,
        sprint: minimalSprint,
      };

      const preparePrompt = builder.buildPreparePrompt(context);
      const implementPrompt = builder.buildImplementPrompt(context);
      const verifyPrompt = builder.buildVerifyPrompt(context);
      const retryPrompt = builder.buildRetryPrompt(context);

      expect(preparePrompt).toBeTruthy();
      expect(implementPrompt).toBeTruthy();
      expect(verifyPrompt).toBeTruthy();
      expect(retryPrompt).toBeTruthy();
    });

    it("should handle empty context_files in handover", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      const handoverWithEmptyContext: Handover = {
        ...mockHandover,
        context_files: "[]",
      };
      getHandoverMock.mockReturnValue(handoverWithEmptyContext);

      const contextFiles = resolver.getContextFiles(42);
      expect(contextFiles).toEqual([]);
    });

    it("should handle invalid JSON in context_files", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      const handoverWithInvalidJson: Handover = {
        ...mockHandover,
        context_files: "invalid json",
      };
      getHandoverMock.mockReturnValue(handoverWithInvalidJson);

      const contextFiles = resolver.getContextFiles(42);
      expect(contextFiles).toEqual([]);
    });

    it("should handle prompts without optional paths", () => {
      const context: PromptContext = {
        task: mockTask,
        sprint: mockSprint,
      };

      // IMPLEMENT without handoverPath
      const implementPrompt = builder.buildImplementPrompt(context);
      expect(implementPrompt).toBeTruthy();
      expect(implementPrompt).not.toContain("undefined");

      // RETRY without feedbackPath
      const retryPrompt = builder.buildRetryPrompt(context);
      expect(retryPrompt).toBeTruthy();
      expect(retryPrompt).not.toContain("undefined");
    });

    it("should handle retry without maxRetries", () => {
      const context: PromptContext = {
        task: mockTask,
        sprint: mockSprint,
        retryCount: 2,
        // maxRetries not provided
      };

      const retryPrompt = builder.buildRetryPrompt(context);
      expect(retryPrompt).toContain("Retry Attempt 2");
      expect(retryPrompt).toBeTruthy();
    });

    it("should not throw when components encounter edge cases", () => {
      const resolver = new ContextFileResolver(workspaceRoot);

      // Null handover
      getHandoverMock.mockReturnValue(null);
      expect(() => resolver.getContextFiles(999)).not.toThrow();

      // Empty builder context
      const context: PromptContext = {
        task: { task_id: 1, title: "Test", description: "Test" },
        sprint: { sprint_id: "001", title: "Test" },
      };
      expect(() => builder.buildPreparePrompt(context)).not.toThrow();
      expect(() => builder.buildImplementPrompt(context)).not.toThrow();
      expect(() => builder.buildVerifyPrompt(context)).not.toThrow();
      expect(() => builder.buildRetryPrompt(context)).not.toThrow();
    });
  });
});
