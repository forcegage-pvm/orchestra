/**
 * ToolsView Components Test Suite
 *
 * Comprehensive tests for ToolsFilter, ToolsTable, and ToolsView components.
 * Tests component exports, structure, and functionality through static analysis
 * and module imports.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const componentsDir = join(
  __dirname,
  "../../../../src/webviews/agent-panel/components",
);
const viewsDir = join(__dirname, "../../../../src/webviews/agent-panel/views");

// ─────────────────────────────────────────────────────────────────
// ToolsFilter Tests
// ─────────────────────────────────────────────────────────────────

describe("ToolsFilter", () => {
  it("should export ToolsFilter component function", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/components/ToolsFilter.js");
    expect(module).toHaveProperty("ToolsFilter");
    expect(typeof module.ToolsFilter).toBe("function");
  });

  it("should be exported from barrel export", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/components/index.js");
    expect(module).toHaveProperty("ToolsFilter");
    expect(typeof module.ToolsFilter).toBe("function");
  });

  it("should have ToolsFilterProps interface exported", async () => {
    const source = readFileSync(
      join(componentsDir, "ToolsFilter.tsx"),
      "utf-8",
    );

    // Check for interface export
    expect(source).toContain("export interface ToolsFilterProps");

    // Check for required props
    expect(source).toContain("category:");
    expect(source).toContain("filterText:");
    expect(source).toContain("onCategoryChange:");
    expect(source).toContain("onFilterTextChange:");
  });

  it("should include all category options", () => {
    const source = readFileSync(
      join(componentsDir, "ToolsFilter.tsx"),
      "utf-8",
    );

    // Check for all categories in the categories array
    expect(source).toContain('"all"');
    expect(source).toContain('"coding"');
    expect(source).toContain('"system"');
    expect(source).toContain('"filesystem"');
    expect(source).toContain('"orchestra"');
  });

  it("should render category dropdown with select element", () => {
    const source = readFileSync(
      join(componentsDir, "ToolsFilter.tsx"),
      "utf-8",
    );

    expect(source).toContain("<select");
    expect(source).toContain('aria-label="Filter by category"');
  });

  it("should render text filter input", () => {
    const source = readFileSync(
      join(componentsDir, "ToolsFilter.tsx"),
      "utf-8",
    );

    expect(source).toContain('type="text"');
    expect(source).toContain('placeholder="Filter by tool name..."');
    expect(source).toContain('aria-label="Filter by tool name"');
  });

  it("should include search and clear icons", () => {
    const source = readFileSync(
      join(componentsDir, "ToolsFilter.tsx"),
      "utf-8",
    );

    expect(source).toContain("lucide:search");
    expect(source).toContain("lucide:x");
    expect(source).toContain("lucide:chevron-down");
  });

  it("should use dark theme styling", () => {
    const source = readFileSync(
      join(componentsDir, "ToolsFilter.tsx"),
      "utf-8",
    );

    expect(source).toContain("bg-zinc-900");
    expect(source).toContain("bg-gray-800");
    expect(source).toContain("text-gray-200");
    expect(source).toContain("border-gray-700");
  });
});

// ─────────────────────────────────────────────────────────────────
// ToolsTable Tests
// ─────────────────────────────────────────────────────────────────

describe("ToolsTable", () => {
  it("should export ToolsTable component function", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/components/ToolsTable.js");
    expect(module).toHaveProperty("ToolsTable");
    expect(typeof module.ToolsTable).toBe("function");
  });

  it("should be exported from barrel export", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/components/index.js");
    expect(module).toHaveProperty("ToolsTable");
    expect(typeof module.ToolsTable).toBe("function");
  });

  it("should have ToolsTableProps interface exported", () => {
    const source = readFileSync(join(componentsDir, "ToolsTable.tsx"), "utf-8");

    expect(source).toContain("export interface ToolsTableProps");
    expect(source).toContain("toolCalls:");
    expect(source).toContain("onRowClick:");
    expect(source).toContain("height:");
  });

  it("should render all five column headers", () => {
    const source = readFileSync(join(componentsDir, "ToolsTable.tsx"), "utf-8");

    // Check for all column headers
    expect(source).toContain(">Status<");
    expect(source).toContain(">Tool<");
    expect(source).toContain(">Duration<");
    expect(source).toContain(">Files<");
    expect(source).toContain(">Summary<");
  });

  it("should use VirtualList component", () => {
    const source = readFileSync(join(componentsDir, "ToolsTable.tsx"), "utf-8");

    expect(source).toContain('import { VirtualList } from "./VirtualList.js"');
    expect(source).toContain("<VirtualList");
  });

  it("should include status icons for all states", () => {
    const source = readFileSync(join(componentsDir, "ToolsTable.tsx"), "utf-8");

    // Check for status icon mappings
    expect(source).toContain("lucide:check"); // success
    expect(source).toContain("lucide:x"); // failed
    expect(source).toContain("lucide:hourglass"); // pending/running
  });

  it("should format duration correctly", () => {
    const source = readFileSync(join(componentsDir, "ToolsTable.tsx"), "utf-8");

    // Check for duration formatting logic
    expect(source).toContain("formatDuration");
    expect(source).toContain("ms"); // milliseconds
    expect(source).toContain("1000"); // threshold for seconds
  });

  it("should display file operation count", () => {
    const source = readFileSync(join(componentsDir, "ToolsTable.tsx"), "utf-8");

    expect(source).toContain("fileOperations.length");
  });

  it("should have empty state message", () => {
    const source = readFileSync(join(componentsDir, "ToolsTable.tsx"), "utf-8");

    expect(source).toContain("No tool calls to display");
    expect(source).toContain("lucide:inbox");
  });

  it("should use grid layout for columns", () => {
    const source = readFileSync(join(componentsDir, "ToolsTable.tsx"), "utf-8");

    expect(source).toContain("grid grid-cols-[60px_150px_100px_60px_1fr]");
  });

  it("should use dark theme styling", () => {
    const source = readFileSync(join(componentsDir, "ToolsTable.tsx"), "utf-8");

    expect(source).toContain("bg-zinc-900");
    expect(source).toContain("bg-gray-800");
    expect(source).toContain("border-gray-700");
    expect(source).toContain("hover:bg-gray-800/50");
  });

  it("should have clickable rows", () => {
    const source = readFileSync(join(componentsDir, "ToolsTable.tsx"), "utf-8");

    expect(source).toContain('role="row"');
    expect(source).toContain("cursor-pointer");
    expect(source).toContain("onClick");
  });
});

// ─────────────────────────────────────────────────────────────────
// ToolsView Tests
// ─────────────────────────────────────────────────────────────────

describe("ToolsView", () => {
  it("should export ToolsView component function", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/views/ToolsView.js");
    expect(module).toHaveProperty("ToolsView");
    expect(typeof module.ToolsView).toBe("function");
  });

  it("should be exported from views barrel export", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/views/index.js");
    expect(module).toHaveProperty("ToolsView");
    expect(typeof module.ToolsView).toBe("function");
  });

  it("should compose ToolsFilter and ToolsTable", () => {
    const source = readFileSync(join(viewsDir, "ToolsView.tsx"), "utf-8");

    expect(source).toContain("import { ToolsFilter, ToolsTable }");
    expect(source).toContain("<ToolsFilter");
    expect(source).toContain("<ToolsTable");
  });

  it("should have sort dropdown with three options", () => {
    const source = readFileSync(join(viewsDir, "ToolsView.tsx"), "utf-8");

    expect(source).toContain('value="time"');
    expect(source).toContain('value="duration"');
    expect(source).toContain('value="name"');
    expect(source).toContain("Sort: Time");
    expect(source).toContain("Sort: Duration");
    expect(source).toContain("Sort: Name");
  });

  it("should use toolCalls store", () => {
    const source = readFileSync(join(viewsDir, "ToolsView.tsx"), "utf-8");

    expect(source).toContain('from "../stores/sessionStore.js"');
    expect(source).toContain("toolCalls");
  });

  it("should use setUi for tab navigation", () => {
    const source = readFileSync(join(viewsDir, "ToolsView.tsx"), "utf-8");

    expect(source).toContain('from "../stores/uiStore.js"');
    expect(source).toContain("setUi");
    expect(source).toContain('"activeTab"');
    expect(source).toContain('"timeline"');
  });

  it("should handle row click with navigation", () => {
    const source = readFileSync(join(viewsDir, "ToolsView.tsx"), "utf-8");

    expect(source).toContain("handleRowClick");
    expect(source).toContain("window.postMessage");
    expect(source).toContain("scrollToEvent");
  });

  it("should implement filtering by category", () => {
    const source = readFileSync(join(viewsDir, "ToolsView.tsx"), "utf-8");

    expect(source).toContain("category()");
    expect(source).toContain("toolCategory === category()");
  });

  it("should implement filtering by text", () => {
    const source = readFileSync(join(viewsDir, "ToolsView.tsx"), "utf-8");

    expect(source).toContain("filterText()");
    expect(source).toContain("toLowerCase()");
    expect(source).toContain("toolName");
  });

  it("should implement sorting by time", () => {
    const source = readFileSync(join(viewsDir, "ToolsView.tsx"), "utf-8");

    expect(source).toContain('case "time"');
    expect(source).toContain("timestamp");
  });

  it("should implement sorting by duration", () => {
    const source = readFileSync(join(viewsDir, "ToolsView.tsx"), "utf-8");

    expect(source).toContain('case "duration"');
    expect(source).toContain("durationMs");
  });

  it("should implement sorting by name", () => {
    const source = readFileSync(join(viewsDir, "ToolsView.tsx"), "utf-8");

    expect(source).toContain('case "name"');
    expect(source).toContain("toolName");
    expect(source).toContain("localeCompare");
  });

  it("should use createMemo for filtered and sorted tools", () => {
    const source = readFileSync(join(viewsDir, "ToolsView.tsx"), "utf-8");

    expect(source).toContain("createMemo");
    expect(source).toContain("filteredAndSortedTools");
  });

  it("should use createSignal for local state", () => {
    const source = readFileSync(join(viewsDir, "ToolsView.tsx"), "utf-8");

    expect(source).toContain("createSignal");
    expect(source).toContain("category");
    expect(source).toContain("filterText");
    expect(source).toContain("sortBy");
  });

  it("should use dark theme styling", () => {
    const source = readFileSync(join(viewsDir, "ToolsView.tsx"), "utf-8");

    expect(source).toContain("bg-zinc-900");
    expect(source).toContain("bg-gray-800");
    expect(source).toContain("border-gray-700");
  });

  it("should have flexbox layout", () => {
    const source = readFileSync(join(viewsDir, "ToolsView.tsx"), "utf-8");

    expect(source).toContain("flex flex-col h-full");
    expect(source).toContain("flex-1");
  });
});
