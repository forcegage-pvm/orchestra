/**
 * Unit tests for DartMcpClient
 *
 * Tests probe(), connect(), callTool(), dispose(), crash recovery,
 * and module-level singleton helpers.
 */

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Hoist mocks so they are available when vi.mock() factories execute
// ============================================================================

const { mockSpawn, mockClientConnect, mockClientCallTool, mockClientClose } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockClientConnect: vi.fn(),
  mockClientCallTool: vi.fn(),
  mockClientClose: vi.fn(),
}));

// ============================================================================
// vi.mock calls — factories can now reference hoisted vars
// ============================================================================

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => {
  const Client = function () {
    return {
      connect: mockClientConnect,
      callTool: mockClientCallTool,
      close: mockClientClose,
    };
  };
  return { Client };
});

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => {
  const StdioClientTransport = function () {
    return {};
  };
  return { StdioClientTransport };
});

// ============================================================================
// Helper: build a fake child process for probe()
//
// NOTE: We do NOT use vi.useFakeTimers() in any test that calls connect(),
// because connect() → probe() → spawnProbe() uses setImmediate internally
// (via the EventEmitter emit scheduling). Using fake timers would cause
// setImmediate callbacks to never fire, hanging the test.
// ============================================================================

function makeFakeProcess(exitCode: number, errorOnSpawn?: Error) {
  const proc = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
  proc.kill = vi.fn();

  if (errorOnSpawn) {
    setImmediate(() => proc.emit("error", errorOnSpawn));
  } else {
    setImmediate(() => proc.emit("exit", exitCode));
  }

  return proc;
}

// ============================================================================
// Import module under test (after mocks)
// ============================================================================

import {
  DartMcpClient,
  getGlobalDartMcpClient,
  setGlobalDartMcpClient,
} from "../../../../../src/agents/tools/intelligence/DartMcpClient.js";

// ============================================================================
// Helpers
// ============================================================================

const makeLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const WORKSPACE = "/workspace";
const DART_EXE = "dart";

function makeClient() {
  return new DartMcpClient(DART_EXE, WORKSPACE, makeLogger());
}

// ============================================================================
// Tests
// ============================================================================

describe("DartMcpClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setGlobalDartMcpClient(undefined);
  });

  afterEach(() => {
    setGlobalDartMcpClient(undefined);
  });

  // --------------------------------------------------------------------------
  // Singleton helpers
  // --------------------------------------------------------------------------

  describe("singleton helpers", () => {
    it("getGlobalDartMcpClient returns undefined initially", () => {
      expect(getGlobalDartMcpClient()).toBeUndefined();
    });

    it("setGlobalDartMcpClient stores and returns the client", () => {
      const client = makeClient();
      setGlobalDartMcpClient(client);
      expect(getGlobalDartMcpClient()).toBe(client);
    });

    it("setGlobalDartMcpClient(undefined) clears the singleton", () => {
      setGlobalDartMcpClient(makeClient());
      setGlobalDartMcpClient(undefined);
      expect(getGlobalDartMcpClient()).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // probe()
  // --------------------------------------------------------------------------

  describe("probe()", () => {
    it("returns true when dart mcp-server exits 0", async () => {
      mockSpawn.mockReturnValue(makeFakeProcess(0));
      const client = makeClient();

      const result = await client.probe();

      expect(result).toBe(true);
    });

    it("returns false and sets status=unavailable when exit code != 0", async () => {
      mockSpawn.mockReturnValue(makeFakeProcess(1));
      const client = makeClient();

      const result = await client.probe();

      expect(result).toBe(false);
      expect(client.getStatus()).toBe("unavailable");
    });

    it("returns false and sets status=unavailable on spawn error (ENOENT)", async () => {
      const spawnError = Object.assign(new Error("spawn dart ENOENT"), { code: "ENOENT" });
      mockSpawn.mockReturnValue(makeFakeProcess(1, spawnError));
      const client = makeClient();

      const result = await client.probe();

      expect(result).toBe(false);
      expect(client.getStatus()).toBe("unavailable");
    });

    it("passes correct args to spawn", async () => {
      mockSpawn.mockReturnValue(makeFakeProcess(0));
      const client = new DartMcpClient("/usr/bin/dart", WORKSPACE, makeLogger());

      await client.probe();

      expect(mockSpawn).toHaveBeenCalledWith(
        "/usr/bin/dart",
        ["mcp-server", "--help"],
        expect.objectContaining({ cwd: WORKSPACE }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // connect()
  // --------------------------------------------------------------------------

  describe("connect()", () => {
    it("probes, then connects when dart is available", async () => {
      mockSpawn.mockReturnValue(makeFakeProcess(0));
      mockClientConnect.mockResolvedValue(undefined);

      const client = makeClient();
      await client.connect();

      expect(client.getStatus()).toBe("connected");
      expect(client.isAvailable()).toBe(true);
    });

    it("sets status=unavailable when probe fails", async () => {
      mockSpawn.mockReturnValue(makeFakeProcess(1));

      const client = makeClient();
      await client.connect();

      expect(client.getStatus()).toBe("unavailable");
      expect(client.isAvailable()).toBe(false);
      expect(mockClientConnect).not.toHaveBeenCalled();
    });

    it("is idempotent — calling connect() twice does not double-connect", async () => {
      mockSpawn.mockReturnValue(makeFakeProcess(0));
      mockClientConnect.mockResolvedValue(undefined);

      const client = makeClient();
      await client.connect();
      await client.connect();

      expect(mockClientConnect).toHaveBeenCalledTimes(1);
    });

    it("does nothing after dispose()", async () => {
      const client = makeClient();
      await client.dispose();
      await client.connect();

      expect(mockClientConnect).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // callTool()
  // --------------------------------------------------------------------------

  describe("callTool()", () => {
    it("returns success result with content on successful call", async () => {
      mockSpawn.mockReturnValue(makeFakeProcess(0));
      mockClientConnect.mockResolvedValue(undefined);
      mockClientCallTool.mockResolvedValue({
        content: [{ type: "text", text: "No issues found." }],
      });

      const client = makeClient();
      await client.connect();

      const result = await client.callTool("dart_analyze", { path: "/workspace" });

      expect(result.success).toBe(true);
      expect(result.content).toEqual([{ type: "text", text: "No issues found." }]);
      expect(result.error).toBeUndefined();
    });

    it("lazily connects when status is not_checked", async () => {
      mockSpawn.mockReturnValue(makeFakeProcess(0));
      mockClientConnect.mockResolvedValue(undefined);
      mockClientCallTool.mockResolvedValue({ content: [] });

      const client = makeClient();
      // Do NOT call connect() explicitly — callTool should do it
      const result = await client.callTool("dart_analyze", {});

      expect(mockClientConnect).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });

    it("returns graceful error when status=unavailable", async () => {
      mockSpawn.mockReturnValue(makeFakeProcess(1));

      const client = makeClient();
      await client.connect(); // will set unavailable

      const result = await client.callTool("dart_analyze", {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("not available");
      expect(mockClientCallTool).not.toHaveBeenCalled();
    });

    it("returns graceful error when disposed", async () => {
      const client = makeClient();
      await client.dispose();

      const result = await client.callTool("dart_analyze", {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("disposed");
    });

    it("returns error result (not throw) when callTool SDK throws generic error", async () => {
      mockSpawn.mockReturnValue(makeFakeProcess(0));
      mockClientConnect.mockResolvedValue(undefined);
      // A non-connection error so it doesn't trigger reconnect
      mockClientCallTool.mockRejectedValue(new Error("Unknown tool name: foo"));

      const client = makeClient();
      await client.connect();

      const result = await client.callTool("unknown_tool", {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown tool");
    });

    it("returns graceful error when status=failed (force-set)", async () => {
      const client = makeClient();
      // Force status directly without going through connect
      (client as unknown as { status: string }).status = "connected";
      (client as unknown as { client: unknown }).client = { callTool: mockClientCallTool, connect: mockClientConnect, close: mockClientClose };
      (client as unknown as { status: string }).status = "failed";

      const result = await client.callTool("dart_analyze", {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("restart");
    });
  });

  // --------------------------------------------------------------------------
  // Crash recovery (scheduleRestart — tested via direct private method calls)
  // --------------------------------------------------------------------------

  describe("crash recovery", () => {
    it("scheduleRestart increments restartCount and sets status=connecting", () => {
      const client = makeClient();
      // Force status to connected so scheduleRestart doesn't see disposed
      (client as unknown as { status: string }).status = "connected";

      (client as unknown as { scheduleRestart(): void }).scheduleRestart();

      expect(client.getStatus()).toBe("connecting");
      expect((client as unknown as { restartCount: number }).restartCount).toBe(1);
    });

    it("transitions to failed after MAX_RESTARTS (3) calls to scheduleRestart", () => {
      const client = makeClient();
      (client as unknown as { status: string }).status = "connected";

      // scheduleRestart: call 1 → restartCount=1, connecting
      // call 2 → restartCount=2, connecting
      // call 3 → restartCount=3, connecting
      // call 4 → restartCount=3 >= MAX_RESTARTS=3, so status=failed
      for (let i = 0; i < 4; i++) {
        (client as unknown as { scheduleRestart(): void }).scheduleRestart();
      }

      expect(client.getStatus()).toBe("failed");
    });

    it("scheduleRestart does not fire when disposed=true", () => {
      const client = makeClient();
      // Mark as disposed
      (client as unknown as { disposed: boolean }).disposed = true;

      (client as unknown as { scheduleRestart(): void }).scheduleRestart();

      // Status should remain not_checked (unchanged)
      expect(client.getStatus()).toBe("not_checked");
    });

    it("connection error in callTool triggers reconnect scheduling", async () => {
      mockSpawn.mockReturnValue(makeFakeProcess(0));
      mockClientConnect.mockResolvedValue(undefined);
      // A connection-type error triggers scheduleRestart
      mockClientCallTool.mockRejectedValue(new Error("transport connection closed"));

      const client = makeClient();
      await client.connect();
      expect(client.getStatus()).toBe("connected");

      const result = await client.callTool("dart_analyze", {});
      expect(result.success).toBe(false);

      // After connection error, status should be "connecting" (restart scheduled)
      expect(client.getStatus()).toBe("connecting");
    });
  });

  // --------------------------------------------------------------------------
  // dispose()
  // --------------------------------------------------------------------------

  describe("dispose()", () => {
    it("closes the SDK client and marks as unavailable", async () => {
      mockSpawn.mockReturnValue(makeFakeProcess(0));
      mockClientConnect.mockResolvedValue(undefined);
      mockClientClose.mockResolvedValue(undefined);

      const client = makeClient();
      await client.connect();
      expect(client.isAvailable()).toBe(true);

      await client.dispose();

      expect(mockClientClose).toHaveBeenCalledTimes(1);
      expect(client.isAvailable()).toBe(false);
    });

    it("is idempotent — calling dispose() twice does not throw", async () => {
      mockSpawn.mockReturnValue(makeFakeProcess(0));
      mockClientConnect.mockResolvedValue(undefined);
      mockClientClose.mockResolvedValue(undefined);

      const client = makeClient();
      await client.connect();

      await client.dispose();
      await expect(client.dispose()).resolves.not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // isAvailable() / getStatus()
  // --------------------------------------------------------------------------

  describe("isAvailable() / getStatus()", () => {
    it("returns false and not_checked before connecting", () => {
      const client = makeClient();
      expect(client.isAvailable()).toBe(false);
      expect(client.getStatus()).toBe("not_checked");
    });

    it("returns true only when connected and not disposed", async () => {
      mockSpawn.mockReturnValue(makeFakeProcess(0));
      mockClientConnect.mockResolvedValue(undefined);

      const client = makeClient();
      await client.connect();

      expect(client.isAvailable()).toBe(true);
      expect(client.getStatus()).toBe("connected");
    });
  });
});
