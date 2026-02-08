/**
 * Coding tools registration tests
 */

import { describe, expect, it } from "vitest";

import { ToolRegistry } from "../../../src/agents/ToolRegistry.js";
import {
  codingTools,
  registerCodingTools,
} from "../../../src/agents/tools/coding/index.js";

describe("registerCodingTools", () => {
  it("registers all coding tools", () => {
    const registry = new ToolRegistry();

    registerCodingTools(registry);

    expect(registry.list()).toHaveLength(codingTools.length);
    const registeredNames = registry.names().sort();
    const expectedNames = codingTools.map((tool) => tool.name).sort();
    expect(registeredNames).toEqual(expectedNames);
  });
});
