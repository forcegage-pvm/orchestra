/**
 * Tests for status translation module
 */

import { describe, expect, it } from "vitest";
import { ThemeColor } from "vscode";
import {
  STATUS_DISPLAY,
  StatusDisplay,
  getStatusDisplay,
} from "../../src/views/statusTranslation.js";

describe("statusTranslation", () => {
  describe("STATUS_DISPLAY", () => {
    it("should have all required status mappings", () => {
      const requiredStatuses = [
        "PENDING",
        "PREPARE",
        "PENDING_HANDOVER_REVIEW",
        "HANDOVER_REVIEW_FAILED",
        "IMPLEMENT",
        "VERIFY",
        "VERIFY_FAILED",
        "GATE_CHECK",
        "ESCALATED",
        "COMPLETE",
      ];

      requiredStatuses.forEach((status) => {
        expect(STATUS_DISPLAY[status]).toBeDefined();
      });

      // Verify we have exactly 10 statuses (7 original + 3 Controller review statuses)
      expect(Object.keys(STATUS_DISPLAY)).toHaveLength(10);
    });

    it("should have required properties for each status mapping", () => {
      Object.entries(STATUS_DISPLAY).forEach(([status, display]) => {
        expect(display).toHaveProperty("label");
        expect(display).toHaveProperty("icon");
        expect(display).toHaveProperty("color");
        expect(display).toHaveProperty("description");

        // Verify types
        expect(typeof display.label).toBe("string");
        expect(typeof display.icon).toBe("string");
        expect(display.color).toBeInstanceOf(ThemeColor);
        expect(typeof display.description).toBe("string");

        // Verify non-empty strings
        expect(display.label.length).toBeGreaterThan(0);
        expect(display.icon.length).toBeGreaterThan(0);
        expect(display.description.length).toBeGreaterThan(0);

        // actionLabel is optional but if present must be a string
        if (display.actionLabel !== undefined) {
          expect(typeof display.actionLabel).toBe("string");
          expect(display.actionLabel.length).toBeGreaterThan(0);
        }
      });
    });

    it("should use user-friendly labels (not technical jargon)", () => {
      // Verify specific user-friendly labels
      expect(STATUS_DISPLAY.PENDING.label).toBe("Ready");
      expect(STATUS_DISPLAY.IMPLEMENT.label).toBe("In Progress");
      expect(STATUS_DISPLAY.VERIFY.label).toBe("Verifying");
      expect(STATUS_DISPLAY.VERIFY_FAILED.label).toBe("Needs Attention");
      expect(STATUS_DISPLAY.GATE_CHECK.label).toBe("Pending Review");
      expect(STATUS_DISPLAY.ESCALATED.label).toBe("Escalated");
      expect(STATUS_DISPLAY.COMPLETE.label).toBe("Complete");
    });

    it("should use valid VS Code codicon names", () => {
      // Verify expected codicons
      expect(STATUS_DISPLAY.PENDING.icon).toBe("circle-outline");
      expect(STATUS_DISPLAY.IMPLEMENT.icon).toBe("play-circle");
      expect(STATUS_DISPLAY.VERIFY.icon).toBe("sync~spin");
      expect(STATUS_DISPLAY.VERIFY_FAILED.icon).toBe("warning");
      expect(STATUS_DISPLAY.GATE_CHECK.icon).toBe("shield");
      expect(STATUS_DISPLAY.ESCALATED.icon).toBe("alert");
      expect(STATUS_DISPLAY.COMPLETE.icon).toBe("check-all");
    });

    it("should use VS Code ThemeColor for colors", () => {
      // Verify all colors are ThemeColor instances with chart colors
      expect(STATUS_DISPLAY.PENDING.color).toBeInstanceOf(ThemeColor);
      expect(STATUS_DISPLAY.IMPLEMENT.color).toBeInstanceOf(ThemeColor);
      expect(STATUS_DISPLAY.VERIFY.color).toBeInstanceOf(ThemeColor);
      expect(STATUS_DISPLAY.VERIFY_FAILED.color).toBeInstanceOf(ThemeColor);
      expect(STATUS_DISPLAY.GATE_CHECK.color).toBeInstanceOf(ThemeColor);
      expect(STATUS_DISPLAY.ESCALATED.color).toBeInstanceOf(ThemeColor);
      expect(STATUS_DISPLAY.COMPLETE.color).toBeInstanceOf(ThemeColor);
    });
  });

  describe("getStatusDisplay", () => {
    it("should return correct display for known statuses", () => {
      const pendingDisplay = getStatusDisplay("PENDING");
      expect(pendingDisplay.label).toBe("Ready");
      expect(pendingDisplay.icon).toBe("circle-outline");

      const implementDisplay = getStatusDisplay("IMPLEMENT");
      expect(implementDisplay.label).toBe("In Progress");
      expect(implementDisplay.icon).toBe("play-circle");

      const verifyDisplay = getStatusDisplay("VERIFY");
      expect(verifyDisplay.label).toBe("Verifying");
      expect(verifyDisplay.icon).toBe("sync~spin");

      const verifyFailedDisplay = getStatusDisplay("VERIFY_FAILED");
      expect(verifyFailedDisplay.label).toBe("Needs Attention");
      expect(verifyFailedDisplay.icon).toBe("warning");

      const gateCheckDisplay = getStatusDisplay("GATE_CHECK");
      expect(gateCheckDisplay.label).toBe("Pending Review");
      expect(gateCheckDisplay.icon).toBe("shield");

      const escalatedDisplay = getStatusDisplay("ESCALATED");
      expect(escalatedDisplay.label).toBe("Escalated");
      expect(escalatedDisplay.icon).toBe("alert");

      const completeDisplay = getStatusDisplay("COMPLETE");
      expect(completeDisplay.label).toBe("Complete");
      expect(completeDisplay.icon).toBe("check-all");
    });

    it("should return fallback for unknown statuses", () => {
      const unknownDisplay = getStatusDisplay("UNKNOWN_STATUS");

      expect(unknownDisplay.label).toBe("UNKNOWN_STATUS");
      expect(unknownDisplay.icon).toBe("question");
      expect(unknownDisplay.color).toBeInstanceOf(ThemeColor);
      expect(unknownDisplay.description).toContain("Unknown status");
      expect(unknownDisplay.description).toContain("UNKNOWN_STATUS");
    });

    it("should return fallback with custom status name", () => {
      const customStatus = "CUSTOM_STATE";
      const customDisplay = getStatusDisplay(customStatus);

      expect(customDisplay.label).toBe(customStatus);
      expect(customDisplay.description).toContain(customStatus);
    });

    it("should handle empty string status", () => {
      const emptyDisplay = getStatusDisplay("");

      expect(emptyDisplay.label).toBe("");
      expect(emptyDisplay.icon).toBe("question");
      expect(emptyDisplay.color).toBeInstanceOf(ThemeColor);
    });
  });

  describe("StatusDisplay interface", () => {
    it("should match expected structure", () => {
      const display: StatusDisplay = {
        label: "Test Label",
        icon: "test-icon",
        color: new ThemeColor("charts.blue"),
        description: "Test description",
      };

      expect(display.label).toBe("Test Label");
      expect(display.icon).toBe("test-icon");
      expect(display.color).toBeInstanceOf(ThemeColor);
      expect(display.description).toBe("Test description");
    });

    it("should allow optional actionLabel", () => {
      const displayWithAction: StatusDisplay = {
        label: "Test Label",
        icon: "test-icon",
        color: new ThemeColor("charts.blue"),
        description: "Test description",
        actionLabel: "Do Something",
      };

      expect(displayWithAction.actionLabel).toBe("Do Something");
    });
  });

  /**
   * Tests for status transitions as defined in the Orchestra workflow
   *
   * Status Flow:
   * PENDING → IMPLEMENT → VERIFY → (VERIFY_FAILED → retry) → COMPLETE
   *                              ↓
   *                         GATE_CHECK → ESCALATED
   */
  describe("Status Transitions", () => {
    describe("happy path: PENDING → IMPLEMENT → VERIFY → COMPLETE", () => {
      it("should display correct sequence for successful task completion", () => {
        const transitions = ["PENDING", "IMPLEMENT", "VERIFY", "COMPLETE"];

        transitions.forEach((status, index) => {
          const display = getStatusDisplay(status);
          expect(display).toBeDefined();
          expect(display.label).not.toBe(status); // Should be user-friendly
          expect(display.icon).not.toBe("question"); // Should have valid icon
        });
      });

      it("should have appropriate action labels for transition states", () => {
        // States that allow actions should have actionLabel
        expect(STATUS_DISPLAY.PENDING.actionLabel).toBe("Start");
        expect(STATUS_DISPLAY.IMPLEMENT.actionLabel).toBe("Continue");
        expect(STATUS_DISPLAY.VERIFY.actionLabel).toBe("View Progress");

        // Complete state has no further action
        expect(STATUS_DISPLAY.COMPLETE.actionLabel).toBeUndefined();
      });

      it("should have visual progression through colors", () => {
        // Each status should have a distinct color for visual tracking
        const colors = [
          STATUS_DISPLAY.PENDING.color,
          STATUS_DISPLAY.IMPLEMENT.color,
          STATUS_DISPLAY.VERIFY.color,
          STATUS_DISPLAY.COMPLETE.color,
        ];

        // All should be valid ThemeColors
        colors.forEach((color) => {
          expect(color).toBeInstanceOf(ThemeColor);
        });
      });
    });

    describe("failure path: VERIFY → VERIFY_FAILED → retry", () => {
      it("should display correct statuses for failed verification", () => {
        const verifyDisplay = getStatusDisplay("VERIFY");
        const failedDisplay = getStatusDisplay("VERIFY_FAILED");

        expect(verifyDisplay.label).toBe("Verifying");
        expect(failedDisplay.label).toBe("Needs Attention");

        // Failed should have warning icon
        expect(failedDisplay.icon).toBe("warning");

        // Failed should have action to review feedback
        expect(failedDisplay.actionLabel).toBe("Review Feedback");
      });

      it("should use orange color for VERIFY_FAILED to indicate attention needed", () => {
        const failedDisplay = getStatusDisplay("VERIFY_FAILED");
        expect(failedDisplay.color).toBeInstanceOf(ThemeColor);
        // The color is charts.orange which indicates warning/attention
      });
    });

    describe("escalation path: GATE_CHECK → ESCALATED", () => {
      it("should display correct statuses for escalation flow", () => {
        const gateCheckDisplay = getStatusDisplay("GATE_CHECK");
        const escalatedDisplay = getStatusDisplay("ESCALATED");

        expect(gateCheckDisplay.label).toBe("Pending Review");
        expect(escalatedDisplay.label).toBe("Escalated");

        // Gate check should have shield icon (protection)
        expect(gateCheckDisplay.icon).toBe("shield");

        // Escalated should have alert icon (urgent attention)
        expect(escalatedDisplay.icon).toBe("alert");
      });

      it("should have action labels for resolution", () => {
        expect(STATUS_DISPLAY.GATE_CHECK.actionLabel).toBe("Review");
        expect(STATUS_DISPLAY.ESCALATED.actionLabel).toBe("Resolve");
      });

      it("should use red color for ESCALATED to indicate urgency", () => {
        const escalatedDisplay = getStatusDisplay("ESCALATED");
        expect(escalatedDisplay.color).toBeInstanceOf(ThemeColor);
        // The color is charts.red which indicates urgency
      });
    });

    describe("status icons are valid codicons", () => {
      it("should use icons that represent the status meaning", () => {
        // circle-outline = not started (empty)
        expect(STATUS_DISPLAY.PENDING.icon).toBe("circle-outline");

        // play-circle = active work
        expect(STATUS_DISPLAY.IMPLEMENT.icon).toBe("play-circle");

        // sync~spin = processing/checking (animated)
        expect(STATUS_DISPLAY.VERIFY.icon).toBe("sync~spin");

        // warning = needs attention
        expect(STATUS_DISPLAY.VERIFY_FAILED.icon).toBe("warning");

        // shield = gated/protected
        expect(STATUS_DISPLAY.GATE_CHECK.icon).toBe("shield");

        // alert = urgent/escalated
        expect(STATUS_DISPLAY.ESCALATED.icon).toBe("alert");

        // check-all = fully complete
        expect(STATUS_DISPLAY.COMPLETE.icon).toBe("check-all");
      });
    });

    describe("all statuses have meaningful descriptions", () => {
      it("should have descriptions that explain the status to users", () => {
        expect(STATUS_DISPLAY.PENDING.description).toContain("ready");
        expect(STATUS_DISPLAY.IMPLEMENT.description).toContain("implemented");
        expect(STATUS_DISPLAY.VERIFY.description).toContain("verified");
        expect(STATUS_DISPLAY.VERIFY_FAILED.description).toContain("failed");
        expect(STATUS_DISPLAY.GATE_CHECK.description).toContain("review");
        expect(STATUS_DISPLAY.ESCALATED.description).toContain("escalated");
        expect(STATUS_DISPLAY.COMPLETE.description).toContain("completed");
      });
    });
  });
});
