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
    it("should have all 7 required status mappings", () => {
      const requiredStatuses = [
        "PENDING",
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

      // Verify we have exactly 7 statuses
      expect(Object.keys(STATUS_DISPLAY)).toHaveLength(7);
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
});
