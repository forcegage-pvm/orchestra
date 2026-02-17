/**
 * Tests for currentTaskTemplate.ts
 *
 * Validates HTML generation, CSS variables, and template structure.
 */

import { describe, expect, it } from "vitest";
import { ThemeColor } from "vscode";
import type { TaskData } from "../../../../src/views/webview/currentTaskTemplate.js";
import { generateCurrentTaskHtml } from "../../../../src/views/webview/currentTaskTemplate.js";

describe("currentTaskTemplate", () => {
  const mockTaskData: TaskData = {
    id: 1,
    task_id: 1, // Sprint-relative task number
    title: "Implement feature X",
    description: "This is a detailed description of the task",
    status: "IMPLEMENT",
    priority: "P1",
    priorityLabel: "High Priority",
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
      expect(html).toContain('<html lang="en">');
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

    it("should include task metadata as pills", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      // Priority pill shows human-readable label, not P1
      expect(html).toContain("High Priority");
      expect(html).toContain("feature");
      expect(html).toContain('class="pill pill-priority');
      expect(html).toContain('class="pill pill-category');
    });

    it("should include action buttons with context-sensitive label", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain("View Details");
      // IMPLEMENT status shows "Start Implementation" button
      expect(html).toContain("Start Implementation");
      expect(html).toContain('onclick="openTask(1)"');
      expect(html).toContain('onclick="playTask(1)"');
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

      // Secondary button uses textLink-foreground for border and hover background
      expect(html).toContain("--vscode-button-secondaryBackground");
      expect(html).toContain("--vscode-button-secondaryForeground");
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

    it("should have task-header with task ID and status pill", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain('<div class="task-header">');
      expect(html).toContain('<span class="task-id">');
      expect(html).toContain('class="pill pill-status');
    });

    it("should have task-title div", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain('<div class="task-title">');
    });

    it("should have task-description div", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain('<div class="task-description">');
    });

    it("should have task header with pills", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      expect(html).toContain('<div class="task-header">');
      expect(html).toContain('class="pill');
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

      expect(html).toContain("function updateContent(data)");
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

  describe("Code Review Action Integration", () => {
    it("should show code review action for completed tasks", () => {
      const completedTask: TaskData = {
        ...mockTaskData,
        status: "COMPLETE",
        statusDisplay: {
          label: "Complete",
          icon: "check-all",
          color: new ThemeColor("charts.green"),
          description: "Task is complete",
          actionLabel: "Review",
        },
      };

      const html = generateCurrentTaskHtml(completedTask, cspSource);

      expect(html).toMatch(/run.*code.*review|code.*review.*task/i);
    });

    it("should not show code review action for non-completed tasks", () => {
      const html = generateCurrentTaskHtml(mockTaskData, cspSource);

      // IMPLEMENT status should not show code review button
      expect(html).not.toMatch(/run.*code.*review.*this.*task/i);
    });

    it("should include runCodeReview function in JavaScript", () => {
      const completedTask: TaskData = {
        ...mockTaskData,
        status: "COMPLETE",
        statusDisplay: {
          label: "Complete",
          icon: "check-all",
          color: new ThemeColor("charts.green"),
          description: "Task is complete",
          actionLabel: "Review",
        },
      };

      const html = generateCurrentTaskHtml(completedTask, cspSource);

      expect(html).toContain("function runCodeReview(taskId)");
    });

    it("should call postMessage with runCodeReview command", () => {
      const completedTask: TaskData = {
        ...mockTaskData,
        status: "COMPLETE",
        statusDisplay: {
          label: "Complete",
          icon: "check-all",
          color: new ThemeColor("charts.green"),
          description: "Task is complete",
          actionLabel: "Review",
        },
      };

      const html = generateCurrentTaskHtml(completedTask, cspSource);

      expect(html).toMatch(/command:\s*['"]runCodeReview['"]/);
    });

    it("should pass taskId to runCodeReview command", () => {
      const completedTask: TaskData = {
        ...mockTaskData,
        status: "COMPLETE",
        statusDisplay: {
          label: "Complete",
          icon: "check-all",
          color: new ThemeColor("charts.green"),
          description: "Task is complete",
          actionLabel: "Review",
        },
      };

      const html = generateCurrentTaskHtml(completedTask, cspSource);

      expect(html).toContain('onclick="runCodeReview(1)"');
    });

    it("should allow re-review even if already reviewed", () => {
      const reviewedTask: TaskData = {
        ...mockTaskData,
        status: "COMPLETE",
        statusDisplay: {
          label: "Complete",
          icon: "check-all",
          color: new ThemeColor("charts.green"),
          description: "Task is complete and reviewed",
          actionLabel: "Review",
        },
        // Task has been reviewed, but re-review should still be available
      };

      const html = generateCurrentTaskHtml(reviewedTask, cspSource);

      // Should still show code review button
      expect(html).toMatch(/run.*code.*review/i);
    });

    it("should use appropriate icon for code review button", () => {
      const completedTask: TaskData = {
        ...mockTaskData,
        status: "COMPLETE",
        statusDisplay: {
          label: "Complete",
          icon: "check-all",
          color: new ThemeColor("charts.green"),
          description: "Task is complete",
          actionLabel: "Review",
        },
      };

      const html = generateCurrentTaskHtml(completedTask, cspSource);

      // Should have an icon (search, checklist, or similar)
      expect(html).toMatch(/codicon.*-(search|checklist|eye|inspect)/);
    });

    it("should style code review button as secondary action", () => {
      const completedTask: TaskData = {
        ...mockTaskData,
        status: "COMPLETE",
        statusDisplay: {
          label: "Complete",
          icon: "check-all",
          color: new ThemeColor("charts.green"),
          description: "Task is complete",
          actionLabel: "Review",
        },
      };

      const html = generateCurrentTaskHtml(completedTask, cspSource);

      // Should use btn-secondary class
      expect(html).toMatch(
        /btn[- ]secondary.*run.*code.*review|run.*code.*review.*btn[- ]secondary/i,
      );
    });

    it("should show single-task scope in button label", () => {
      const completedTask: TaskData = {
        ...mockTaskData,
        status: "COMPLETE",
        statusDisplay: {
          label: "Complete",
          icon: "check-all",
          color: new ThemeColor("charts.green"),
          description: "Task is complete",
          actionLabel: "Review",
        },
      };

      const html = generateCurrentTaskHtml(completedTask, cspSource);

      // Should indicate this is for "this task" specifically
      expect(html).toMatch(/this.*task|task.*only/i);
    });

    it("should not require justification for re-review", () => {
      const reviewedTask: TaskData = {
        ...mockTaskData,
        status: "COMPLETE",
        statusDisplay: {
          label: "Complete",
          icon: "check-all",
          color: new ThemeColor("charts.green"),
          description: "Task is complete and reviewed",
          actionLabel: "Review",
        },
      };

      const html = generateCurrentTaskHtml(reviewedTask, cspSource);

      // No modal or justification field should be required
      expect(html).not.toMatch(/justification|reason.*for.*review/i);
    });
  });
});
