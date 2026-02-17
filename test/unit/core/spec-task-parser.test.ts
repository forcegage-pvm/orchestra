/**
 * spec task parser tests
 */

import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  parseSpecTaskDefinitions,
  parseSpeckitTaskRefs,
} from "../../../src/core/spec-task-parser.js";

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

  it("parses colon, simple list, and table formats", async () => {
    const specPath = await writeSpecFile(
      "specs/extra-formats.md",
      [
        "T100: Implement colon format",
        "- T101 Write tests for list format",
        "| T102 | Implement table format |",
        "### T103 — Header title wins",
        "- T103 List title should not override",
      ].join("\n"),
    );

    const definitions = await parseSpecTaskDefinitions(specPath, [
      "T100",
      "T101",
      "T102",
      "T103",
    ]);

    expect(definitions).toHaveLength(4);
    expect(definitions[0]).toEqual({
      id: "T100",
      title: "Implement colon format",
      type: "implementation",
      acceptance_criteria: [],
    });
    expect(definitions[1]).toEqual({
      id: "T101",
      title: "Write tests for list format",
      type: "test",
      acceptance_criteria: [],
    });
    expect(definitions[2]).toEqual({
      id: "T102",
      title: "Implement table format",
      type: "implementation",
      acceptance_criteria: [],
    });
    expect(definitions[3]).toEqual({
      id: "T103",
      title: "Header title wins",
      type: "implementation",
      acceptance_criteria: [],
    });
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

describe("parseSpeckitTaskRefs", () => {
  it("returns empty array for null input", () => {
    expect(parseSpeckitTaskRefs(null)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseSpeckitTaskRefs("")).toEqual([]);
  });

  it("parses single task ID", () => {
    expect(parseSpeckitTaskRefs("T001")).toEqual(["T001"]);
  });

  it("parses comma-separated task IDs", () => {
    expect(parseSpeckitTaskRefs("T001, T002, T003")).toEqual([
      "T001",
      "T002",
      "T003",
    ]);
  });

  it("expands range notation T040-T043", () => {
    expect(parseSpeckitTaskRefs("T040-T043")).toEqual([
      "T040",
      "T041",
      "T042",
      "T043",
    ]);
  });

  it("expands range notation with zero padding preserved", () => {
    expect(parseSpeckitTaskRefs("T001-T003")).toEqual(["T001", "T002", "T003"]);
  });

  it("handles mixed ranges and single IDs", () => {
    expect(parseSpeckitTaskRefs("T001, T040-T043, T050")).toEqual([
      "T001",
      "T040",
      "T041",
      "T042",
      "T043",
      "T050",
    ]);
  });

  it("handles ranges with different prefixes", () => {
    expect(parseSpeckitTaskRefs("US001-US003")).toEqual([
      "US001",
      "US002",
      "US003",
    ]);
  });

  it("does not expand if start > end", () => {
    expect(parseSpeckitTaskRefs("T043-T040")).toEqual(["T043-T040"]);
  });

  it("trims whitespace from task IDs", () => {
    expect(parseSpeckitTaskRefs("  T001  ,  T002  ")).toEqual(["T001", "T002"]);
  });
});
