/**
 * Mock database client for tests
 * 
 * Provides mock implementations of OrchestraDB that don't require actual database files
 */

import { vi } from "vitest";

/**
 * Creates a mock Drizzle database instance
 */
export function createMockDrizzleInstance() {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
        limit: vi.fn(() => Promise.resolve([])),
        orderBy: vi.fn(() => Promise.resolve([])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([])),
        run: vi.fn(() => Promise.resolve({ changes: 1, lastInsertRowid: 1 })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve({ changes: 1 })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve({ changes: 1 })),
    })),
  };
}

/**
 * Creates a mock better-sqlite3 database instance
 */
export function createMockSqliteInstance() {
  return {
    prepare: vi.fn((sql: string) => ({
      get: vi.fn(() => null),
      all: vi.fn(() => []),
      run: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 })),
    })),
    exec: vi.fn(),
    pragma: vi.fn(),
    close: vi.fn(),
  };
}

/**
 * Mock for OrchestraDB class
 */
export const mockOrchestraDB = {
  getInstance: vi.fn(() => createMockSqliteInstance()),
  getDrizzleInstance: vi.fn(() => createMockDrizzleInstance()),
  close: vi.fn(),
};

/**
 * Helper to setup database mocks for tests
 */
export function setupDatabaseMocks() {
  vi.mock("../../src/database/client.js", () => ({
    OrchestraDB: mockOrchestraDB,
  }));
  
  return mockOrchestraDB;
}
