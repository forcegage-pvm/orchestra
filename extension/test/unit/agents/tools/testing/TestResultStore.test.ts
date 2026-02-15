/**
 * TestResultStore unit tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import { TestResultStore } from "../../../../../../src/core/testing/TestResultStore.js";
import type {
  CacheKey,
  RunTestsResult,
} from "../../../../../../src/core/testing/types.js";

describe("TestResultStore", () => {
  let store: TestResultStore;
  let mockResult: RunTestsResult;

  beforeEach(() => {
    store = new TestResultStore();
    mockResult = {
      runId: "test-run-1",
      scope: "file",
      target: "test/example.test.ts",
      cached: false,
      fingerprint: "abc123",
      timestamp: new Date().toISOString(),
      workingDir: "/workspace",
      total: 10,
      passed: 10,
      failed: 0,
      skipped: 0,
      duration: 1000,
      tests: [],
      summary: "All tests passed",
    };
  });

  describe("get()", () => {
    it("should return undefined for empty cache", () => {
      const key: CacheKey = {
        scope: "file",
        target: "test/example.test.ts",
        workingDir: "/workspace",
      };
      const result = store.get(key, "abc123");
      expect(result).toBeUndefined();
    });

    it("should return undefined for fingerprint mismatch", () => {
      const key: CacheKey = {
        scope: "file",
        target: "test/example.test.ts",
        workingDir: "/workspace",
      };

      store.set(key, "abc123", mockResult, []);

      const result = store.get(key, "different-fingerprint");
      expect(result).toBeUndefined();
    });

    it("should return result for fingerprint match", () => {
      const key: CacheKey = {
        scope: "file",
        target: "test/example.test.ts",
        workingDir: "/workspace",
      };

      store.set(key, "abc123", mockResult, []);

      const result = store.get(key, "abc123");
      expect(result).toBeDefined();
      expect(result).toEqual(mockResult);
    });
  });

  describe("set()", () => {
    it("should store result and allow retrieval", () => {
      const key: CacheKey = {
        scope: "file",
        target: "test/example.test.ts",
        workingDir: "/workspace",
      };
      const files = ["src/counter.ts", "test/counter.test.ts"];

      store.set(key, "abc123", mockResult, files);

      const result = store.get(key, "abc123");
      expect(result).toEqual(mockResult);
    });

    it("should overwrite existing entry with same key", () => {
      const key: CacheKey = {
        scope: "file",
        target: "test/example.test.ts",
        workingDir: "/workspace",
      };

      const firstResult = { ...mockResult, runId: "run-1" };
      const secondResult = { ...mockResult, runId: "run-2" };

      store.set(key, "abc123", firstResult, []);
      store.set(key, "abc123", secondResult, []);

      const result = store.get(key, "abc123");
      expect(result?.runId).toBe("run-2");
    });
  });

  describe("invalidateAll()", () => {
    it("should clear all cached entries", () => {
      const key1: CacheKey = {
        scope: "file",
        target: "test/example1.test.ts",
        workingDir: "/workspace",
      };
      const key2: CacheKey = {
        scope: "file",
        target: "test/example2.test.ts",
        workingDir: "/workspace",
      };

      store.set(key1, "abc123", mockResult, []);
      store.set(key2, "def456", mockResult, []);

      store.invalidateAll();

      expect(store.get(key1, "abc123")).toBeUndefined();
      expect(store.get(key2, "def456")).toBeUndefined();
    });
  });

  describe("recordFailures() and getLastFailedTests()", () => {
    it("should store and retrieve failed test names", () => {
      const workingDir = "/workspace";
      const failures = ["should add numbers", "should subtract numbers"];

      store.recordFailures(workingDir, failures);

      const retrieved = store.getLastFailedTests(workingDir);
      expect(retrieved).toEqual(failures);
    });

    it("should return undefined for working dir with no recorded failures", () => {
      const result = store.getLastFailedTests("/unknown");
      expect(result).toBeUndefined();
    });

    it("should overwrite previous failures for same working dir", () => {
      const workingDir = "/workspace";

      store.recordFailures(workingDir, ["test-1", "test-2"]);
      store.recordFailures(workingDir, ["test-3"]);

      const retrieved = store.getLastFailedTests(workingDir);
      expect(retrieved).toEqual(["test-3"]);
    });
  });

  describe("clear()", () => {
    it("should clear both cache and lastFailedTests", () => {
      const key: CacheKey = {
        scope: "file",
        target: "test/example.test.ts",
        workingDir: "/workspace",
      };

      store.set(key, "abc123", mockResult, []);
      store.recordFailures("/workspace", ["failed-test"]);

      store.clear();

      expect(store.get(key, "abc123")).toBeUndefined();
      expect(store.getLastFailedTests("/workspace")).toBeUndefined();
    });
  });

  describe("getLatest()", () => {
    it("should return undefined for empty cache", () => {
      expect(store.getLatest()).toBeUndefined();
    });

    it("should return the most recently cached result", async () => {
      const key1: CacheKey = {
        scope: "file",
        target: "test/example1.test.ts",
        workingDir: "/workspace",
      };
      const key2: CacheKey = {
        scope: "file",
        target: "test/example2.test.ts",
        workingDir: "/workspace",
      };

      const result1 = { ...mockResult, runId: "run-older" };
      const result2 = { ...mockResult, runId: "run-newer" };

      store.set(key1, "abc123", result1, []);
      // Add slight delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      store.set(key2, "def456", result2, []);

      const latest = store.getLatest();
      expect(latest?.runId).toBe("run-newer");
    });
  });

  describe("getByRunId()", () => {
    it("should return undefined for non-existent run ID", () => {
      expect(store.getByRunId("non-existent")).toBeUndefined();
    });

    it("should return result matching the run ID", () => {
      const key: CacheKey = {
        scope: "file",
        target: "test/example.test.ts",
        workingDir: "/workspace",
      };

      store.set(key, "abc123", mockResult, []);

      const result = store.getByRunId("test-run-1");
      expect(result).toEqual(mockResult);
    });

    it("should find run ID across multiple cache entries", () => {
      const key1: CacheKey = {
        scope: "file",
        target: "test/example1.test.ts",
        workingDir: "/workspace",
      };
      const key2: CacheKey = {
        scope: "file",
        target: "test/example2.test.ts",
        workingDir: "/workspace",
      };

      const result1 = { ...mockResult, runId: "run-1" };
      const result2 = { ...mockResult, runId: "run-2" };

      store.set(key1, "abc123", result1, []);
      store.set(key2, "def456", result2, []);

      expect(store.getByRunId("run-1")).toEqual(result1);
      expect(store.getByRunId("run-2")).toEqual(result2);
    });
  });

  describe("hasResults()", () => {
    it("should return false for empty cache", () => {
      expect(store.hasResults()).toBe(false);
    });

    it("should return true when cache has entries", () => {
      const key: CacheKey = {
        scope: "file",
        target: "test/example.test.ts",
        workingDir: "/workspace",
      };

      store.set(key, "abc123", mockResult, []);

      expect(store.hasResults()).toBe(true);
    });

    it("should return false after clear()", () => {
      const key: CacheKey = {
        scope: "file",
        target: "test/example.test.ts",
        workingDir: "/workspace",
      };

      store.set(key, "abc123", mockResult, []);
      store.clear();

      expect(store.hasResults()).toBe(false);
    });
  });

  describe("computeKey() consistency", () => {
    it("should produce consistent keys for same inputs", () => {
      const key1: CacheKey = {
        scope: "file",
        target: "test/example.test.ts",
        workingDir: "/workspace",
      };
      const key2: CacheKey = {
        scope: "file",
        target: "test/example.test.ts",
        workingDir: "/workspace",
      };

      store.set(key1, "abc123", mockResult, []);
      const result = store.get(key2, "abc123");

      expect(result).toEqual(mockResult);
    });

    it("should produce different keys for different inputs", () => {
      const key1: CacheKey = {
        scope: "file",
        target: "test/example1.test.ts",
        workingDir: "/workspace",
      };
      const key2: CacheKey = {
        scope: "file",
        target: "test/example2.test.ts",
        workingDir: "/workspace",
      };

      store.set(key1, "abc123", { ...mockResult, runId: "run-1" }, []);
      store.set(key2, "abc123", { ...mockResult, runId: "run-2" }, []);

      const result1 = store.get(key1, "abc123");
      const result2 = store.get(key2, "abc123");

      expect(result1?.runId).toBe("run-1");
      expect(result2?.runId).toBe("run-2");
    });

    it("should distinguish by scope", () => {
      const key1: CacheKey = {
        scope: "file",
        target: "test/example.test.ts",
        workingDir: "/workspace",
      };
      const key2: CacheKey = {
        scope: "pattern",
        target: "test/example.test.ts",
        workingDir: "/workspace",
      };

      store.set(key1, "abc123", { ...mockResult, runId: "run-1" }, []);
      store.set(key2, "abc123", { ...mockResult, runId: "run-2" }, []);

      const result1 = store.get(key1, "abc123");
      const result2 = store.get(key2, "abc123");

      expect(result1?.runId).toBe("run-1");
      expect(result2?.runId).toBe("run-2");
    });

    it("should distinguish by workingDir", () => {
      const key1: CacheKey = {
        scope: "file",
        target: "test/example.test.ts",
        workingDir: "/workspace1",
      };
      const key2: CacheKey = {
        scope: "file",
        target: "test/example.test.ts",
        workingDir: "/workspace2",
      };

      store.set(key1, "abc123", { ...mockResult, runId: "run-1" }, []);
      store.set(key2, "abc123", { ...mockResult, runId: "run-2" }, []);

      const result1 = store.get(key1, "abc123");
      const result2 = store.get(key2, "abc123");

      expect(result1?.runId).toBe("run-1");
      expect(result2?.runId).toBe("run-2");
    });
  });
});
