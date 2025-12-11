/**
 * Orchestra Database Client Singleton
 *
 * Provides full read-write access to Orchestra's SQLite database using better-sqlite3
 * and Drizzle ORM. The singleton pattern ensures only one database connection
 * exists per workspace, with lazy initialization to avoid connecting until needed.
 *
 * CRITICAL: This client is for HUMAN SUPERVISOR use only (via the VS Code extension).
 * AI agents must use the MCP server for controlled access. The human supervisor has
 * zero restrictions and needs full database access to resolve escalations, override
 * decisions, and perform manual interventions when the automated workflow fails.
 */

import Database from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { DatabaseError } from "../utils/errors.js";
import { getOrchestraDBPath } from "../workspace/detector.js";

// Type for the Drizzle instance (schema is loaded dynamically to avoid module conflicts)
type DrizzleInstance = BetterSQLite3Database<Record<string, never>>;

/**
 * Orchestra Database Client Singleton
 *
 * Manages a single read-only connection to the Orchestra database.
 * Uses lazy initialization - connection is created only on first access.
 */
export class OrchestraDB {
  private static drizzleInstance: DrizzleInstance | null = null;
  private static sqliteConnection: Database.Database | null = null;
  private static currentWorkspaceRoot: string | null = null;

  /**
   * Private constructor to prevent direct instantiation
   */
  private constructor() {}

  /**
   * Gets the singleton database instance for a given workspace
   *
   * Returns the raw better-sqlite3 Database instance for backward compatibility.
   * For type-safe queries, use getDrizzleInstance() instead.
   *
   * @param workspaceRoot Absolute path to workspace root containing .orchestra/
   * @returns better-sqlite3 Database instance
   * @throws DatabaseError if database file is missing or corrupted
   */
  public static getInstance(workspaceRoot: string): Database.Database {
    // Ensure connection is initialized
    OrchestraDB.ensureConnection(workspaceRoot);
    return OrchestraDB.sqliteConnection!;
  }

  /**
   * Gets the Drizzle ORM database instance for type-safe queries
   *
   * @param workspaceRoot Absolute path to workspace root containing .orchestra/
   * @returns Drizzle database instance for type-safe queries
   * @throws DatabaseError if database file is missing or corrupted
   */
  public static getDrizzleInstance(workspaceRoot: string): DrizzleInstance {
    // Ensure connection is initialized
    OrchestraDB.ensureConnection(workspaceRoot);
    return OrchestraDB.drizzleInstance!;
  }

  /**
   * Ensures database connection is initialized for the given workspace
   *
   * @param workspaceRoot Absolute path to workspace root containing .orchestra/
   * @throws DatabaseError if database file is missing or corrupted
   */
  private static ensureConnection(workspaceRoot: string): void {
    // If connection exists and workspace hasn't changed, return
    if (
      OrchestraDB.sqliteConnection &&
      OrchestraDB.currentWorkspaceRoot === workspaceRoot
    ) {
      return;
    }

    // If workspace changed, close existing connection first
    if (
      OrchestraDB.sqliteConnection &&
      OrchestraDB.currentWorkspaceRoot !== workspaceRoot
    ) {
      OrchestraDB.close();
    }

    // Create new connection
    const dbPath = getOrchestraDBPath(workspaceRoot);

    try {
      // Open database with full read-write access for human supervisor
      OrchestraDB.sqliteConnection = new Database(dbPath, {
        fileMustExist: true,
      });

      // Configure SQLite for optimal performance
      OrchestraDB.sqliteConnection.pragma("cache_size = -64000"); // 64MB cache
      OrchestraDB.sqliteConnection.pragma("temp_store = MEMORY");
      OrchestraDB.sqliteConnection.pragma("journal_mode = WAL"); // Write-Ahead Logging
      OrchestraDB.sqliteConnection.pragma("synchronous = NORMAL"); // Balance safety/speed

      // Create Drizzle ORM instance for type-safe queries
      // Schema is loaded at runtime to avoid module system conflicts
      OrchestraDB.drizzleInstance = drizzle(OrchestraDB.sqliteConnection);

      OrchestraDB.currentWorkspaceRoot = workspaceRoot;
    } catch (error) {
      // Handle missing database file
      if (error instanceof Error && error.message.includes("does not exist")) {
        throw new DatabaseError(
          `Orchestra database not found at ${dbPath}. ` +
            `Ensure you have initialized Orchestra in this workspace by running 'orchestra init'.`,
          { workspaceRoot, dbPath, error }
        );
      }

      // Handle corrupted database
      if (
        error instanceof Error &&
        (error.message.includes("SQLITE_CORRUPT") ||
          error.message.includes("malformed") ||
          error.message.includes("not a database"))
      ) {
        throw new DatabaseError(
          `Orchestra database at ${dbPath} is corrupted or invalid. ` +
            `Recovery guidance: ` +
            `1) Back up the current database file if it contains important data, ` +
            `2) Delete the corrupted database, ` +
            `3) Re-initialize Orchestra with 'orchestra init', ` +
            `4) Restore from backup if available.`,
          { workspaceRoot, dbPath, error }
        );
      }

      // Re-throw other errors with context - include original message
      const originalMessage =
        error instanceof Error ? error.message : String(error);
      throw new DatabaseError(
        `Failed to open Orchestra database: ${originalMessage}`,
        {
          workspaceRoot,
          dbPath,
          error,
        }
      );
    }
  }

  /**
   * Closes the database connection and clears the singleton instance
   *
   * Should be called when the extension is deactivated or when switching workspaces.
   * It is safe to call this method even if no connection exists.
   */
  public static close(): void {
    if (OrchestraDB.sqliteConnection) {
      try {
        OrchestraDB.sqliteConnection.close();
      } catch (error) {
        // Log error but don't throw - connection may already be closed
        console.error(
          `Error closing Orchestra database connection: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    OrchestraDB.sqliteConnection = null;
    OrchestraDB.drizzleInstance = null;
    OrchestraDB.currentWorkspaceRoot = null;
  }
}
