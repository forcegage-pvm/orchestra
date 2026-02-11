import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { InterfaceValidationConfigSchema } from "../../src/schemas/interface-validation.js";

type ParsedValidation = {
  name?: string;
  description?: string;
  patterns: string[];
  command?: string;
  test?: string;
};

type ParsedConfig = {
  version?: string;
  validations: ParsedValidation[];
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(
  __dirname,
  "..",
  "..",
  ".orchestra",
  "interface-validations.yaml",
);

const stripQuotes = (value: string): string =>
  value.replace(/^"/, "").replace(/"$/, "").trim();

const parseConfig = (content: string): ParsedConfig => {
  const lines = content.split(/\r?\n/);
  const config: ParsedConfig = { validations: [] };
  let current: ParsedValidation | null = null;
  let inPatterns = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    if (trimmed.startsWith("version:")) {
      const raw = trimmed.slice("version:".length).trim();
      config.version = stripQuotes(raw);
      continue;
    }

    if (trimmed === "validations:") {
      continue;
    }

    if (trimmed.startsWith("- name:")) {
      const raw = trimmed.slice("- name:".length).trim();
      current = { name: stripQuotes(raw), patterns: [] };
      config.validations.push(current);
      inPatterns = false;
      continue;
    }

    if (!current) {
      continue;
    }

    if (trimmed.startsWith("description:")) {
      const raw = trimmed.slice("description:".length).trim();
      current.description = stripQuotes(raw);
      continue;
    }

    if (trimmed.startsWith("patterns:")) {
      inPatterns = true;
      continue;
    }

    if (inPatterns && trimmed.startsWith("- ")) {
      const raw = trimmed.slice(2).trim();
      current.patterns.push(stripQuotes(raw));
      continue;
    }

    if (trimmed.startsWith("test:")) {
      const raw = trimmed.slice("test:".length).trim();
      current.test = stripQuotes(raw);
      inPatterns = false;
      continue;
    }

    if (trimmed.startsWith("command:")) {
      const raw = trimmed.slice("command:".length).trim();
      current.command = stripQuotes(raw);
      inPatterns = false;
    }
  }

  return config;
};

describe("interface-validations.yaml", () => {
  it("exists and matches the interface validation schema", () => {
    const content = readFileSync(configPath, "utf8");
    const parsed = parseConfig(content);
    const config = InterfaceValidationConfigSchema.parse(parsed);

    expect(config.version).toBe("1.0");
    expect(config.validations.length).toBeGreaterThan(0);
  });

  it("includes the MCP tool schema validation entry", () => {
    const content = readFileSync(configPath, "utf8");
    const parsed = parseConfig(content);
    const [first] = parsed.validations;

    expect(first?.name).toBe("mcp-tool-schemas");
    expect(first?.description ?? "").toMatch(/MCP|JSON Schema/i);
    expect(first?.command).toBeUndefined();
    expect(first?.test).toBe("test/mcp-server/tool-schema-validation.test.ts");
    expect(first?.patterns).toContain("src/mcp-server/tools.ts");
    expect(first?.patterns).toContain("src/schemas/**/*.ts");
  });
});
