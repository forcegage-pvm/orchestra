/**
 * TestResultStore - In-memory cache for test results
 * Aligned with specs/013-test-runner-tools/data-model.md §4.1
 */

import type { CacheEntry, CacheKey, RunTestsResult } from "./types.js";

/**
 * Map-based in-memory cache for test results.
 * Keys are composite strings derived from scope + target + workingDir.
 * Cache entries are matched by fingerprint to detect source changes.
 */
export class TestResultStore {
  /** Main cache: composite key → CacheEntry */
  private readonly cache = new Map<string, CacheEntry>();

  /** Failed test tracking: workingDir → failed test names */
  private readonly lastFailedTests = new Map<string, string[]>();

  /**
   * Compute deterministic cache key from components.
   */
  private computeKey(key: CacheKey): string {
    const { scope, target, workingDir } = key;
    return `${scope}|${target}|${workingDir}`;
  }

  /**
   * Retrieve cached result if fingerprint matches.
   * @param key Cache key components
   * @param currentFingerprint Current source/test file fingerprint
   * @returns Cached result if fingerprint matches, undefined otherwise
   */
  get(key: CacheKey, currentFingerprint: string): RunTestsResult | undefined {
    const cacheKey = this.computeKey(key);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return undefined;
    }

    // Only return cached result if fingerprint matches
    if (entry.fingerprint === currentFingerprint) {
      return entry.result;
    }

    return undefined;
  }

  /**
   * Store test result with fingerprint.
   * @param key Cache key components
   * @param fingerprint Fingerprint of source/test files
   * @param result Test run result
   * @param files List of files included in the fingerprint
   */
  set(
    key: CacheKey,
    fingerprint: string,
    result: RunTestsResult,
    files: string[],
  ): void {
    const cacheKey = this.computeKey(key);
    const entry: CacheEntry = {
      fingerprint,
      result,
      cachedAt: Date.now(),
      fingerprintedFiles: files,
    };
    this.cache.set(cacheKey, entry);
  }

  /**
   * Invalidate all cached results.
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Record failed test names for a working directory.
   * Used for "failed" scope re-runs.
   * @param workingDir Working directory path
   * @param failedTestNames List of failed test names
   */
  recordFailures(workingDir: string, failedTestNames: string[]): void {
    this.lastFailedTests.set(workingDir, failedTestNames);
  }

  /**
   * Retrieve previously recorded failed test names.
   * @param workingDir Working directory path
   * @returns Array of failed test names, or undefined if none recorded
   */
  getLastFailedTests(workingDir: string): string[] | undefined {
    return this.lastFailedTests.get(workingDir);
  }

  /**
   * Clear both cache and failed test tracking.
   */
  clear(): void {
    this.cache.clear();
    this.lastFailedTests.clear();
  }

  /**
   * Get the most recently cached result across all cache entries.
   * @returns The most recent RunTestsResult, or undefined if cache is empty
   */
  getLatest(): RunTestsResult | undefined {
    let latestEntry: CacheEntry | undefined;
    let latestTime = 0;

    for (const entry of this.cache.values()) {
      if (entry.cachedAt > latestTime) {
        latestTime = entry.cachedAt;
        latestEntry = entry;
      }
    }

    return latestEntry?.result;
  }

  /**
   * Get a cached result by its run ID.
   * @param runId The run ID to search for
   * @returns The matching RunTestsResult, or undefined if not found
   */
  getByRunId(runId: string): RunTestsResult | undefined {
    for (const entry of this.cache.values()) {
      if (entry.result.runId === runId) {
        return entry.result;
      }
    }
    return undefined;
  }

  /**
   * Check if the store has any cached results.
   * @returns true if cache is non-empty
   */
  hasResults(): boolean {
    return this.cache.size > 0;
  }
}
