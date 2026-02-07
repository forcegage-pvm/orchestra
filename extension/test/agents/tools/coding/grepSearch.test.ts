/**
 * grepSearch tool tests
 *
 * Uses real temp files on disk because the tool now spawns ripgrep (a real
 * process) rather than reading files through the vscode API.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { grepSearchTool } from "../../../../src/agents/tools/coding/grepSearch.js";
import { ToolErrorCode } from "../../../../src/agents/tools/errors.js";
import type {
  ToolInvocationContext,
  ToolResult,
} from "../../../../src/agents/tools/types.js";

// -- Helpers --------------------------------------------------------------

/** Disposable no-op returned by onCancellationRequested */
const noop = { dispose: () => {} };

function makeMockToken(cancelled = false) {
  return {
    isCancellationRequested: cancelled,
    onCancellationRequested: vi.fn().mockReturnValue(noop),
  } as unknown as ToolInvocationContext["token"];
}

// -- Suite ----------------------------------------------------------------

describe("grepSearchTool", () => {
  let tempDir: string;
  let mockContext: ToolInvocationContext;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "grep-test-"));

    // Create test fixtures
    const srcDir = path.join(tempDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "app.ts"), "alpha\nbeta alpha\n");
    fs.writeFileSync(path.join(srcDir, "numbers.ts"), "foo123\nbar\n");

    mockContext = {
      workspaceRoot: tempDir,
      sessionId: "session",
      token: makeMockToken(false),
    };
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("performs exact string matching", async () => {
    const result = await grepSearchTool.invoke(
      { query: "alpha", isRegexp: false },
      mockContext,
    );

    expect(result.success).toBe(true);
    const matches = JSON.parse(result.content[0]?.value ?? "[]") as Array<{
      path: string;
      line: number;
      text: string;
    }>;
    expect(matches).toHaveLength(2);
    // Both lines in app.ts contain "alpha"
    expect(matches[0]?.line).toBe(1);
    expect(matches[1]?.line).toBe(2);
  });

  it("supports regex search", async () => {
    const result = await grepSearchTool.invoke(
      { query: "^foo\\d+", isRegexp: true },
      mockContext,
    );

    expect(result.success).toBe(true);
    const matches = JSON.parse(result.content[0]?.value ?? "[]") as Array<{
      path: string;
      line: number;
      text: string;
    }>;
    expect(matches).toHaveLength(1);
    expect(matches[0]?.line).toBe(1);
  });

  it("returns INVALID_INPUT on invalid regex", async () => {
    const result = (await grepSearchTool.invoke(
      { query: "[", isRegexp: true },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
  });

  it("returns CANCELLED when cancellation is requested", async () => {
    // Simulate immediate cancellation: the token's onCancellationRequested
    // callback fires synchronously and the flag is already set.
    const cancelToken = makeMockToken(true);
    // When the tool registers its listener, fire the callback immediately
    cancelToken.onCancellationRequested = vi.fn((cb: () => void) => {
      cb();
      return noop;
    }) as unknown as typeof cancelToken.onCancellationRequested;

    const result = (await grepSearchTool.invoke(
      { query: "alpha" },
      { ...mockContext, token: cancelToken },
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.CANCELLED);
  });

  it("returns empty matches for non-existent pattern", async () => {
    const result = await grepSearchTool.invoke(
      { query: "zzz_nonexistent_zzz", isRegexp: false },
      mockContext,
    );

    expect(result.success).toBe(true);
    const matches = JSON.parse(result.content[0]?.value ?? "[]") as unknown[];
    expect(matches).toHaveLength(0);
  });

  it("respects includePattern glob", async () => {
    // Write a file outside src/
    fs.writeFileSync(path.join(tempDir, "root.txt"), "alpha root\n");

    const result = await grepSearchTool.invoke(
      { query: "alpha", includePattern: "src/**" },
      mockContext,
    );

    expect(result.success).toBe(true);
    const matches = JSON.parse(result.content[0]?.value ?? "[]") as Array<{
      path: string;
    }>;
    // Should only find matches in src/, not root.txt
    for (const m of matches) {
      expect(m.path).toMatch(/^src\//);
    }
  });
});
