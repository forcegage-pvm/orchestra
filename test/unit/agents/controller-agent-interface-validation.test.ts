import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const agentPath = resolve(
  process.cwd(),
  ".github",
  "agents",
  "orchestra.controller.agent.md",
);

const agentText = readFileSync(agentPath, "utf8");

describe("orchestra.controller.agent.md interface validation guidance", () => {
  it("includes the Interface Contract Validation section in the code review area", () => {
    const decisionHeader = "### Decision Policy";
    const sectionHeader = "## Interface Contract Validation During Code Review";
    const issueSeverityHeader = "### Issue Severity Guide";

    const decisionIndex = agentText.indexOf(decisionHeader);
    const sectionIndex = agentText.indexOf(sectionHeader);
    const issueSeverityIndex = agentText.indexOf(issueSeverityHeader);

    expect(decisionIndex).toBeGreaterThan(-1);
    expect(sectionIndex).toBeGreaterThan(-1);
    expect(issueSeverityIndex).toBeGreaterThan(-1);
    expect(sectionIndex).toBeGreaterThan(decisionIndex);
    expect(sectionIndex).toBeLessThan(issueSeverityIndex);
  });

  it("requires validation when changes touch interface definition files", () => {
    expect(agentText).toMatch(
      /modifies\s+interface\s+definitions|interface\s+definition\s+files/i,
    );
    expect(agentText).toMatch(/MUST\s+verify\s+that\s+interface\s+validation/i);
  });

  it("documents automatic CHANGES_REQUESTED with BLOCKING severity", () => {
    expect(agentText).toMatch(/Automatic\s+CHANGES_REQUESTED/i);
    expect(agentText).toMatch(/BLOCKING\s+severity/i);
  });

  it("includes interface types like JSON Schema, OpenAPI, and package.json", () => {
    const requiredTypes = ["JSON Schema", "OpenAPI", "package.json"];

    requiredTypes.forEach((type) => {
      expect(agentText).toContain(type);
    });
  });

  it("provides a table of interface validation examples", () => {
    expect(agentText).toContain("Interface Types That Require Validation");
    expect(agentText).toMatch(/\|\s*Interface Type\s*\|/);
    expect(agentText).toMatch(/\|\s*Required Validation Example\s*\|/);
  });
});
