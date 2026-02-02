/**
 * LoadingState and EmptyState Component Tests
 *
 * Tests for loading skeleton and empty state components.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.9
 */

import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const componentsDir = join(
  __dirname,
  "../../../../src/webviews/agent-panel/components",
);

describe("LoadingState", () => {
  it("should exist as a component file", () => {
    const source = readFileSync(
      join(componentsDir, "LoadingState.tsx"),
      "utf-8",
    );
    expect(source).toContain("export function LoadingState");
  });

  it("should use animate-pulse for skeleton shimmer", () => {
    const source = readFileSync(
      join(componentsDir, "LoadingState.tsx"),
      "utf-8",
    );
    expect(source).toContain("animate-pulse");
  });

  it("should have skeleton placeholders with dark theme", () => {
    const source = readFileSync(
      join(componentsDir, "LoadingState.tsx"),
      "utf-8",
    );
    expect(source).toContain("bg-zinc-900");
    expect(source).toContain("bg-gray-800");
    expect(source).toContain("bg-gray-700");
  });

  it("should render header skeleton", () => {
    const source = readFileSync(
      join(componentsDir, "LoadingState.tsx"),
      "utf-8",
    );
    expect(source).toContain("h-16");
  });

  it("should render three card skeletons", () => {
    const source = readFileSync(
      join(componentsDir, "LoadingState.tsx"),
      "utf-8",
    );
    const cardMatches = source.match(
      /bg-zinc-900 border border-gray-700 rounded-lg p-4 animate-pulse/g,
    );
    expect(cardMatches).toBeTruthy();
    expect(cardMatches?.length).toBe(3);
  });
});

describe("EmptyState", () => {
  it("should exist as a component file", () => {
    const source = readFileSync(join(componentsDir, "EmptyState.tsx"), "utf-8");
    expect(source).toContain("export function EmptyState");
  });

  it("should have configurable icon and message props", () => {
    const source = readFileSync(join(componentsDir, "EmptyState.tsx"), "utf-8");
    expect(source).toContain("interface EmptyStateProps");
    expect(source).toContain("icon: string");
    expect(source).toContain("message: string");
  });

  it("should use Iconify for icon rendering", () => {
    const source = readFileSync(join(componentsDir, "EmptyState.tsx"), "utf-8");
    expect(source).toContain('from "@iconify-icon/solid"');
    expect(source).toContain("Icon");
  });

  it("should use dark theme colors", () => {
    const source = readFileSync(join(componentsDir, "EmptyState.tsx"), "utf-8");
    expect(source).toContain("text-gray-500");
    expect(source).toContain("text-gray-600");
  });

  it("should center content", () => {
    const source = readFileSync(join(componentsDir, "EmptyState.tsx"), "utf-8");
    expect(source).toContain("flex flex-col items-center justify-center");
  });

  it("should support different icon types via props", () => {
    const source = readFileSync(join(componentsDir, "EmptyState.tsx"), "utf-8");
    expect(source).toContain("props.icon");
    expect(source).toContain("props.message");
  });
});

describe("Component Integration", () => {
  it("should be exported from components barrel", () => {
    const source = readFileSync(join(componentsDir, "index.ts"), "utf-8");
    expect(source).toContain("export { LoadingState }");
    expect(source).toContain("export { EmptyState }");
    expect(source).toContain("export type { EmptyStateProps }");
  });
});
