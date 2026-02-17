import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const agentPath = resolve(
  process.cwd(),
  ".github",
  "agents",
  "orchestra.orchestrator.agent.md",
);

const agentText = readFileSync(agentPath, "utf8");

describe("orchestra.orchestrator.agent.md interface validation guidance", () => {
  it("includes the Interface Contract Validation section before interface definition validation", () => {
    const sectionHeader = "## Interface Contract Validation";
    const interfaceDesignHeader =
      "## Verification Design: Interface Definition Validation";

    const sectionIndex = agentText.indexOf(sectionHeader);
    const interfaceDesignIndex = agentText.indexOf(interfaceDesignHeader);

    expect(sectionIndex).toBeGreaterThan(-1);
    expect(interfaceDesignIndex).toBeGreaterThan(-1);
    expect(sectionIndex).toBeLessThan(interfaceDesignIndex);
  });

  it("states the principle of validating interfaces against their specification", () => {
    expect(agentText).toMatch(
      /verification\s+\*\*MUST\*\*\s+include checks that the definitions are valid according to their specification/i,
    );
  });

  it("explains external contracts with concrete examples", () => {
    expect(agentText).toContain("External contracts are files");
    expect(agentText).toContain("Schemas consumed by VS Code");
    expect(agentText).toContain("APIs consumed by external clients");
    expect(agentText).toContain("Configs parsed by tools");
  });

  it("lists common interface types, including JSON Schema, OpenAPI, and package.json", () => {
    const requiredTypes = [
      "JSON Schema",
      "OpenAPI",
      "package.json",
      "tsconfig.json",
      "Protobuf",
      "GraphQL",
    ];

    requiredTypes.forEach((type) => {
      expect(agentText).toContain(type);
    });
  });

  it("requires interface validation in verification criteria", () => {
    expect(agentText).toMatch(/\*\*MUST\*\*\s+include verification criteria/i);
    expect(agentText).toMatch(/validate those definitions/i);
  });

  it("provides actionable JSON example for interface validation checks", () => {
    expect(agentText).toContain('"behavioral_checks"');
    expect(agentText).toContain("MCP tool schemas are valid JSON Schema");
    expect(agentText).toContain("npm test -- -t 'tool schema validation'");
  });

  it("includes file pattern recognition guidance", () => {
    expect(agentText).toContain("**/inputSchema");
    expect(agentText).toContain("openapi.yaml");
    expect(agentText).toContain("swagger.json");
    expect(agentText).toContain("*.proto");
    expect(agentText).toContain("*.graphql");
  });
});
