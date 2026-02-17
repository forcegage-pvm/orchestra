/**
 * TestCommandInterceptor - Detection and blocking of direct test commands
 * Aligned with specs/013-test-runner-tools/contracts/test-command-interception.md
 */

/**
 * Static utility for identifying test commands and providing redirect guidance.
 * Blocks 11 common test command patterns and directs agents to use
 * structured test runner tools instead.
 */ export class TestCommandInterceptor {
  /**
   * Blocked test command patterns.
   * All 11 patterns: 9 original + dart test + flutter test.
   */
  private static readonly BLOCKED_PATTERNS = [
    /^npm\s+test/,
    /^npm\s+run\s+test/,
    /^npx\s+vitest/,
    /^vitest\b/,
    /^pnpm\s+test/,
    /^pnpm\s+run\s+test/,
    /^yarn\s+test/,
    /^yarn\s+run\s+test/,
    /^node_modules\/\.bin\/vitest/,
    /^dart\s+test/,
    /^flutter\s+test/,
  ];
  /**
   * Check if command is a blocked test command.
   * Handles commands prefixed with `cd <path> &&` or `cd <path> ;` which
   * agents commonly use to set the working directory before running tests.
   * @param cmd Command string to check
   * @returns true if command matches any blocked pattern
   */
  static isTestCommand(cmd: string): boolean {
    const trimmedCmd = cmd.trim();
    // Check the raw command first
    if (this.BLOCKED_PATTERNS.some((pattern) => pattern.test(trimmedCmd))) {
      return true;
    }
    // Also check after stripping `cd <path> &&` or `cd <path> ;` prefix
    const afterCd = trimmedCmd.replace(/^cd\s+[^&;]+(?:&&|;)\s*/i, "");
    if (afterCd !== trimmedCmd) {
      return this.BLOCKED_PATTERNS.some((pattern) => pattern.test(afterCd));
    }
    return false;
  }

  /**
   * Get redirect message for blocked test commands.
   * Provides guidance on using structured test runner tools.
   * @param cmd Command that was intercepted (currently unused, reserved for future context)
   * @returns Formatted redirect message
   */
  static getRedirectMessage(_cmd: string): string {
    return (
      "\u2717 run_command: TEST_COMMAND_BLOCKED\n\n" +
      "Direct test execution is blocked. Use the test runner tools for:\n" +
      '  \u2022 Scoped execution:     run_tests with scope="file", "pattern", "suite", "related"\n' +
      '  \u2022 TDD red-phase:        run_tests with scope="red"\n' +
      '  \u2022 Re-run failures:      run_tests with scope="failed"\n' +
      '  \u2022 Full suite:           run_tests with scope="all"\n' +
      "  \u2022 View past results:    get_test_results\n" +
      "  \u2022 Discover tests:       list_test_suites\n\n" +
      "These tools provide caching, compressed output, and red-phase isolation\n" +
      "that raw terminal commands cannot."
    );
  }
}
