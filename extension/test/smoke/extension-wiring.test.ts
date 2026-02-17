/**
 * Smoke tests: extension test infrastructure wiring
 *
 * Validates that critical test infrastructure files exist and are
 * properly configured — vscode mock, native module setup, vitest
 * config aliases, and agent prompt files.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { describe, expect, it } from "vitest";

const EXT_ROOT = path.resolve(__dirname, "../..");

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------

describe("Smoke: vscode mock", () => {
  it("vscode mock file should exist", async () => {
    const mockPath = path.join(EXT_ROOT, "test/__mocks__/vscode.ts");
    expect(await pathExists(mockPath), "test/__mocks__/vscode.ts missing").toBe(
      true,
    );
  });

  it("vscode mock should export Uri and ThemeColor", async () => {
    const content = await fs.readFile(
      path.join(EXT_ROOT, "test/__mocks__/vscode.ts"),
      "utf8",
    );
    expect(content).toContain("Uri");
    expect(content).toContain("ThemeColor");
  });
});

describe("Smoke: vitest config aliases", () => {
  it("extension vitest.config.ts should alias vscode to mock", async () => {
    const content = await fs.readFile(
      path.join(EXT_ROOT, "vitest.config.ts"),
      "utf8",
    );
    expect(content).toContain("vscode");
    expect(content).toContain("__mocks__/vscode");
  });

  it("extension vitest.config.ts should alias better-sqlite3 to root", async () => {
    const content = await fs.readFile(
      path.join(EXT_ROOT, "vitest.config.ts"),
      "utf8",
    );
    expect(content).toContain("better-sqlite3");
    expect(content).toContain("../node_modules/better-sqlite3");
  });
});

describe("Smoke: native module global setup", () => {
  it("ensure-native-modules.ts should exist", async () => {
    const setupPath = path.join(
      EXT_ROOT,
      "test/setup/ensure-native-modules.ts",
    );
    expect(
      await pathExists(setupPath),
      "test/setup/ensure-native-modules.ts missing",
    ).toBe(true);
  });

  it("vitest.config.ts should reference ensure-native-modules in globalSetup", async () => {
    const content = await fs.readFile(
      path.join(EXT_ROOT, "vitest.config.ts"),
      "utf8",
    );
    expect(content).toContain("ensure-native-modules");
    expect(content).toContain("globalSetup");
  });
});

describe("Smoke: agent prompt files", () => {
  const expectedAgents = [
    "orchestra.orchestrator.agent.md",
    "orchestra.implementor.agent.md",
    "orchestra.controller.agent.md",
  ];

  for (const agentFile of expectedAgents) {
    it(`${agentFile} should exist`, async () => {
      const agentPath = path.join(EXT_ROOT, "agents", agentFile);
      expect(await pathExists(agentPath), `agents/${agentFile} missing`).toBe(
        true,
      );
    });
  }

  it("agent files should be non-empty", async () => {
    for (const agentFile of expectedAgents) {
      const agentPath = path.join(EXT_ROOT, "agents", agentFile);
      const stat = await fs.stat(agentPath);
      expect(stat.size, `agents/${agentFile} is empty`).toBeGreaterThan(100);
    }
  });
});

describe("Smoke: extension test domain directories", () => {
  const expectedDomains = [
    "test/unit/agents",
    "test/unit/commands",
    "test/unit/views",
    "test/unit/database",
  ];

  for (const dir of expectedDomains) {
    it(`${dir}/ should exist`, async () => {
      expect(
        await pathExists(path.join(EXT_ROOT, dir)),
        `${dir}/ missing`,
      ).toBe(true);
    });
  }
});
