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
} from "../../src/schemas/tdd-registry.js";

describe("TDD Registry Schemas", () => {
  // TddRegistryStatusSchema removed - status tracking eliminated in scan-on-signal architecture

  describe("RegisterTddRedTestInputSchema", () => {
    it("should validate valid input with required fields", () => {
      const input = {
        task_id: 5,
        test_identifier: "test/auth.test.ts::Authentication::should fail login",
      };

      const result = RegisterTddRedTestInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.task_id).toBe(5);
        expect(result.data.test_identifier).toBe(
          "test/auth.test.ts::Authentication::should fail login"
        );
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
        expect(result.data.next_step).toContain("npm test");
      }
    });

    it("should reject missing success field", () => {
      const output = {
        registry_id: 123,
        test_identifier: "test/auth.test.ts::Authentication::should fail login",
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
    it("should validate entry with all fields", () => {
      const entry = {
        id: 42,
        sprint_id: "sprint-010",
        red_task_id: 5,
        test_identifier: "test/auth.test.ts::Authentication::should fail login",
        test_file: "test/auth.test.ts",
        created_at: "2026-01-14T10:00:00Z",
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
        expect(result.data.test_file).toBe("test/auth.test.ts");
        expect(result.data.created_at).toBe("2026-01-14T10:00:00Z");
      }
    });

    it("should validate entry without optional test_file", () => {
      const entry = {
        id: 1,
        sprint_id: "sprint-001",
        red_task_id: 3,
        test_identifier: "test/db.test.ts::Database::should connect",
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
        expect(result.data.created_at).toBe("2026-01-14T10:00:00Z");
      }
    });

    it("should reject missing id", () => {
      const entry = {
        sprint_id: "sprint-001",
        red_task_id: 3,
        test_identifier: "test/db.test.ts::Database::should connect",
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
        created_at: "2026-01-14T10:00:00Z",
      };

      const result = TddRegistryEntrySchema.safeParse(entry);
      expect(result.success).toBe(false);
    });
  });
});
