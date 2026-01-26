/**
 * Role-based tool filtering tests
 *
 * ISSUE-008 FIX: Tests now use actual getToolsForRole() implementation
 * instead of hardcoded local arrays.
 *
 * Verifies that tools are correctly filtered based on server role.
 * Extended for Controller Agent (Sprint 004).
 */

import { describe, expect, it } from "vitest";
import {
  getToolsForRole,
  isToolAvailableForRole,
} from "../../src/mcp-server/tools.js";

describe("Role-based Tool Filtering", () => {
  // Expected tool counts per role (excluding shared)
  const EXPECTED_ORCHESTRATOR_TOOL_COUNT = 27;
  const EXPECTED_IMPLEMENTOR_TOOL_COUNT = 4;
  const EXPECTED_CONTROLLER_TOOL_COUNT = 8;
  const EXPECTED_SHARED_TOOL_COUNT = 9;
  const EXPECTED_TOTAL_TOOL_COUNT = 48; // 27 orc + 4 imp + 8 ctrl + 9 shared = 48

  describe("Tool categorization", () => {
    it("should have correct orchestrator tool count", () => {
      const tools = getToolsForRole("orchestrator");
      // Orchestrator gets their tools + shared
      expect(tools.length).toBe(
        EXPECTED_ORCHESTRATOR_TOOL_COUNT + EXPECTED_SHARED_TOOL_COUNT,
      );
    });

    it("should have correct implementor tool count", () => {
      const tools = getToolsForRole("implementor");
      // Implementor gets their tools + shared
      expect(tools.length).toBe(
        EXPECTED_IMPLEMENTOR_TOOL_COUNT + EXPECTED_SHARED_TOOL_COUNT,
      );
    });

    it("should have correct controller tool count", () => {
      const tools = getToolsForRole("controller");
      // Controller gets their tools + shared
      expect(tools.length).toBe(
        EXPECTED_CONTROLLER_TOOL_COUNT + EXPECTED_SHARED_TOOL_COUNT,
      );
    });

    it("should have correct total tool count for full role", () => {
      const tools = getToolsForRole("full");
      expect(tools.length).toBe(EXPECTED_TOTAL_TOOL_COUNT);
    });
  });

  describe("Role access - orchestrator", () => {
    it("orchestrator should have access to configure_sprint", () => {
      expect(isToolAvailableForRole("configure_sprint", "orchestrator")).toBe(
        true,
      );
    });

    it("orchestrator should have access to prepare_task", () => {
      expect(isToolAvailableForRole("prepare_task", "orchestrator")).toBe(true);
    });

    it("orchestrator should have access to resubmit_sprint", () => {
      expect(isToolAvailableForRole("resubmit_sprint", "orchestrator")).toBe(
        true,
      );
    });

    it("orchestrator should have access to resubmit_handover", () => {
      expect(isToolAvailableForRole("resubmit_handover", "orchestrator")).toBe(
        true,
      );
    });

    it("orchestrator should have access to shared tools", () => {
      expect(isToolAvailableForRole("get_sprint_status", "orchestrator")).toBe(
        true,
      );
      expect(isToolAvailableForRole("get_progress", "orchestrator")).toBe(true);
    });
  });

  describe("Role access - implementor", () => {
    it("implementor should have access to get_current_task", () => {
      expect(isToolAvailableForRole("get_current_task", "implementor")).toBe(
        true,
      );
    });

    it("implementor should have access to signal_completion", () => {
      expect(isToolAvailableForRole("signal_completion", "implementor")).toBe(
        true,
      );
    });

    it("implementor should have access to shared tools", () => {
      expect(isToolAvailableForRole("get_sprint_status", "implementor")).toBe(
        true,
      );
      expect(isToolAvailableForRole("get_progress", "implementor")).toBe(true);
    });
  });

  describe("Role access - controller (T036a)", () => {
    it("controller should have access to approve_sprint", () => {
      expect(isToolAvailableForRole("approve_sprint", "controller")).toBe(true);
    });

    it("controller should have access to reject_sprint", () => {
      expect(isToolAvailableForRole("reject_sprint", "controller")).toBe(true);
    });

    it("controller should have access to approve_handover", () => {
      expect(isToolAvailableForRole("approve_handover", "controller")).toBe(
        true,
      );
    });

    it("controller should have access to reject_handover", () => {
      expect(isToolAvailableForRole("reject_handover", "controller")).toBe(
        true,
      );
    });

    it("controller should have access to read-only review tools", () => {
      expect(isToolAvailableForRole("get_task_for_review", "controller")).toBe(
        true,
      );
      expect(isToolAvailableForRole("get_handover", "controller")).toBe(true);
      expect(isToolAvailableForRole("read_spec_file", "controller")).toBe(true);
    });

    it("controller should have access to shared tools", () => {
      expect(isToolAvailableForRole("get_sprint_status", "controller")).toBe(
        true,
      );
      expect(isToolAvailableForRole("get_progress", "controller")).toBe(true);
    });
  });

  describe("Critical isolation", () => {
    it("implementor should NOT have access to verification criteria", () => {
      // get_task exposes verification criteria - implementor must not see this
      expect(isToolAvailableForRole("get_task", "implementor")).toBe(false);
    });

    it("implementor should NOT be able to run verification checks", () => {
      expect(
        isToolAvailableForRole("run_verification_checks", "implementor"),
      ).toBe(false);
    });

    it("implementor should NOT be able to submit judgment", () => {
      expect(
        isToolAvailableForRole("submit_verification_judgment", "implementor"),
      ).toBe(false);
    });

    it("orchestrator should NOT be able to signal completion", () => {
      // Only implementor signals completion
      expect(isToolAvailableForRole("signal_completion", "orchestrator")).toBe(
        false,
      );
    });

    it("orchestrator should NOT use get_current_task", () => {
      // get_current_task is the implementor's view (no verification criteria)
      expect(isToolAvailableForRole("get_current_task", "orchestrator")).toBe(
        false,
      );
    });
  });

  // Sprint 004: Controller role isolation tests (T036a)
  describe("Controller role isolation (T036a)", () => {
    it("controller should NOT have access to update_verification", () => {
      // Critical: Controller reviews against spec, cannot modify verification
      expect(isToolAvailableForRole("update_verification", "controller")).toBe(
        false,
      );
    });

    it("controller should NOT have access to prepare_task", () => {
      // Controller reviews handovers, cannot create them
      expect(isToolAvailableForRole("prepare_task", "controller")).toBe(false);
    });

    it("controller should NOT have access to configure_sprint", () => {
      // Controller reviews sprint configs, cannot create them
      expect(isToolAvailableForRole("configure_sprint", "controller")).toBe(
        false,
      );
    });

    it("controller should NOT have access to complete_task", () => {
      // Controller approves/rejects, doesn't complete tasks
      expect(isToolAvailableForRole("complete_task", "controller")).toBe(false);
    });

    it("controller should NOT have access to signal_completion", () => {
      // Controller is not the implementor
      expect(isToolAvailableForRole("signal_completion", "controller")).toBe(
        false,
      );
    });

    it("orchestrator should NOT have access to approve_sprint", () => {
      // Controller-only tool
      expect(isToolAvailableForRole("approve_sprint", "orchestrator")).toBe(
        false,
      );
    });

    it("orchestrator should NOT have access to reject_handover", () => {
      // Controller-only tool
      expect(isToolAvailableForRole("reject_handover", "orchestrator")).toBe(
        false,
      );
    });

    it("implementor should NOT have access to approve_handover", () => {
      // Controller-only tool
      expect(isToolAvailableForRole("approve_handover", "implementor")).toBe(
        false,
      );
    });
  });
});
