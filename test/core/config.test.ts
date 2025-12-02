/**
 * Configuration Management Tests
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findOrchestraRoot,
  getDefaultConfig,
  getOrchestraPath,
  isOrchestraInitialized,
  loadConfig,
  saveConfig,
} from "../../src/core/config.js";
import { ConfigurationError } from "../../src/core/errors.js";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-config-test-"));
});

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function createOrchestraDir(rootDir: string): void {
  const orchestraDir = path.join(rootDir, ".orchestra");
  fs.mkdirSync(orchestraDir, { recursive: true });

  const configPath = path.join(orchestraDir, "orchestra.yaml");
  const config = getDefaultConfig();
  fs.writeFileSync(
    configPath,
    `version: "${config.version}"\norchestra_dir: ".orchestra"\n`,
    "utf-8"
  );
}

describe("getDefaultConfig", () => {
  it("should return a valid default configuration", () => {
    const config = getDefaultConfig();

    expect(config.version).toBe("1.0.0");
    expect(config.orchestra_dir).toBe(".orchestra");
    expect(config.retry?.max_attempts).toBe(3);
    expect(config.notifications?.enabled).toBe(false);
  });
});

describe("findOrchestraRoot", () => {
  it("should find orchestra root in current directory", () => {
    createOrchestraDir(tempDir);

    const result = findOrchestraRoot(tempDir);

    expect(result).toBe(tempDir);
  });

  it("should find orchestra root in parent directory", () => {
    createOrchestraDir(tempDir);
    const nestedDir = path.join(tempDir, "nested", "deep");
    fs.mkdirSync(nestedDir, { recursive: true });

    const result = findOrchestraRoot(nestedDir);

    expect(result).toBe(tempDir);
  });

  it("should return null when orchestra root is not found", () => {
    const result = findOrchestraRoot(tempDir);

    expect(result).toBeNull();
  });

  it("should stop at filesystem root", () => {
    // This should not hang or throw - just return null
    const result = findOrchestraRoot(os.tmpdir());

    // Either finds one or returns null
    expect(result === null || typeof result === "string").toBe(true);
  });
});

describe("loadConfig", () => {
  it("should load configuration from orchestra directory", () => {
    createOrchestraDir(tempDir);

    const config = loadConfig(tempDir);

    expect(config.version).toBe("1.0.0");
    expect(config.orchestra_dir).toBe(".orchestra");
  });

  it("should throw ConfigurationError when root directory has no orchestra init", () => {
    // Create a directory that definitely has no .orchestra folder
    const isolatedDir = path.join(tempDir, "isolated-no-orchestra");
    fs.mkdirSync(isolatedDir, { recursive: true });
    
    // loadConfig with explicit rootDir that doesn't have .orchestra/orchestra.yaml
    // should throw because findOrchestraRoot will be called and return null
    expect(() => loadConfig(isolatedDir)).toThrow(ConfigurationError);
  });

  it("should return default config if config file exists but is minimal", () => {
    const orchestraDir = path.join(tempDir, ".orchestra");
    fs.mkdirSync(orchestraDir, { recursive: true });
    fs.writeFileSync(
      path.join(orchestraDir, "orchestra.yaml"),
      "version: '1.0.0'\norchestra_dir: '.orchestra'\n",
      "utf-8"
    );

    const config = loadConfig(tempDir);

    expect(config.version).toBe("1.0.0");
  });
});

describe("saveConfig", () => {
  it("should save configuration to orchestra directory", () => {
    const config = getDefaultConfig();

    saveConfig(config, tempDir);

    const savedPath = path.join(tempDir, ".orchestra", "orchestra.yaml");
    expect(fs.existsSync(savedPath)).toBe(true);
  });

  it("should create orchestra directory if it does not exist", () => {
    const config = getDefaultConfig();

    saveConfig(config, tempDir);

    const orchestraDir = path.join(tempDir, ".orchestra");
    expect(fs.existsSync(orchestraDir)).toBe(true);
  });
});

describe("getOrchestraPath", () => {
  it("should resolve path relative to orchestra directory", () => {
    createOrchestraDir(tempDir);

    const result = getOrchestraPath("manifest.yaml", tempDir);

    expect(result).toBe(path.join(tempDir, ".orchestra", "manifest.yaml"));
  });

  it("should resolve nested paths", () => {
    createOrchestraDir(tempDir);

    const result = getOrchestraPath("handover/current-task.md", tempDir);

    expect(result).toBe(
      path.join(tempDir, ".orchestra", "handover", "current-task.md")
    );
  });

  it("should throw ConfigurationError when orchestra is not initialized", () => {
    // Create a directory that definitely has no .orchestra folder
    const isolatedDir = path.join(tempDir, "isolated-no-orchestra-2");
    fs.mkdirSync(isolatedDir, { recursive: true });
    
    expect(() => getOrchestraPath("test.yaml", isolatedDir)).toThrow(
      ConfigurationError
    );
  });
});

describe("isOrchestraInitialized", () => {
  it("should return true when orchestra is initialized", () => {
    createOrchestraDir(tempDir);

    expect(isOrchestraInitialized(tempDir)).toBe(true);
  });

  it("should return false when orchestra is not initialized", () => {
    expect(isOrchestraInitialized(tempDir)).toBe(false);
  });

  it("should find initialization in parent directories", () => {
    createOrchestraDir(tempDir);
    const nestedDir = path.join(tempDir, "nested");
    fs.mkdirSync(nestedDir, { recursive: true });

    expect(isOrchestraInitialized(nestedDir)).toBe(true);
  });
});
