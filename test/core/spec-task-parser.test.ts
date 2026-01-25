/**
 * spec task parser tests
 */

import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseSpecTaskDefinitions } from "../../src/core/spec-task-parser.js";

describe("parseSpecTaskDefinitions", () => {
  let tempDir: string;
  let originalWorkspace: string | undefined;

  beforeEach(async () => {
    originalWorkspace = process.env.ORCHESTRA_WORKSPACE;
    tempDir = await fsMkdtemp();
    process.env.ORCHESTRA_WORKSPACE = tempDir;
  });

  afterEach(async () => {
    process.env.ORCHESTRA_WORKSPACE = originalWorkspace;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("parses header format tasks with acceptance criteria", async () => {
    const specPath = await writeSpecFile(
      "specs/header.md",
      [
        "### T012 — Implement get_code_review handler (Green)",
        "#### Acceptance",
        "- [ ] Handover context included in response",
        "- [ ] Returns spec_path",
        "",
        "### T013 — Add tests",
        "#### Acceptance Criteria",
        "- [ ] Adds unit tests",
      ].join("\n"),
    );

    const definitions = await parseSpecTaskDefinitions(specPath, [
      "T012",
      "T013",
    ]);

    expect(definitions).toHaveLength(2);
    expect(definitions[0]).toEqual({
      id: "T012",
      title: "Implement get_code_review handler (Green)",
      type: "implementation",
      acceptance_criteria: [
        "Handover context included in response",
        "Returns spec_path",
      ],
    });
    expect(definitions[1].type).toBe("test");
    expect(definitions[1].acceptance_criteria).toEqual(["Adds unit tests"]);
  });

  it("parses checklist format tasks", async () => {
    const specPath = await writeSpecFile(
      "specs/checklist.md",
      [
        "- [ ] T001 Add is_archived column to sprints",
        "- [ ] T002 Write tests for archival",
      ].join("\n"),
    );

    const definitions = await parseSpecTaskDefinitions(specPath, [
      "T001",
      "T002",
    ]);

    expect(definitions).toHaveLength(2);
    expect(definitions[0]).toEqual({
      id: "T001",
      title: "Add is_archived column to sprints",
      type: "implementation",
      acceptance_criteria: [],
    });
    expect(definitions[1].type).toBe("test");
    expect(definitions[1].acceptance_criteria).toEqual([]);
  });

  it("throws when spec file is missing", async () => {
    await expect(
      parseSpecTaskDefinitions("specs/missing.md", ["T001"]),
    ).rejects.toThrow("Spec file not found");
  });

  it("throws when task IDs are missing", async () => {
    const specPath = await writeSpecFile(
      "specs/partial.md",
      "- [ ] T001 Only task",
    );

    await expect(parseSpecTaskDefinitions(specPath, ["T999"])).rejects.toThrow(
      "T999",
    );
  });
});

async function fsMkdtemp() {
  return await mkdtemp(path.join(os.tmpdir(), "orchestra-spec-parser-"));
}

async function writeSpecFile(relativePath: string, content: string) {
  const fullPath = path.resolve(
    process.env.ORCHESTRA_WORKSPACE ?? "",
    relativePath,
  );
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf-8");
  return relativePath;
}
