/**
 * Unit tests for ExecutionLock class
 */

import { describe, expect, it, beforeEach } from "vitest";

import { ExecutionLock } from "../../../../../../src/core/testing/types.js";

describe("ExecutionLock", () => {
  let lock: ExecutionLock;

  beforeEach(() => {
    lock = new ExecutionLock();
  });

  describe("acquire", () => {
    it("should successfully acquire lock when not held", () => {
      const acquired = lock.acquire("test-scope");
      expect(acquired).toBe(true);
      expect(lock.isLocked()).toBe(true);
      expect(lock.getCurrentScope()).toBe("test-scope");
    });

    it("should fail to acquire lock when already held", () => {
      const firstAcquire = lock.acquire("first-scope");
      expect(firstAcquire).toBe(true);

      const secondAcquire = lock.acquire("second-scope");
      expect(secondAcquire).toBe(false);
      expect(lock.getCurrentScope()).toBe("first-scope"); // Still holds first scope
    });

    it("should support multiple acquire attempts with different scopes", () => {
      expect(lock.acquire("scope-1")).toBe(true);
      expect(lock.acquire("scope-2")).toBe(false);
      expect(lock.acquire("scope-3")).toBe(false);
      expect(lock.getCurrentScope()).toBe("scope-1");
    });
  });

  describe("release", () => {
    it("should release lock after acquisition", () => {
      lock.acquire("test-scope");
      expect(lock.isLocked()).toBe(true);

      lock.release();
      expect(lock.isLocked()).toBe(false);
      expect(lock.getCurrentScope()).toBeUndefined();
    });

    it("should allow re-acquisition after release", () => {
      lock.acquire("first-scope");
      lock.release();

      const reacquired = lock.acquire("second-scope");
      expect(reacquired).toBe(true);
      expect(lock.getCurrentScope()).toBe("second-scope");
    });

    it("should be idempotent when lock not held", () => {
      expect(lock.isLocked()).toBe(false);
      lock.release(); // Release when not locked
      expect(lock.isLocked()).toBe(false);
      expect(lock.getCurrentScope()).toBeUndefined();
    });
  });

  describe("isLocked", () => {
    it("should return false when lock not held", () => {
      expect(lock.isLocked()).toBe(false);
    });

    it("should return true when lock held", () => {
      lock.acquire("test-scope");
      expect(lock.isLocked()).toBe(true);
    });

    it("should return false after release", () => {
      lock.acquire("test-scope");
      lock.release();
      expect(lock.isLocked()).toBe(false);
    });
  });

  describe("getCurrentScope", () => {
    it("should return undefined when lock not held", () => {
      expect(lock.getCurrentScope()).toBeUndefined();
    });

    it("should return current scope when lock held", () => {
      lock.acquire("test-scope");
      expect(lock.getCurrentScope()).toBe("test-scope");
    });

    it("should preserve scope across failed acquisition attempts", () => {
      lock.acquire("first-scope");
      lock.acquire("second-scope"); // Should fail

      expect(lock.getCurrentScope()).toBe("first-scope");
    });

    it("should return undefined after release", () => {
      lock.acquire("test-scope");
      lock.release();
      expect(lock.getCurrentScope()).toBeUndefined();
    });
  });

  describe("concurrent rejection", () => {
    it("should reject concurrent test runs", () => {
      const firstRun = lock.acquire("run_tests: scope=file target=foo.test.ts");
      expect(firstRun).toBe(true);

      const secondRun = lock.acquire(
        "run_tests: scope=suite target=integration",
      );
      expect(secondRun).toBe(false);
      expect(lock.getCurrentScope()).toBe(
        "run_tests: scope=file target=foo.test.ts",
      );
    });

    it("should allow sequential test runs", () => {
      lock.acquire("run_tests: scope=file target=foo.test.ts");
      lock.release();

      const secondRun = lock.acquire(
        "run_tests: scope=suite target=integration",
      );
      expect(secondRun).toBe(true);
      expect(lock.getCurrentScope()).toBe(
        "run_tests: scope=suite target=integration",
      );
    });
  });
});
