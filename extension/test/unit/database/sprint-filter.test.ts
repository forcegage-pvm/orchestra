/**
 * SprintFilter Type Tests
 *
 * Verifies SprintFilter type and Sprint interface include is_archived.
 */

import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

describe("SprintFilter type and Sprint interface", () => {
  it("defines SprintFilter with active/archived/all", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../../src/database/queries.ts"),
      "utf-8"
    );

    expect(source).toContain(
      'export type SprintFilter = "active" | "archived" | "all";'
    );
  });

  it("includes is_archived on Sprint interface", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../../src/database/queries.ts"),
      "utf-8"
    );

    const sprintMatch = source.match(/export interface Sprint[\s\S]*?\}/);
    expect(sprintMatch).toBeTruthy();
    expect(sprintMatch![0]).toContain("is_archived: boolean");
  });
});
