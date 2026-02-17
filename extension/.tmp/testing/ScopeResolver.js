/**
 * ScopeResolver - Scope resolution for test execution
 * Resolves scope+target combinations into file lists or patterns
 * Aligned with specs/013-test-runner-tools/data-model.md §3.2
 */
import * as fs from "fs/promises";
import * as path from "path";
import { createToolError, ToolErrorCode } from "../errors.js";
/**
 * Resolves test scopes (file, pattern, suite, all) to file lists or patterns.
 *
 * Scope behaviors:
 * - file: returns the single target file path
 * - pattern: returns empty files array with pattern string (pass-through to vitest -t)
 * - suite: looks up tier name in config and returns tier glob pattern
 * - all: returns all non-inverted tier glob patterns
 * - related/red/failed: not yet supported (returns error)
 */
export class ScopeResolver {
    workspaceRoot;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    /**
     * Resolve scope+target to a file list or pattern.
     * @param scope Test scope type
     * @param target Optional target (meaning depends on scope)
     * @param config Test configuration with tier definitions
     * @param options Optional resolve options (getLastFailedTests callback for 'failed' scope)
     * @returns ScopeResult or ToolError for unsupported/invalid scopes
     */
    async resolve(scope, target, config, options) {
        switch (scope) {
            case "file":
                return this.resolveFile(target);
            case "pattern":
                return this.resolvePattern(target);
            case "suite":
                return this.resolveSuite(target, config);
            case "all":
                return this.resolveAll(config);
            case "red":
                return this.resolveRed(config);
            case "failed":
                return this.resolveFailed(options);
            case "related":
                return createToolError(ToolErrorCode.INVALID_INPUT, `Scope 'related' is not yet supported.`, `The 'related' scope will be implemented in a future task. Currently supported scopes: file, pattern, suite, all, red, failed.`, { scope, supportedScopes: ["file", "pattern", "suite", "all", "red", "failed"] });
            default: {
                // TypeScript exhaustiveness check - should never reach here
                const _exhaustive = scope;
                return createToolError(ToolErrorCode.INVALID_INPUT, `Unknown scope: ${String(_exhaustive)}`, "Use one of the supported scopes: file, pattern, suite, all, failed.", { scope: _exhaustive });
            }
        }
    }
    /**
     * Resolve 'file' scope - returns the single target file path if it exists.
     */
    async resolveFile(target) {
        if (!target) {
            return createToolError(ToolErrorCode.INVALID_INPUT, "Missing target for 'file' scope.", "Provide a test file path as the target parameter.");
        }
        // Check if file exists
        const filePath = path.resolve(this.workspaceRoot, target);
        try {
            const stat = await fs.stat(filePath);
            if (!stat.isFile()) {
                return createToolError(ToolErrorCode.FILE_NOT_FOUND, `Path exists but is not a file: ${target}`, "Ensure the target is a test file, not a directory.", { target, filePath });
            }
        }
        catch {
            return createToolError(ToolErrorCode.FILE_NOT_FOUND, `File not found: ${target}`, "Verify the file path is correct and the file exists.", { target, filePath });
        }
        return {
            files: [target],
            message: `File scope: ${target}`,
        };
    }
    /**
     * Resolve 'pattern' scope - returns empty files array with pattern string.
     * The pattern is passed through to vitest via the -t flag.
     */
    resolvePattern(target) {
        if (!target) {
            return createToolError(ToolErrorCode.INVALID_INPUT, "Missing target for 'pattern' scope.", "Provide a test name pattern as the target parameter.");
        }
        return {
            files: [],
            pattern: target,
            message: `Pattern scope: vitest will filter tests matching '${target}'`,
        };
    }
    /**
     * Resolve 'suite' scope - looks up tier name in config and returns tier glob.
     */
    resolveSuite(target, config) {
        if (!target) {
            return createToolError(ToolErrorCode.INVALID_INPUT, "Missing target for 'suite' scope.", `Provide a tier name as the target parameter. Available tiers: ${config.tiers.map((t) => t.name).join(", ")}.`);
        }
        // Look up tier by name
        const tier = config.tiers.find((t) => t.name === target);
        if (!tier) {
            const availableTiers = config.tiers.map((t) => t.name).join(", ");
            return createToolError(ToolErrorCode.TIER_NOT_CONFIGURED, `Tier '${target}' is not configured.`, `Available tiers: ${availableTiers}. Check your .agent-test-config.json.`, { requestedTier: target, availableTiers: config.tiers.map((t) => t.name) });
        }
        return {
            files: [tier.path],
            message: `Suite scope: tier '${tier.name}' → ${tier.path}`,
        };
    }
    /**
     * Resolve 'all' scope - returns all non-inverted tier glob patterns.
     * Excludes red-phase tiers (inverted=true).
     */
    resolveAll(config) {
        const nonInvertedTiers = config.tiers.filter((t) => !t.inverted);
        if (nonInvertedTiers.length === 0) {
            return {
                files: [],
                message: "No non-inverted tiers configured. All scope returned empty.",
            };
        }
        const files = nonInvertedTiers.map((t) => t.path);
        return {
            files,
            message: `All scope: ${nonInvertedTiers.length} tier(s) → ${files.join(", ")}`,
        };
    }
    /**
     * Resolve 'red' scope - returns the inverted tier's glob pattern.
     * If no inverted tier exists in config, returns empty result with explanatory message.
     */
    resolveRed(config) {
        // Find the tier with inverted=true (the red tier)
        const redTier = config.tiers.find((t) => t.inverted === true);
        if (!redTier) {
            return {
                files: [],
                message: "No red-phase tier configured. Add a tier with 'inverted: true' in .agent-test-config.json to enable TDD red-phase testing.",
            };
        }
        return {
            files: [redTier.path],
            message: `Red scope: tier '${redTier.name}' → ${redTier.path}`,
        };
    }
    /**
     * Resolve 'failed' scope - returns a pattern for re-running previously failed tests.
     * Queries TestResultStore.getLastFailedTests() to get failed test names from the last run.
     * Constructs a vitest -t pattern from the failed test names (regex-escaped and joined with `|`).
     *
     * @param options Resolve options containing getLastFailedTests callback and workingDir
     * @returns ScopeResult with pattern (for vitest -t), or informative message if no failures
     */
    resolveFailed(options) {
        // Check if getLastFailedTests callback is provided
        if (!options?.getLastFailedTests || !options?.workingDir) {
            return {
                files: [],
                message: "No previous test run recorded. Run tests first before using 'failed' scope.",
            };
        }
        // Query for last failed tests
        const failedTests = options.getLastFailedTests(options.workingDir);
        if (!failedTests || failedTests.length === 0) {
            return {
                files: [],
                message: "No failed tests from previous run. All tests passed or no tests have been run yet.",
            };
        }
        // Escape regex special characters in test names and join with |
        const escapedNames = failedTests.map((name) => this.escapeRegex(name));
        const pattern = escapedNames.join("|");
        return {
            files: [],
            pattern,
            message: `Failed scope: re-running ${failedTests.length} previously failed test(s)`,
        };
    }
    /**
     * Escape special regex characters in a string.
     * @param str String to escape
     * @returns Escaped string safe for use in regex
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
}
