/**
 * TestCommandInterceptor unit tests
 */

import { describe, expect, it } from "vitest";
import { TestCommandInterceptor } from "../../../../src/agents/tools/testing/TestCommandInterceptor.js";

describe("TestCommandInterceptor", () => {
  describe("isTestCommand()", () => {
    it("should return true for 'npm test'", () => {
      expect(TestCommandInterceptor.isTestCommand("npm test")).toBe(true);
    });

    it("should return true for 'npm run test'", () => {
      expect(TestCommandInterceptor.isTestCommand("npm run test")).toBe(true);
    });

    it("should return true for 'npx vitest'", () => {
      expect(TestCommandInterceptor.isTestCommand("npx vitest")).toBe(true);
    });

    it("should return true for 'vitest' standalone", () => {
      expect(TestCommandInterceptor.isTestCommand("vitest")).toBe(true);
    });

    it("should return true for 'pnpm test'", () => {
      expect(TestCommandInterceptor.isTestCommand("pnpm test")).toBe(true);
    });

    it("should return true for 'pnpm run test'", () => {
      expect(TestCommandInterceptor.isTestCommand("pnpm run test")).toBe(true);
    });

    it("should return true for 'yarn test'", () => {
      expect(TestCommandInterceptor.isTestCommand("yarn test")).toBe(true);
    });

    it("should return true for 'yarn run test'", () => {
      expect(TestCommandInterceptor.isTestCommand("yarn run test")).toBe(true);
    });

    it("should return true for 'node_modules/.bin/vitest'", () => {
      expect(
        TestCommandInterceptor.isTestCommand("node_modules/.bin/vitest"),
      ).toBe(true);
    });

    it("should return true for test commands with arguments", () => {
      expect(
        TestCommandInterceptor.isTestCommand("npm test -- --coverage"),
      ).toBe(true);
      expect(
        TestCommandInterceptor.isTestCommand("npx vitest run --watch"),
      ).toBe(true);
      expect(TestCommandInterceptor.isTestCommand("vitest --ui")).toBe(true);
    });

    it("should return false for 'npm install'", () => {
      expect(TestCommandInterceptor.isTestCommand("npm install")).toBe(false);
    });

    it("should return false for 'npx eslint'", () => {
      expect(TestCommandInterceptor.isTestCommand("npx eslint")).toBe(false);
    });

    it("should return false for 'npm run build'", () => {
      expect(TestCommandInterceptor.isTestCommand("npm run build")).toBe(false);
    });

    it("should return false for 'node script.js'", () => {
      expect(TestCommandInterceptor.isTestCommand("node script.js")).toBe(
        false,
      );
    });

    it("should return false for 'pnpm install'", () => {
      expect(TestCommandInterceptor.isTestCommand("pnpm install")).toBe(false);
    });

    it("should return false for 'yarn install'", () => {
      expect(TestCommandInterceptor.isTestCommand("yarn install")).toBe(false);
    });

    it("should return false for 'npm run dev'", () => {
      expect(TestCommandInterceptor.isTestCommand("npm run dev")).toBe(false);
    });

    it("should handle leading whitespace", () => {
      expect(TestCommandInterceptor.isTestCommand("  npm test")).toBe(true);
      expect(TestCommandInterceptor.isTestCommand("\tnpx vitest")).toBe(true);
      expect(TestCommandInterceptor.isTestCommand("  npm install")).toBe(
        false,
      );
    });

    it("should handle trailing whitespace", () => {
      expect(TestCommandInterceptor.isTestCommand("npm test  ")).toBe(true);
      expect(TestCommandInterceptor.isTestCommand("npm install  ")).toBe(
        false,
      );
    });
  });

  describe("getRedirectMessage()", () => {
    it("should return message mentioning run_tests", () => {
      const message = TestCommandInterceptor.getRedirectMessage("npm test");
      expect(message).toContain("run_tests");
    });

    it("should return message mentioning get_test_results", () => {
      const message = TestCommandInterceptor.getRedirectMessage("npm test");
      expect(message).toContain("get_test_results");
    });

    it("should return message mentioning list_test_suites", () => {
      const message = TestCommandInterceptor.getRedirectMessage("npm test");
      expect(message).toContain("list_test_suites");
    });

    it("should return message with TEST_COMMAND_BLOCKED indicator", () => {
      const message = TestCommandInterceptor.getRedirectMessage("npm test");
      expect(message).toContain("TEST_COMMAND_BLOCKED");
    });

    it("should return message listing test scopes", () => {
      const message = TestCommandInterceptor.getRedirectMessage("npm test");
      expect(message).toContain("file");
      expect(message).toContain("pattern");
      expect(message).toContain("suite");
      expect(message).toContain("related");
      expect(message).toContain("red");
      expect(message).toContain("failed");
      expect(message).toContain("all");
    });

    it("should return message explaining benefits of structured tools", () => {
      const message = TestCommandInterceptor.getRedirectMessage("npm test");
      expect(message).toContain("caching");
      expect(message).toContain("compressed output");
      expect(message).toContain("red-phase isolation");
    });

    it("should return consistent message format", () => {
      const message1 = TestCommandInterceptor.getRedirectMessage("npm test");
      const message2 = TestCommandInterceptor.getRedirectMessage("yarn test");
      const message3 = TestCommandInterceptor.getRedirectMessage(
        "npx vitest",
      );

      // Message format should be consistent regardless of command
      expect(message1).toBe(message2);
      expect(message1).toBe(message3);
    });
  });
});
