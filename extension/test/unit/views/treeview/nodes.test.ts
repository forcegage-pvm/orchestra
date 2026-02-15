import { describe, expect, it } from "vitest";
import {
  isPhaseNode,
  isTaskNode,
  type PhaseNode,
  type TaskNode,
} from "../../../../src/views/treeview/nodes.js";

describe("nodes.ts", () => {
  describe("PhaseNode interface", () => {
    it("should have all required properties", () => {
      const phaseNode: PhaseNode = {
        id: "phase-1",
        name: "Phase 1",
        status: "PENDING",
        taskCount: 5,
        completedCount: 2,
      };

      expect(phaseNode.id).toBe("phase-1");
      expect(phaseNode.name).toBe("Phase 1");
      expect(phaseNode.status).toBe("PENDING");
      expect(phaseNode.taskCount).toBe(5);
      expect(phaseNode.completedCount).toBe(2);
    });

    it("should support all status values", () => {
      const statuses = [
        "PENDING",
        "IMPLEMENT",
        "VERIFY",
        "VERIFY_FAILED",
        "GATE_CHECK",
        "ESCALATED",
        "COMPLETE",
      ];

      statuses.forEach((status) => {
        const node: PhaseNode = {
          id: "phase-1",
          name: "Phase 1",
          status: status as PhaseNode["status"],
          taskCount: 1,
          completedCount: 0,
        };
        expect(node.status).toBe(status);
      });
    });
  });

  describe("TaskNode interface", () => {
    it("should have all required properties", () => {
      const taskNode: TaskNode = {
        id: 1,
        title: "Task 1",
        status: "PENDING",
        description: "Test task",
        dependencies: [2, 3],
        phase: "Phase 1",
      };

      expect(taskNode.id).toBe(1);
      expect(taskNode.title).toBe("Task 1");
      expect(taskNode.status).toBe("PENDING");
      expect(taskNode.description).toBe("Test task");
      expect(taskNode.dependencies).toEqual([2, 3]);
      expect(taskNode.phase).toBe("Phase 1");
    });

    it("should allow empty dependencies array", () => {
      const taskNode: TaskNode = {
        id: 1,
        title: "Task 1",
        status: "PENDING",
        description: "Test task",
        dependencies: [],
        phase: "Phase 1",
      };

      expect(taskNode.dependencies).toEqual([]);
    });

    it("should support all status values", () => {
      const statuses = [
        "PENDING",
        "IMPLEMENT",
        "VERIFY",
        "VERIFY_FAILED",
        "GATE_CHECK",
        "ESCALATED",
        "COMPLETE",
      ];

      statuses.forEach((status) => {
        const node: TaskNode = {
          id: 1,
          title: "Task 1",
          status: status as TaskNode["status"],
          description: "Test",
          dependencies: [],
          phase: "Phase 1",
        };
        expect(node.status).toBe(status);
      });
    });
  });

  describe("isPhaseNode type guard", () => {
    it("should correctly identify PhaseNode objects", () => {
      const phaseNode: PhaseNode = {
        id: "phase-1",
        name: "Phase 1",
        status: "PENDING",
        taskCount: 5,
        completedCount: 2,
      };

      expect(isPhaseNode(phaseNode)).toBe(true);
    });

    it("should return false for TaskNode objects", () => {
      const taskNode: TaskNode = {
        id: 1,
        title: "Task 1",
        status: "PENDING",
        description: "Test task",
        dependencies: [],
        phase: "Phase 1",
      };

      expect(isPhaseNode(taskNode)).toBe(false);
    });

    it("should return false for plain objects", () => {
      expect(isPhaseNode({})).toBe(false);
      expect(isPhaseNode(null)).toBe(false);
      expect(isPhaseNode(undefined)).toBe(false);
      expect(isPhaseNode("string")).toBe(false);
      expect(isPhaseNode(123)).toBe(false);
    });

    it("should return false for objects with partial PhaseNode properties", () => {
      const partial = {
        id: "phase-1",
        name: "Phase 1",
        // missing required properties
      };

      expect(isPhaseNode(partial)).toBe(false);
    });
  });

  describe("isTaskNode type guard", () => {
    it("should correctly identify TaskNode objects", () => {
      const taskNode: TaskNode = {
        id: 1,
        title: "Task 1",
        status: "PENDING",
        description: "Test task",
        dependencies: [],
        phase: "Phase 1",
      };

      expect(isTaskNode(taskNode)).toBe(true);
    });

    it("should return false for PhaseNode objects", () => {
      const phaseNode: PhaseNode = {
        id: "phase-1",
        name: "Phase 1",
        status: "PENDING",
        taskCount: 5,
        completedCount: 2,
      };

      expect(isTaskNode(phaseNode)).toBe(false);
    });

    it("should return false for plain objects", () => {
      expect(isTaskNode({})).toBe(false);
      expect(isTaskNode(null)).toBe(false);
      expect(isTaskNode(undefined)).toBe(false);
      expect(isTaskNode("string")).toBe(false);
      expect(isTaskNode(123)).toBe(false);
    });

    it("should return false for objects with partial TaskNode properties", () => {
      const partial = {
        id: 1,
        title: "Task 1",
        // missing required properties
      };

      expect(isTaskNode(partial)).toBe(false);
    });
  });
});
