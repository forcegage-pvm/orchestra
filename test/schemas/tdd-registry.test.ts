/**
 * TDD Registry Schema Tests
 *
 * Tests Zod schema validation for TDD red test registry types
 */

import { describe, expect, it } from "vitest";
import {
  RegisterTddRedTestInputSchema,
  RegisterTddRedTestOutputSchema,
  TddRegistryEntrySchema,
  TddRegistryStatusSchema,
} from "../../src/schemas/tdd-registry.js";

describe("TDD Registry Schemas", () => {
  describe("TddRegistryStatusSchema", () => {
    it("should validate REGISTERED status", () => {
      const result = TddRegistryStatusSchema.safeParse("REGISTERED");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("REGISTERED");
      }
    });

    it("should validate VALIDATED status", () => {
      const result = TddRegistryStatusSchema.safeParse("VALIDATED");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("VALIDATED");
      }
    });

    it("should validate PENDING_GREEN status", () => {
      const result = TddRegistryStatusSchema.safeParse("PENDING_GREEN");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("PENDING_GREEN");
      }
    });

    it("should validate GREEN status", () => {
      const result = TddRegistryStatusSchema.safeParse("GREEN");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("GREEN");
      }
    });

    it("should reject invalid status", () => {
      const result = TddRegistryStatusSchema.safeParse("INVALID");
      expect(result.success).toBe(false);
    });
  });

  describe("RegisterTddRedTestInputSchema", () => {
    it("should validate valid input with all fields", () => {
      const input = {
        task_id: 5,
        test_identifier: "test/auth.test.ts::Authentication::should fail login",
        description: "Test for invalid credentials",
        marker_type: "it.skip",
      };

      const result = RegisterTddRedTestInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.task_id).toBe(5);
        expect(result.data.test_identifier).toBe(
          "test/auth.test.ts::Authentication::should fail login"
        );
        expect(result.data.description).toBe("Test for invalid credentials");
        expect(result.data.marker_type).toBe("it.skip");
      }
    });

    it("should validate valid input with required fields only", () => {
      const input = {
        task_id: 10,
        test_identifier: "test/db.test.ts::Database::should connect",
      };

      const result = RegisterTddRedTestInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.task_id).toBe(10);
        expect(result.data.test_identifier).toBe(
          "test/db.test.ts::Database::should connect"
        );
        expect(result.data.description).toBeUndefined();
        expect(result.data.marker_type).toBeUndefined();
      }
    });

    it("should reject missing task_id", () => {
      const input = {
        test_identifier: "test/auth.test.ts::Authentication::should fail login",
      };

      const result = RegisterTddRedTestInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject missing test_identifier", () => {
      const input = {
        task_id: 5,
      };

      const result = RegisterTddRedTestInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject empty test_identifier", () => {
      const input = {
        task_id: 5,
        test_identifier: "",
      };

      const result = RegisterTddRedTestInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject negative task_id", () => {
      const input = {
        task_id: -1,
        test_identifier: "test/auth.test.ts::Authentication::should fail login",
      };

      const result = RegisterTddRedTestInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject zero task_id", () => {
      const input = {
        task_id: 0,
        test_identifier: "test/auth.test.ts::Authentication::should fail login",
      };

      const result = RegisterTddRedTestInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("RegisterTddRedTestOutputSchema", () => {
    it("should validate valid output", () => {
      const output = {
        success: true,
        registry_id: 123,
        test_identifier: "test/auth.test.ts::Authentication::should fail login",
        status: "REGISTERED",
        next_step:
          "Verify the test fails by running: npm test -- test/auth.test.ts",
      };

      const result = RegisterTddRedTestOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.registry_id).toBe(123);
        expect(result.data.test_identifier).toBe(
          "test/auth.test.ts::Authentication::should fail login"
        );
        expect(result.data.status).toBe("REGISTERED");
        expect(result.data.next_step).toContain("npm test");
      }
    });

    it("should reject missing success field", () => {
      const output = {
        registry_id: 123,
        test_identifier: "test/auth.test.ts::Authentication::should fail login",
        status: "REGISTERED",
        next_step: "Verify the test fails",
      };

      const result = RegisterTddRedTestOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it("should reject success: false", () => {
      const output = {
        success: false,
        registry_id: 123,
        test_identifier: "test/auth.test.ts::Authentication::should fail login",
        status: "REGISTERED",
        next_step: "Verify the test fails",
      };

      const result = RegisterTddRedTestOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it("should reject wrong status value", () => {
      const output = {
        success: true,
        registry_id: 123,
        test_identifier: "test/auth.test.ts::Authentication::should fail login",
        status: "VALIDATED",
        next_step: "Verify the test fails",
      };

      const result = RegisterTddRedTestOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it("should reject negative registry_id", () => {
      const output = {
        success: true,
        registry_id: -1,
        test_identifier: "test/auth.test.ts::Authentication::should fail login",
        status: "REGISTERED",
        next_step: "Verify the test fails",
      };

      const result = RegisterTddRedTestOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });
  });

  describe("TddRegistryEntrySchema", () => {
    it("should validate complete entry with all fields", () => {
      const entry = {
        id: 42,
        sprint_id: "sprint-010",
        red_task_id: 5,
        test_identifier: "test/auth.test.ts::Authentication::should fail login",
        description: "Test for invalid credentials",
        marker_type: "it.skip",
        status: "GREEN",
        green_task_id: 8,
        created_at: "2026-01-14T10:00:00Z",
        validated_at: "2026-01-14T10:30:00Z",
        assigned_at: "2026-01-14T11:00:00Z",
        greened_at: "2026-01-14T12:00:00Z",
      };

      const result = TddRegistryEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(42);
        expect(result.data.sprint_id).toBe("sprint-010");
        expect(result.data.red_task_id).toBe(5);
        expect(result.data.test_identifier).toBe(
          "test/auth.test.ts::Authentication::should fail login"
        );
        expect(result.data.description).toBe("Test for invalid credentials");
        expect(result.data.marker_type).toBe("it.skip");
        expect(result.data.status).toBe("GREEN");
        expect(result.data.green_task_id).toBe(8);
        expect(result.data.created_at).toBe("2026-01-14T10:00:00Z");
        expect(result.data.validated_at).toBe("2026-01-14T10:30:00Z");
        expect(result.data.assigned_at).toBe("2026-01-14T11:00:00Z");
        expect(result.data.greened_at).toBe("2026-01-14T12:00:00Z");
      }
    });

    it("should validate entry with required fields only", () => {
      const entry = {
        id: 1,
        sprint_id: "sprint-001",
        red_task_id: 3,
        test_identifier: "test/db.test.ts::Database::should connect",
        status: "REGISTERED",
        created_at: "2026-01-14T10:00:00Z",
      };

      const result = TddRegistryEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(1);
        expect(result.data.sprint_id).toBe("sprint-001");
        expect(result.data.red_task_id).toBe(3);
        expect(result.data.test_identifier).toBe(
          "test/db.test.ts::Database::should connect"
        );
        expect(result.data.status).toBe("REGISTERED");
        expect(result.data.created_at).toBe("2026-01-14T10:00:00Z");
        expect(result.data.description).toBeUndefined();
        expect(result.data.marker_type).toBeUndefined();
        expect(result.data.green_task_id).toBeUndefined();
        expect(result.data.validated_at).toBeUndefined();
        expect(result.data.assigned_at).toBeUndefined();
        expect(result.data.greened_at).toBeUndefined();
      }
    });

    it("should reject missing id", () => {
      const entry = {
        sprint_id: "sprint-001",
        red_task_id: 3,
        test_identifier: "test/db.test.ts::Database::should connect",
        status: "REGISTERED",
        created_at: "2026-01-14T10:00:00Z",
      };

      const result = TddRegistryEntrySchema.safeParse(entry);
      expect(result.success).toBe(false);
    });

    it("should reject empty sprint_id", () => {
      const entry = {
        id: 1,
        sprint_id: "",
        red_task_id: 3,
        test_identifier: "test/db.test.ts::Database::should connect",
        status: "REGISTERED",
        created_at: "2026-01-14T10:00:00Z",
      };

      const result = TddRegistryEntrySchema.safeParse(entry);
      expect(result.success).toBe(false);
    });

    it("should reject invalid status", () => {
      const entry = {
        id: 1,
        sprint_id: "sprint-001",
        red_task_id: 3,
        test_identifier: "test/db.test.ts::Database::should connect",
        status: "INVALID_STATUS",
        created_at: "2026-01-14T10:00:00Z",
      };

      const result = TddRegistryEntrySchema.safeParse(entry);
      expect(result.success).toBe(false);
    });

    it("should reject negative red_task_id", () => {
      const entry = {
        id: 1,
        sprint_id: "sprint-001",
        red_task_id: -5,
        test_identifier: "test/db.test.ts::Database::should connect",
        status: "REGISTERED",
        created_at: "2026-01-14T10:00:00Z",
      };

      const result = TddRegistryEntrySchema.safeParse(entry);
      expect(result.success).toBe(false);
    });

    it("should reject negative green_task_id", () => {
      const entry = {
        id: 1,
        sprint_id: "sprint-001",
        red_task_id: 3,
        test_identifier: "test/db.test.ts::Database::should connect",
        status: "PENDING_GREEN",
        green_task_id: -8,
        created_at: "2026-01-14T10:00:00Z",
      };

      const result = TddRegistryEntrySchema.safeParse(entry);
      expect(result.success).toBe(false);
    });

    it("should validate VALIDATED status", () => {
      const entry = {
        id: 2,
        sprint_id: "sprint-001",
        red_task_id: 3,
        test_identifier: "test/db.test.ts::Database::should connect",
        status: "VALIDATED",
        created_at: "2026-01-14T10:00:00Z",
        validated_at: "2026-01-14T10:30:00Z",
      };

      const result = TddRegistryEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("VALIDATED");
        expect(result.data.validated_at).toBe("2026-01-14T10:30:00Z");
      }
    });

    it("should validate PENDING_GREEN status with green_task_id", () => {
      const entry = {
        id: 3,
        sprint_id: "sprint-001",
        red_task_id: 3,
        test_identifier: "test/db.test.ts::Database::should connect",
        status: "PENDING_GREEN",
        green_task_id: 10,
        created_at: "2026-01-14T10:00:00Z",
        validated_at: "2026-01-14T10:30:00Z",
        assigned_at: "2026-01-14T11:00:00Z",
      };

      const result = TddRegistryEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("PENDING_GREEN");
        expect(result.data.green_task_id).toBe(10);
        expect(result.data.assigned_at).toBe("2026-01-14T11:00:00Z");
      }
    });
  });
});
