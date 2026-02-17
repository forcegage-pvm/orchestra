/**
 * TestResultStore - In-memory cache for test results
 * Aligned with specs/013-test-runner-tools/data-model.md §4.1
 */
/**
 * Map-based in-memory cache for test results.
 * Keys are composite strings derived from scope + target + workingDir.
 * Cache entries are matched by fingerprint to detect source changes.
 */
export class TestResultStore {
    /** Main cache: composite key → CacheEntry */
    cache = new Map();
    /** Failed test tracking: workingDir → failed test names */
    lastFailedTests = new Map();
    /**
     * Compute deterministic cache key from components.
     */
    computeKey(key) {
        const { scope, target, workingDir } = key;
        return `${scope}|${target}|${workingDir}`;
    }
    /**
     * Retrieve cached result if fingerprint matches.
     * @param key Cache key components
     * @param currentFingerprint Current source/test file fingerprint
     * @returns Cached result if fingerprint matches, undefined otherwise
     */
    get(key, currentFingerprint) {
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
    set(key, fingerprint, result, files) {
        const cacheKey = this.computeKey(key);
        const entry = {
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
    invalidateAll() {
        this.cache.clear();
    }
    /**
     * Record failed test names for a working directory.
     * Used for "failed" scope re-runs.
     * @param workingDir Working directory path
     * @param failedTestNames List of failed test names
     */
    recordFailures(workingDir, failedTestNames) {
        this.lastFailedTests.set(workingDir, failedTestNames);
    }
    /**
     * Retrieve previously recorded failed test names.
     * @param workingDir Working directory path
     * @returns Array of failed test names, or undefined if none recorded
     */
    getLastFailedTests(workingDir) {
        return this.lastFailedTests.get(workingDir);
    }
    /**
     * Clear both cache and failed test tracking.
     */
    clear() {
        this.cache.clear();
        this.lastFailedTests.clear();
    }
}
