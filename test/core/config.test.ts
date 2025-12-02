/**
 * Configuration Service Tests
 *
 * Tests for Orchestra configuration management.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findOrchestraRoot,
  getResolvedPaths,
  initializeOrchestra,
  isOrchestraInitialized,
  loadConfig,
  requireOrchestraRoot,
  resolvePath,
  saveConfig,
} from "../../src/core/config.js";
import { ConfigurationError } from "../../src/core/errors.js";
import { DEFAULT_CONFIG } from "../../src/core/types.js";

describe("Configuration Service", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("findOrchestraRoot", () => {
    it("should find .orchestra directory in current dir", () => {
      const orchestraDir = path.join(tempDir, ".orchestra");
      fs.mkdirSync(orchestraDir);

      const result = findOrchestraRoot(tempDir);

      expect(result).toBe(tempDir);
    });

    it("should find .orchestra directory in parent dir", () => {
      const orchestraDir = path.join(tempDir, ".orchestra");
      const nestedDir = path.join(tempDir, "nested", "deep");
      fs.mkdirSync(orchestraDir);
      fs.mkdirSync(nestedDir, { recursive: true });

      const result = findOrchestraRoot(nestedDir);

      expect(result).toBe(tempDir);
    });

    it("should return null if no .orchestra directory found", () => {
      const result = findOrchestraRoot(tempDir);

      expect(result).toBeNull();
    });
  });

  describe("loadConfig", () => {
    it("should return default config if no config file exists", () => {
      const orchestraDir = path.join(tempDir, ".orchestra");
      fs.mkdirSync(orchestraDir);

      const config = loadConfig(tempDir);

      expect(config.version).toBe(DEFAULT_CONFIG.version);
      expect(config.paths.manifest).toBe(DEFAULT_CONFIG.paths.manifest);
    });

    it("should load config from file", () => {
      const orchestraDir = path.join(tempDir, ".orchestra");
      fs.mkdirSync(orchestraDir);
      fs.writeFileSync(
        path.join(orchestraDir, "orchestra.yaml"),
        'version: "2.0"\npaths:\n  manifest: "custom.yaml"',
        "utf-8"
      );

      const config = loadConfig(tempDir);

      expect(config.version).toBe("2.0");
    });
  });

  describe("saveConfig", () => {
    it("should save config to file", () => {
      const orchestraDir = path.join(tempDir, ".orchestra");
      fs.mkdirSync(orchestraDir, { recursive: true });

      const config = { ...DEFAULT_CONFIG, version: "3.0" };
      saveConfig(tempDir, config);

      const configPath = path.join(orchestraDir, "orchestra.yaml");
      expect(fs.existsSync(configPath)).toBe(true);

      const content = fs.readFileSync(configPath, "utf-8");
      expect(content).toContain("3.0");
    });
  });

  describe("resolvePath", () => {
    it("should resolve relative path to orchestra directory", () => {
      const result = resolvePath(tempDir, "manifest.yaml");

      expect(result).toBe(path.join(tempDir, ".orchestra", "manifest.yaml"));
    });

    it("should return absolute path as-is", () => {
      const absPath = "/absolute/path/file.yaml";
      const result = resolvePath(tempDir, absPath);

      expect(result).toBe(absPath);
    });
  });

  describe("getResolvedPaths", () => {
    it("should resolve all paths from config", () => {
      const paths = getResolvedPaths(tempDir, DEFAULT_CONFIG);

      expect(paths.orchestraDir).toBe(path.join(tempDir, ".orchestra"));
      expect(paths.manifest).toBe(
        path.join(tempDir, ".orchestra", "manifest.yaml")
      );
      expect(paths.handovers).toBe(
        path.join(tempDir, ".orchestra", "implementor/handovers")
      );
      expect(paths.signals).toBe(
        path.join(tempDir, ".orchestra", "implementor/signals")
      );
    });
  });

  describe("isOrchestraInitialized", () => {
    it("should return true when .orchestra exists", () => {
      fs.mkdirSync(path.join(tempDir, ".orchestra"));

      expect(isOrchestraInitialized(tempDir)).toBe(true);
    });

    it("should return false when .orchestra does not exist", () => {
      expect(isOrchestraInitialized(tempDir)).toBe(false);
    });
  });

  describe("requireOrchestraRoot", () => {
    it("should return root when initialized", () => {
      fs.mkdirSync(path.join(tempDir, ".orchestra"));

      const root = requireOrchestraRoot(tempDir);

      expect(root).toBe(tempDir);
    });

    it("should throw ConfigurationError when not initialized", () => {
      expect(() => requireOrchestraRoot(tempDir)).toThrow(ConfigurationError);
    });
  });

  describe("initializeOrchestra", () => {
    it("should create .orchestra directory structure", () => {
      const config = initializeOrchestra(tempDir);

      expect(fs.existsSync(path.join(tempDir, ".orchestra"))).toBe(true);
      expect(
        fs.existsSync(path.join(tempDir, ".orchestra", "implementor/handovers"))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(tempDir, ".orchestra", "implementor/signals"))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(tempDir, ".orchestra", "implementor/feedback"))
      ).toBe(true);
      expect(config.version).toBe(DEFAULT_CONFIG.version);
    });

    it("should save config file", () => {
      initializeOrchestra(tempDir);

      const configPath = path.join(tempDir, ".orchestra", "orchestra.yaml");
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it("should merge custom config with defaults", () => {
      const config = initializeOrchestra(tempDir, {
        version: "custom",
        retry: { max_retries: 5 },
      });

      expect(config.version).toBe("custom");
      expect(config.retry.max_retries).toBe(5);
      expect(config.paths.manifest).toBe(DEFAULT_CONFIG.paths.manifest);
    });
  });
});
