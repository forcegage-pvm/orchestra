/**
 * Tests for agent directory structure
 * Verifies that all required directories exist for the custom AI coding agents feature
 */

import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "vitest";

describe("Agent Directory Structure", () => {
  const extensionRoot = path.resolve(__dirname, "../../..");
  const agentsRoot = path.join(extensionRoot, "src", "agents");

  test("extension/src/agents/ directory exists", () => {
    expect(fs.existsSync(agentsRoot)).toBe(true);
    expect(fs.statSync(agentsRoot).isDirectory()).toBe(true);
  });

  test("extension/src/agents/.gitkeep exists", () => {
    const gitkeepPath = path.join(agentsRoot, ".gitkeep");
    expect(fs.existsSync(gitkeepPath)).toBe(true);
    expect(fs.statSync(gitkeepPath).isFile()).toBe(true);
  });

  describe("Tools subdirectory structure", () => {
    const toolsRoot = path.join(agentsRoot, "tools");

    test("extension/src/agents/tools/ directory exists", () => {
      expect(fs.existsSync(toolsRoot)).toBe(true);
      expect(fs.statSync(toolsRoot).isDirectory()).toBe(true);
    });

    test("extension/src/agents/tools/.gitkeep exists", () => {
      const gitkeepPath = path.join(toolsRoot, ".gitkeep");
      expect(fs.existsSync(gitkeepPath)).toBe(true);
      expect(fs.statSync(gitkeepPath).isFile()).toBe(true);
    });

    test("extension/src/agents/tools/coding/ directory exists", () => {
      const codingPath = path.join(toolsRoot, "coding");
      expect(fs.existsSync(codingPath)).toBe(true);
      expect(fs.statSync(codingPath).isDirectory()).toBe(true);
    });

    test("extension/src/agents/tools/coding/.gitkeep exists", () => {
      const gitkeepPath = path.join(toolsRoot, "coding", ".gitkeep");
      expect(fs.existsSync(gitkeepPath)).toBe(true);
      expect(fs.statSync(gitkeepPath).isFile()).toBe(true);
    });

    test("extension/src/agents/tools/orchestra/ directory exists", () => {
      const orchestraPath = path.join(toolsRoot, "orchestra");
      expect(fs.existsSync(orchestraPath)).toBe(true);
      expect(fs.statSync(orchestraPath).isDirectory()).toBe(true);
    });

    test("extension/src/agents/tools/orchestra/.gitkeep exists", () => {
      const gitkeepPath = path.join(toolsRoot, "orchestra", ".gitkeep");
      expect(fs.existsSync(gitkeepPath)).toBe(true);
      expect(fs.statSync(gitkeepPath).isFile()).toBe(true);
    });

    test("extension/src/agents/tools/system/ directory exists", () => {
      const systemPath = path.join(toolsRoot, "system");
      expect(fs.existsSync(systemPath)).toBe(true);
      expect(fs.statSync(systemPath).isDirectory()).toBe(true);
    });

    test("extension/src/agents/tools/system/.gitkeep exists", () => {
      const gitkeepPath = path.join(toolsRoot, "system", ".gitkeep");
      expect(fs.existsSync(gitkeepPath)).toBe(true);
      expect(fs.statSync(gitkeepPath).isFile()).toBe(true);
    });
  });

  describe("Memory subdirectory structure", () => {
    const memoryRoot = path.join(agentsRoot, "memory");

    test("extension/src/agents/memory/ directory exists", () => {
      expect(fs.existsSync(memoryRoot)).toBe(true);
      expect(fs.statSync(memoryRoot).isDirectory()).toBe(true);
    });

    test("extension/src/agents/memory/.gitkeep exists", () => {
      const gitkeepPath = path.join(memoryRoot, ".gitkeep");
      expect(fs.existsSync(gitkeepPath)).toBe(true);
      expect(fs.statSync(gitkeepPath).isFile()).toBe(true);
    });
  });

  describe("Complete directory tree verification", () => {
    test("all required directories and .gitkeep files exist", () => {
      const requiredPaths = [
        { dir: agentsRoot, desc: "agents root" },
        { dir: path.join(agentsRoot, "tools"), desc: "tools parent" },
        { dir: path.join(agentsRoot, "tools", "coding"), desc: "coding tools" },
        {
          dir: path.join(agentsRoot, "tools", "orchestra"),
          desc: "orchestra tools",
        },
        { dir: path.join(agentsRoot, "tools", "system"), desc: "system tools" },
        { dir: path.join(agentsRoot, "memory"), desc: "memory" },
      ];

      for (const { dir, desc } of requiredPaths) {
        expect(fs.existsSync(dir), `${desc} directory should exist`).toBe(true);
        expect(
          fs.statSync(dir).isDirectory(),
          `${desc} should be a directory`,
        ).toBe(true);

        const gitkeepPath = path.join(dir, ".gitkeep");
        expect(
          fs.existsSync(gitkeepPath),
          `${desc} .gitkeep should exist`,
        ).toBe(true);
        expect(
          fs.statSync(gitkeepPath).isFile(),
          `${desc} .gitkeep should be a file`,
        ).toBe(true);
      }
    });
  });
});
