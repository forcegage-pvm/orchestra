/**
 * Tests for currentTaskTemplate.ts
 *
 * Validates HTML generation, CSS variables, and template structure.
 */

import { describe, it, expect } from "vitest";
import { generateCurrentTaskHtml } from "../../../src/views/webview/currentTaskTemplate.js";
import { ThemeColor } from "vscode";
import type { TaskData } from "../../../src/views/webview/currentTaskTemplate.js";

describe("currentTaskTemplate", () => {
  const mockTaskData: TaskData = {
    id: 1,
    task_id: 1, // Sprint-relative task number
    title: "Implement feature X",
    description: "This is a detailed description of the task",
    status: "IMPLEMENT",
    priority: "P1",
    category: "feature",
    updated_at: "2025-12-13T10:00:00Z",
    statusDisplay: {
      label: "In Progress",
      icon: "play-circle",
      color: new ThemeColor("charts.purple"),
      description: "Task is currently being implemented",
      actionLabel: "Continue",
    },
  };

  const cspSource = "vscode-webview://test-origin";

  describe("generateCurrentTaskHtml", () => {
    it("should generate valid HTML structure", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html lang=\"en\">");
      expect(html).toContain("<head>");
      expect(html).toContain("<body>");
      expect(html).toContain("</html>");
    });

    it("should include Content Security Policy", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("Content-Security-Policy");
      expect(html).toContain(cspSource);
      expect(html).toContain("default-src 'none'");
      expect(html).toContain("style-src");
      expect(html).toContain("script-src");
    });

    it("should include task title in HTML", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("Implement feature X");
    });

    it("should include task ID", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("Task 1");
    });

    it("should include task description", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("This is a detailed description of the task");
    });

    it("should include status display", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("In Progress");
      expect(html).toContain("codicon-play-circle");
    });

    it("should include task metadata", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("P1");
      expect(html).toContain("feature");
      expect(html).toContain("codicon-tag");
      expect(html).toContain("codicon-folder");
    });

    it("should include action buttons", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("View Details");
      expect(html).toContain("Signal Completion");
      expect(html).toContain('onclick="openTask(1)"');
      expect(html).toContain('onclick="signalCompletion(1)"');
    });

    it("should render no-task placeholder when taskData is null", () => {
      const html = generateCurrentTaskHtml(null, cspSource);

      expect(html).toContain("No task currently in progress");
      expect(html).toContain("Refresh");
      expect(html).toContain('onclick="refresh()"');
    });

    it("should escape HTML in task data", () => {
      const maliciousTask: TaskData = {
        ...mockTaskData,
        title: "<script>alert('XSS')</script>",
        description: "<img src=x onerror=alert('XSS')>",
      };

      const html = generateCurrentTaskHtml(maliciousTask, cspSource);

      expect(html).not.toContain("<script>alert('XSS')</script>");
      expect(html).not.toContain("<img src=x onerror=alert('XSS')>");
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&lt;img");
    });
  });

  describe("CSS Variables", () => {
    it("should use --vscode-font-family", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("--vscode-font-family");
    });

    it("should use --vscode-font-size", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("--vscode-font-size");
    });

    it("should use --vscode-foreground", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("--vscode-foreground");
    });

    it("should use --vscode-editor-background", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("--vscode-editor-background");
    });

    it("should use --vscode-panel-border", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("--vscode-panel-border");
    });

    it("should use --vscode-button-background", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("--vscode-button-background");
    });

    it("should use --vscode-button-foreground", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("--vscode-button-foreground");
    });

    it("should use --vscode-button-hoverBackground", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("--vscode-button-hoverBackground");
    });

    it("should use --vscode-descriptionForeground", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("--vscode-descriptionForeground");
    });

    it("should use --vscode-textLink-foreground", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("--vscode-textLink-foreground");
    });

    it("should use secondary button variables", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("--vscode-button-secondaryBackground");
      expect(html).toContain("--vscode-button-secondaryForeground");
      expect(html).toContain("--vscode-button-secondaryHoverBackground");
    });
  });

  describe("Template Structure", () => {
    it("should have container div with id content", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain('<div class="container" id="content">');
    });

    it("should have task-card div for active task", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain('<div class="task-card">');
    });

    it("should have task-header with task ID and status", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain('<div class="task-header">');
      expect(html).toContain('<span class="task-id">');
      expect(html).toContain('<span class="task-status">');
    });

    it("should have task-title div", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain('<div class="task-title">');
    });

    it("should have task-description div", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain('<div class="task-description">');
    });

    it("should have task-meta div with meta items", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain('<div class="task-meta">');
      expect(html).toContain('<div class="meta-item">');
    });

    it("should have action-buttons container", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain('<div class="action-buttons">');
    });

    it("should have no-task div when no task active", () => {
      const html = generateCurrentTaskHtml(null, cspSource);

      expect(html).toContain('<div class="no-task">');
    });
  });

  describe("JavaScript", () => {
    it("should include vscode API acquisition", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("acquireVsCodeApi()");
    });

    it("should include message listener", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("window.addEventListener('message'");
    });

    it("should include updateContent function", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("function updateContent(taskData)");
    });

    it("should include openTask function", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("function openTask(taskId)");
    });

    it("should include signalCompletion function", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("function signalCompletion(taskId)");
    });

    it("should include refresh function", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("function refresh()");
    });

    it("should include escapeHtml function", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("function escapeHtml(text)");
    });

    it("should post messages to vscode API", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("vscode.postMessage");
    });
  });

  describe("Responsive Layout", () => {
    it("should use flexbox for layout", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("display: flex");
    });

    it("should use gap for spacing", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("gap:");
    });

    it("should use padding for container", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toMatch(/\.container\s*{[^}]*padding:\s*12px/);
    });

    it("should use border-radius for rounded corners", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("border-radius:");
    });
  });

  describe("Status Display Integration", () => {
    it("should render status icon from statusDisplay", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain(`codicon-${mockTaskData.statusDisplay.icon}`);
    });

    it("should render status label from statusDisplay", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain(mockTaskData.statusDisplay.label);
    });

    it("should handle different status displays", () => {
      const pendingTask: TaskData = {
        ...mockTaskData,
        status: "PENDING",
        statusDisplay: {
          label: "Ready",
          icon: "circle-outline",
          color: new ThemeColor("charts.blue"),
          description: "Task is ready to be started",
          actionLabel: "Start",
        },
      };

      const html = generateCurrentTaskHtml(pendingTask, cspSource);

      expect(html).toContain("Ready");
      expect(html).toContain("codicon-circle-outline");
    });
  });
});
