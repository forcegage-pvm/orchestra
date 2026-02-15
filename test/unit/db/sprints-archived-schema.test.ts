/**
 * Sprints is_archived Schema Tests
 *
 * Verifies the sprints table schema includes is_archived column and index.
 */

import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

describe("Sprints schema is_archived column", () => {
  it("defines is_archived column with boolean default false", () => {
    const schemaSource = fs.readFileSync(
      path.join(__dirname, "../../../src/db/schema.ts"),
      "utf-8"
    );

    const sprintsBlock = schemaSource.match(
      /export const sprints = sqliteTable\([\s\S]*?\);/
    );

    expect(sprintsBlock).toBeTruthy();
    const block = sprintsBlock![0];

    expect(block).toContain("is_archived");
    expect(block).toContain('integer("is_archived", { mode: "boolean" })');
    expect(block).toMatch(/is_archived[\s\S]*?default\(false\)/);
  });

  it("defines is_archived index", () => {
    const schemaSource = fs.readFileSync(
      path.join(__dirname, "../../../src/db/schema.ts"),
      "utf-8"
    );

    expect(schemaSource).toContain('index("is_archived_idx")');
  });
});
