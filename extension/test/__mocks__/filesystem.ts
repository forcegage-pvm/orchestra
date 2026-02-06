/**
 * Mock filesystem utilities for tests
 * 
 * Provides mock implementations of fs operations that don't require actual files
 */

import { vi } from "vitest";

/**
 * Creates a mock fs.promises implementation
 */
export function createMockFsPromises() {
  return {
    realpath: vi.fn(async (p: string) => p),
    access: vi.fn(async () => undefined),
    readFile: vi.fn(async () => "mock file content"),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    readdir: vi.fn(async () => []),
    stat: vi.fn(async () => ({
      isFile: () => true,
      isDirectory: () => false,
      size: 100,
      mtime: new Date(),
    })),
  };
}

/**
 * Setup filesystem mocks for path validation tests
 * 
 * Mocks fs.realpath to make path validation work in tests without real directories
 */
export function setupFilesystemMocks(workspaceRoot: string = "/workspace") {
  const fsMocks = createMockFsPromises();
  
  // Mock realpath to return paths as-is (simulating they exist)
  fsMocks.realpath.mockImplementation(async (p: string) => {
    // Always return the path, treating it as valid
    return p;
  });
  
  vi.mock("fs", () => ({
    promises: fsMocks,
    default: {
      promises: fsMocks,
    },
  }));
  
  return fsMocks;
}
