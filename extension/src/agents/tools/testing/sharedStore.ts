/**
 * Shared TestResultStore singleton for cross-tool access.
 *
 * This module provides a shared instance of TestResultStore that is used by both:
 * - runTests.ts: stores results after test execution
 * - getTestResults.ts: retrieves results for formatting
 *
 * Ensures both tools operate on the same in-memory cache.
 */

import { TestResultStore } from "../../../../../src/core/testing/TestResultStore.js";

/**
 * Shared TestResultStore singleton.
 * Import this instance in all tools that need read/write access to test results.
 */
export const sharedResultStore = new TestResultStore();
