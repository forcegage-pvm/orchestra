/**
 * Smoke tests: extension package integrity
 *
 * Validates that the extension package.json declares the expected
 * activation events, contributes, and entry point — catching
 * accidental deletions or malformed manifests early.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { describe, expect, it } from "vitest";

const EXT_ROOT = path.resolve(__dirname, "../..");

interface PackageJson {
  name: string;
  main: string;
  engines: { vscode: string };
  activationEvents?: string[];
  contributes: {
    commands?: { command: string; title: string }[];
    views?: Record<string, { id: string; name: string; type?: string }[]>;
    viewsContainers?: { activitybar?: { id: string }[] };
    configuration?:
      | { properties: Record<string, unknown> }
      | { properties: Record<string, unknown> }[];
    menus?: Record<string, unknown[]>;
  };
}

async function loadPackageJson(): Promise<PackageJson> {
  const raw = await fs.readFile(path.join(EXT_ROOT, "package.json"), "utf8");
  return JSON.parse(raw) as PackageJson;
}

// ---------------------------------------------------------------------------

describe("Smoke: extension package.json", () => {
  it("should be valid JSON with required fields", async () => {
    const pkg = await loadPackageJson();
    expect(pkg.name).toBe("orchestra-extension");
    expect(pkg.main).toBeTruthy();
    expect(pkg.engines.vscode).toBeTruthy();
  });

  it("main entry point file should exist in dist or src", async () => {
    const pkg = await loadPackageJson();
    // In dev the compiled output may not exist, but the source should
    const srcEntry = pkg.main.replace("./dist/", "src/").replace(".js", ".ts");
    const srcPath = path.join(EXT_ROOT, srcEntry);
    const distPath = path.join(EXT_ROOT, pkg.main);

    const srcExists = await fs
      .access(srcPath)
      .then(() => true)
      .catch(() => false);
    const distExists = await fs
      .access(distPath)
      .then(() => true)
      .catch(() => false);

    expect(
      srcExists || distExists,
      `Neither ${srcEntry} nor ${pkg.main} exists`,
    ).toBe(true);
  });

  it("should declare activation events", async () => {
    const pkg = await loadPackageJson();
    expect(pkg.activationEvents).toBeDefined();
    expect(pkg.activationEvents!.length).toBeGreaterThan(0);
  });

  it("should contribute at least one command", async () => {
    const pkg = await loadPackageJson();
    expect(pkg.contributes.commands).toBeDefined();
    expect(pkg.contributes.commands!.length).toBeGreaterThan(0);
  });

  it("every contributed command should have a unique id", async () => {
    const pkg = await loadPackageJson();
    const ids = pkg.contributes.commands!.map((c) => c.command);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, `Duplicate command ids: ${dupes.join(", ")}`).toEqual([]);
  });

  it("should contribute views with expected containers", async () => {
    const pkg = await loadPackageJson();
    expect(pkg.contributes.viewsContainers?.activitybar).toBeDefined();
    expect(pkg.contributes.views).toBeDefined();
  });

  it("should contribute configuration properties", async () => {
    const pkg = await loadPackageJson();
    const config = pkg.contributes.configuration;
    expect(config).toBeDefined();
    // Configuration can be a single object or array of objects
    const sections = Array.isArray(config) ? config : [config];
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      expect(Object.keys(section.properties).length).toBeGreaterThan(0);
    }
  });
});
