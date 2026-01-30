/**
 * Tests for ConfigService integration in extension.ts (Task 3)
 *
 * Verifies that ConfigService is properly imported, instantiated during
 * activation, and accessible via getConfigService().
 */

import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

describe("Extension - ConfigService integration (Task 3)", () => {
  let extensionCode: string;

  it("should import ConfigService from config/ConfigService.js", () => {
    const extensionPath = path.join(__dirname, "..", "src", "extension.ts");
    extensionCode = fs.readFileSync(extensionPath, "utf-8");

    // Check for import statement
    expect(extensionCode).toMatch(
      /import\s+\{[^}]*ConfigService[^}]*\}\s+from\s+["']\.\/config\/ConfigService\.js["']/,
    );
  });

  it("should declare configService variable at module level", () => {
    const extensionPath = path.join(__dirname, "..", "src", "extension.ts");
    extensionCode = fs.readFileSync(extensionPath, "utf-8");

    // Check for module-level variable declaration
    expect(extensionCode).toMatch(/let\s+configService:\s*ConfigService/);
  });

  it("should instantiate ConfigService during activation", () => {
    const extensionPath = path.join(__dirname, "..", "src", "extension.ts");
    extensionCode = fs.readFileSync(extensionPath, "utf-8");

    // Check that ConfigService is instantiated
    expect(extensionCode).toMatch(/configService\s*=\s*new\s+ConfigService\(/);
  });

  it("should export getConfigService accessor function", () => {
    const extensionPath = path.join(__dirname, "..", "src", "extension.ts");
    extensionCode = fs.readFileSync(extensionPath, "utf-8");

    // Check for exported getter function
    expect(extensionCode).toMatch(
      /export\s+function\s+getConfigService\(\s*\):\s*ConfigService/,
    );
  });

  it("should have getConfigService that throws if not initialized", () => {
    const extensionPath = path.join(__dirname, "..", "src", "extension.ts");
    extensionCode = fs.readFileSync(extensionPath, "utf-8");

    // Check that getter validates initialization
    const getterMatch = extensionCode.match(
      /export\s+function\s+getConfigService\(\s*\):\s*ConfigService\s*\{[\s\S]*?\n\}/,
    );
    expect(getterMatch).toBeTruthy();

    const getterCode = getterMatch![0];
    expect(getterCode).toContain("!configService");
    expect(getterCode).toContain("throw");
    expect(getterCode).toContain("return configService");
  });

  it("should instantiate ConfigService before detecting orchestra workspace", () => {
    const extensionPath = path.join(__dirname, "..", "src", "extension.ts");
    extensionCode = fs.readFileSync(extensionPath, "utf-8");

    // Find positions in the activate function
    const configServiceInitPos = extensionCode.indexOf(
      "configService = new ConfigService()",
    );
    const orchestraRootPos = extensionCode.indexOf(
      "const orchestraRoot = findOrchestraRoot()",
    );

    expect(configServiceInitPos).toBeGreaterThan(0);
    expect(orchestraRootPos).toBeGreaterThan(0);
    expect(configServiceInitPos).toBeLessThan(orchestraRootPos);
  });

  it("should have disposal comment in deactivate function", () => {
    const extensionPath = path.join(__dirname, "..", "src", "extension.ts");
    extensionCode = fs.readFileSync(extensionPath, "utf-8");

    // Check for deactivate function
    const deactivateMatch = extensionCode.match(
      /export\s+async\s+function\s+deactivate\(\s*\):\s*Promise<void>/,
    );
    expect(deactivateMatch).toBeTruthy();

    // Find the deactivate function body
    const deactivateStart = extensionCode.indexOf(
      "export async function deactivate",
    );
    expect(deactivateStart).toBeGreaterThan(-1);

    // Get next 500 characters which should include the ConfigService comment
    const deactivateSection = extensionCode.substring(
      deactivateStart,
      deactivateStart + 500,
    );

    // Check for comment about ConfigService disposal
    expect(deactivateSection).toMatch(/ConfigService.*disposal/i);
  });
});

describe("Extension structure - Imports order (Task 3)", () => {
  it("should have ConfigService imported before database", () => {
    const extensionPath = path.join(__dirname, "..", "src", "extension.ts");
    const extensionCode = fs.readFileSync(extensionPath, "utf-8");

    const imports = extensionCode.split("\n").filter((line) => {
      return line.trim().startsWith("import") && !line.includes("//");
    });

    const configServiceIdx = imports.findIndex((line) =>
      line.includes("config/ConfigService"),
    );
    const databaseClientIdx = imports.findIndex((line) =>
      line.includes("database/client"),
    );

    expect(configServiceIdx).toBeGreaterThanOrEqual(0);
    expect(databaseClientIdx).toBeGreaterThanOrEqual(0);

    // ConfigService should be before database client
    expect(configServiceIdx).toBeLessThan(databaseClientIdx);
  });
});
