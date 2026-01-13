/**
 * Drizzle ORM Schema Types
 *
 * This file provides type-safe access to the Orchestra database schema.
 * Due to module system constraints (parent project uses ESM, extension uses CommonJS),
 * we cannot directly re-export from the parent schema file. Instead, the Drizzle
 * instance created in client.ts includes the full schema for type-safe queries.
 *
 * The actual schema definitions are loaded at runtime via the Drizzle instance
 * in client.ts using dynamic imports.
 */

// Re-export commonly used Drizzle types for convenience
export type { InferInsertModel, InferSelectModel } from "drizzle-orm";
