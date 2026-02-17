/**
 * ResultFormatter - Compress Vitest JSON output into token-efficient summaries
 * Transforms raw Vitest reporter output into RunTestsResult format
 * Aligned with specs/013-test-runner-tools/data-model.md §3.4
 */
/**
 * Transforms raw Vitest JSON output into token-efficient RunTestsResult summaries.
 * Produces ~50-100 token summaries for passing runs, structured failure details for failures.
 */
export class ResultFormatter {
    /**
     * Transform Vitest JSON output into RunTestsResult.
     * @param vitestJson Raw Vitest JSON reporter output
     * @param options Formatting options (maxFailureLines)
     * @returns RunTestsResult conforming to types.ts interface
     */
    format(vitestJson, options) {
        // Parse and validate structure
        const parsed = this.parseVitestJson(vitestJson);
        // Extract counts
        const total = parsed.numTotalTests ?? 0;
        const passed = parsed.numPassedTests ?? 0;
        const failed = parsed.numFailedTests ?? 0;
        const skipped = parsed.numPendingTests ?? 0;
        // Convert test results to TestOutcome[]
        const tests = this.convertTestResults(parsed.testResults ?? [], options);
        // Calculate duration
        const duration = this.calculateDuration(parsed.testResults ?? []);
        // Generate summary
        const result = {
            runId: this.generateRunId(),
            scope: "all", // Default - will be overridden by caller
            cached: false,
            fingerprint: "",
            timestamp: new Date().toISOString(),
            workingDir: "",
            total,
            passed,
            failed,
            skipped,
            duration,
            tests,
            summary: "",
        };
        // Generate summary string
        result.summary = this.formatSummary(result);
        return result;
    }
    /**
     * Produce a single-line compressed summary.
     * Format: "PASS | N passed, N failed, N skipped | X.Xs"
     * @param result RunTestsResult to summarize
     * @returns Single-line summary string
     */
    formatSummary(result) {
        const status = result.failed > 0 ? "FAIL" : "PASS";
        const durationSec = (result.duration / 1000).toFixed(1);
        return `${status} | ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped | ${durationSec}s`;
    }
    /**
     * Produce structured failure details for failed tests.
     * Format per failure:
     *   ✗ describe > test name
     *     path/to/test.ts:42
     *     Expected: { valid: true }
     *     Actual:   { valid: false }
     *
     * @param tests Array of test outcomes
     * @param maxLines Maximum lines per failure detail
     * @returns Formatted failure details string
     */
    formatFailures(tests, maxLines) {
        const failures = tests.filter((t) => t.status === "failed");
        if (failures.length === 0) {
            return "No failures.";
        }
        const formatted = failures.map((test) => {
            const lines = [];
            // Test name with ✗ marker
            lines.push(`✗ ${test.name}`);
            // File location
            lines.push(`  ${test.file}:${test.line}`);
            // Failure details
            if (test.failure) {
                const { message, expected, actual, stack } = test.failure;
                // Error message
                if (message) {
                    lines.push(`  ${message}`);
                }
                // Expected/Actual values
                if (expected) {
                    lines.push(`  Expected: ${expected}`);
                }
                if (actual) {
                    lines.push(`  Actual:   ${actual}`);
                }
                // Stack trace (compressed)
                if (stack.length > 0) {
                    lines.push(`  Stack:`);
                    stack.forEach((frame) => {
                        lines.push(`    ${frame}`);
                    });
                }
            }
            // Truncate if exceeds maxLines
            if (lines.length > maxLines) {
                const truncatedCount = lines.length - maxLines;
                lines.splice(maxLines);
                lines.push(`  ... (${truncatedCount} lines truncated)`);
            }
            return lines.join("\n");
        });
        return formatted.join("\n\n");
    }
    /**
     * Invert red-phase test results: failures become "correctly failing" (expected),
     * passes become "unexpectedly passing" (problem since implementation is complete).
     *
     * When all tests pass, readyForPromotion=true indicates the implementation is complete
     * and tests can be promoted from the red directory to standard tiers.
     *
     * @param result The normal RunTestsResult from a red-phase test run
     * @param config Test configuration with tier definitions
     * @returns RedPhaseResult with inverted interpretation and promotion targets
     */
    invertRedPhase(result, config) {
        // In red-phase interpretation:
        // - "passed" tests are "unexpectedly passing" (problem - they should fail until implemented)
        // - "failed" tests are "correctly failing" (expected in TDD red phase)
        const correctlyFailing = result.failed;
        const unexpectedlyPassing = result.passed;
        // Ready for promotion when ALL tests pass (unexpectedlyPassing = all tests)
        // This means the implementation is complete
        const readyForPromotion = result.failed === 0 && result.total > 0;
        // Generate promotion targets for each unique test file
        const promotionTargets = this.generatePromotionTargets(result.tests, config);
        return {
            correctlyFailing,
            unexpectedlyPassing,
            readyForPromotion,
            promotionTargets,
        };
    }
    /**
     * Generate promotion targets for red-phase test files.
     * Infers destination tier and path from subdirectory structure within the red directory.
     *
     * Example: test/red/unit/foo.test.ts → test/unit/foo.test.ts (tier: unit)
     *
     * @param tests Array of test outcomes from the run
     * @param config Test configuration with tier definitions
     * @returns Array of PromotionTarget entries
     */
    generatePromotionTargets(tests, config) {
        // Find the red tier to get its path prefix
        const redTier = config.tiers.find((t) => t.inverted === true);
        if (!redTier) {
            return [];
        }
        // Extract the base directory from the red tier path (e.g., "test/red/**/*.test.ts" → "test/red")
        const redBasePath = this.extractDirectoryFromGlob(redTier.path);
        // Group tests by file and determine pass/fail status per file
        const fileStatus = new Map();
        for (const test of tests) {
            const status = fileStatus.get(test.file) || { passing: 0, failing: 0 };
            if (test.status === "passed") {
                status.passing++;
            }
            else if (test.status === "failed") {
                status.failing++;
            }
            fileStatus.set(test.file, status);
        }
        const targets = [];
        const processedFiles = new Set();
        for (const test of tests) {
            if (processedFiles.has(test.file)) {
                continue;
            }
            processedFiles.add(test.file);
            const source = test.file;
            // Check if file is in red directory
            if (!source.startsWith(redBasePath)) {
                continue;
            }
            // Extract the path after the red directory
            // e.g., "test/red/unit/foo.test.ts" with redBasePath "test/red/" → "unit/foo.test.ts"
            const relativePath = source.slice(redBasePath.length);
            // Infer tier from the first subdirectory
            // e.g., "unit/foo.test.ts" → tier="unit", rest="foo.test.ts"
            const firstSlash = relativePath.indexOf("/");
            if (firstSlash === -1) {
                // File is directly in red directory without tier subdirectory, skip
                continue;
            }
            const inferredTierName = relativePath.slice(0, firstSlash);
            const restPath = relativePath.slice(firstSlash + 1);
            // Find the declared tier with this name
            const targetTier = config.tiers.find((t) => t.name === inferredTierName && !t.inverted);
            if (!targetTier) {
                // No matching tier found, but we still report the target with inferred values
                const destination = `test/${inferredTierName}/${restPath}`;
                const status = fileStatus.get(source);
                const eligible = status?.failing === 0 && (status?.passing ?? 0) > 0;
                targets.push({
                    source,
                    destination,
                    tier: inferredTierName,
                    eligible,
                });
                continue;
            }
            // Build destination from target tier's base path
            const targetBasePath = this.extractDirectoryFromGlob(targetTier.path);
            const destination = `${targetBasePath}${restPath}`;
            const status = fileStatus.get(source);
            // Eligible only if ALL tests in the file are passing
            const eligible = status?.failing === 0 && (status?.passing ?? 0) > 0;
            targets.push({
                source,
                destination,
                tier: inferredTierName,
                eligible,
            });
        }
        return targets;
    }
    /**
     * Extract directory path from a glob pattern.
     * @param globPattern Glob pattern string
     * @returns Directory path (with trailing slash if valid)
     */
    extractDirectoryFromGlob(globPattern) {
        // Find the first occurrence of a glob wildcard (* or ?)
        const wildcardIndex = globPattern.search(/[*?]/);
        if (wildcardIndex === -1) {
            // No wildcard - return as-is
            return globPattern.endsWith("/") ? globPattern : `${globPattern}/`;
        }
        // Extract everything before the wildcard
        const beforeWildcard = globPattern.substring(0, wildcardIndex);
        // Find the last directory separator before the wildcard
        const lastSlash = beforeWildcard.lastIndexOf("/");
        if (lastSlash === -1) {
            return "";
        }
        return beforeWildcard.substring(0, lastSlash + 1);
    }
    /**
     * Parse and validate Vitest JSON output structure.
     */
    parseVitestJson(vitestJson) {
        // Basic validation - ensure it's an object
        if (typeof vitestJson !== "object" || vitestJson === null) {
            return {};
        }
        return vitestJson;
    }
    /**
     * Convert Vitest test results to TestOutcome[] format.
     */
    convertTestResults(testResults, options) {
        const outcomes = [];
        for (const testResult of testResults) {
            const filePath = testResult.name;
            const assertions = testResult.assertionResults ?? [];
            for (const assertion of assertions) {
                const outcome = {
                    name: assertion.fullName ?? "unknown test",
                    file: filePath,
                    line: assertion.location?.line ?? 0,
                    status: this.normalizeStatus(assertion.status),
                    duration: assertion.duration ?? 0,
                };
                // Add failure details if test failed
                if (outcome.status === "failed" && assertion.failureMessages) {
                    outcome.failure = this.extractFailureDetails(assertion.failureMessages, options.maxFailureLines);
                }
                outcomes.push(outcome);
            }
        }
        return outcomes;
    }
    /**
     * Normalize Vitest status to TestOutcome status type.
     */
    normalizeStatus(status) {
        switch (status) {
            case "passed":
                return "passed";
            case "failed":
                return "failed";
            case "skipped":
            case "pending":
            case "todo":
                return "skipped";
            default:
                return "failed"; // Treat unknown as failed
        }
    }
    /**
     * Extract and compress failure details from error messages.
     */
    extractFailureDetails(failureMessages, _maxLines) {
        const fullMessage = failureMessages.join("\n");
        // Parse expected/actual from assertion errors
        const expectedMatch = fullMessage.match(/Expected:?\s*(.+?)(?:\n|$)/);
        const actualMatch = fullMessage.match(/Actual:?\s*(.+?)(?:\n|$)/);
        // Extract stack trace (compress to relevant frames)
        const stackLines = fullMessage
            .split("\n")
            .filter((line) => line.trim().startsWith("at "))
            .slice(0, 5); // Keep top 5 frames
        // Extract first line as message
        const message = fullMessage.split("\n")[0] || "Test failed";
        const detail = {
            message,
            stack: stackLines,
        };
        const expectedVal = expectedMatch?.[1]?.trim();
        if (expectedVal !== undefined)
            detail.expected = expectedVal;
        const actualVal = actualMatch?.[1]?.trim();
        if (actualVal !== undefined)
            detail.actual = actualVal;
        return detail;
    }
    /**
     * Calculate total duration from test results.
     */
    calculateDuration(testResults) {
        let totalDuration = 0;
        for (const testResult of testResults) {
            if (testResult.startTime && testResult.endTime) {
                totalDuration += testResult.endTime - testResult.startTime;
            }
        }
        return totalDuration;
    }
    /**
     * Generate a unique run ID.
     */
    generateRunId() {
        return `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
}
