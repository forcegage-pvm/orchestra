/**
 * Tests for database signal file module
 *
 * Verifies that writeSignal creates .orchestra/.signal file with timestamp
 * and handles error conditions gracefully.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { writeSignal } from "../../../src/mcp-server/db-signal.js";

describe("db-signal", () => {
  let tempDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Create temp directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-signal-test-"));
    
    // Save and override process.cwd()
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    
    // Set ORCHESTRA_WORKSPACE to temp directory
    process.env.ORCHESTRA_WORKSPACE = tempDir;
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("writeSignal", () => {
    it("should create .orchestra directory if it doesn't exist", () => {
      const orchestraDir = path.join(tempDir, ".orchestra");
      expect(fs.existsSync(orchestraDir)).toBe(false);

      writeSignal();

      expect(fs.existsSync(orchestraDir)).toBe(true);
    });

    it("should write timestamp to .orchestra/.signal file", () => {
      const signalPath = path.join(tempDir, ".orchestra", ".signal");

      writeSignal();

      expect(fs.existsSync(signalPath)).toBe(true);
      const content = fs.readFileSync(signalPath, "utf8");
      
      // Should be a valid timestamp (numeric string)
      expect(content).toMatch(/^\d+$/);
      
      // Should be close to current time (within 1 second)
      const timestamp = parseInt(content, 10);
      const now = Date.now();
      expect(Math.abs(now - timestamp)).toBeLessThan(1000);
    });

    it("should overwrite existing signal file with new timestamp", () => {
      const signalPath = path.join(tempDir, ".orchestra", ".signal");
      
      // Create .orchestra directory
      fs.mkdirSync(path.join(tempDir, ".orchestra"), { recursive: true });
      
      // Write initial signal
      writeSignal();
      const firstContent = fs.readFileSync(signalPath, "utf8");
      const firstTimestamp = parseInt(firstContent, 10);

      // Wait a tiny bit to ensure timestamp differs
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      return delay(10).then(() => {
        // Write second signal
        writeSignal();
        const secondContent = fs.readFileSync(signalPath, "utf8");
        const secondTimestamp = parseInt(secondContent, 10);

        // Second timestamp should be later
        expect(secondTimestamp).toBeGreaterThan(firstTimestamp);
      });
    });

    it("should handle errors gracefully without throwing", () => {
      // Make the .orchestra directory read-only to force an error
      const orchestraDir = path.join(tempDir, ".orchestra");
      fs.mkdirSync(orchestraDir, { recursive: true });
      
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Create a file where .signal should be to cause write error
      const signalPath = path.join(orchestraDir, ".signal");
      
      // On Windows, we can't easily create permission errors, so we'll make it a directory
      // which will cause fs.writeFileSync to fail when trying to write a file
      fs.mkdirSync(signalPath, { recursive: true });

      // Should not throw even when write fails
      expect(() => writeSignal()).not.toThrow();

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("[Orchestra] Failed to write signal file");

      // Clean up
      fs.rmSync(signalPath, { recursive: true, force: true });
      consoleErrorSpy.mockRestore();
    });

    it("should use resolveWorkspacePath to determine .orchestra location", () => {
      const customWorkspace = path.join(tempDir, "custom-workspace");
      fs.mkdirSync(customWorkspace, { recursive: true });
      
      // Override ORCHESTRA_WORKSPACE
      process.env.ORCHESTRA_WORKSPACE = customWorkspace;

      writeSignal();

      // Signal should be in custom workspace
      const signalPath = path.join(customWorkspace, ".orchestra", ".signal");
      expect(fs.existsSync(signalPath)).toBe(true);
      
      // Should NOT be in original temp dir
      const wrongPath = path.join(tempDir, ".orchestra", ".signal");
      expect(fs.existsSync(wrongPath)).toBe(false);
    });

    it("should write valid UTF-8 encoded file", () => {
      writeSignal();

      const signalPath = path.join(tempDir, ".orchestra", ".signal");
      const content = fs.readFileSync(signalPath, "utf8");
      
      // Should be readable as UTF-8
      expect(typeof content).toBe("string");
      expect(content.length).toBeGreaterThan(0);
      
      // Should not contain any non-numeric characters
      expect(content).toMatch(/^\d+$/);
    });

    it("should handle permission errors gracefully", () => {
      const orchestraDir = path.join(tempDir, ".orchestra");
      fs.mkdirSync(orchestraDir, { recursive: true });
      
      // Make directory read-only (Unix-like systems)
      if (process.platform !== "win32") {
        fs.chmodSync(orchestraDir, 0o444);
      }

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Should not throw even with permission error
      expect(() => writeSignal()).not.toThrow();

      // Restore permissions
      if (process.platform !== "win32") {
        fs.chmodSync(orchestraDir, 0o755);
      }

      consoleErrorSpy.mockRestore();
    });

    it("should create nested directory structure if needed", () => {
      // Ensure temp dir is completely empty
      const emptyWorkspace = path.join(tempDir, "nested", "workspace");
      process.env.ORCHESTRA_WORKSPACE = emptyWorkspace;

      writeSignal();

      // Should create full path
      const signalPath = path.join(emptyWorkspace, ".orchestra", ".signal");
      expect(fs.existsSync(signalPath)).toBe(true);
    });
  });
});
