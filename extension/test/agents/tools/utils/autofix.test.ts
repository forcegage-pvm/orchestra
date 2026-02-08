/**
 * Auto-fix utility tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyAutoFixes,
  DEFAULT_AUTOFIX_KINDS,
  formatAutoFixSummary,
  type AutoFixResult,
} from "../../../../src/agents/tools/utils/autofix.js";

const { workspace, commands, Range, Position, Uri } = vi.hoisted(() => {
  const workspace = {
    openTextDocument: vi.fn(),
    applyEdit: vi.fn(),
  };

  const commands = {
    executeCommand: vi.fn(),
  };

  class Position {
    constructor(
      public line: number,
      public character: number,
    ) {}
  }

  class Range {
    constructor(
      public start: Position,
      public end: Position,
    ) {}
  }

  class Uri {
    static file(filePath: string): {
      fsPath: string;
      path: string;
      toString: () => string;
    } {
      return {
        fsPath: filePath,
        path: filePath,
        toString: () => filePath,
      };
    }
  }

  return { workspace, commands, Range, Position, Uri };
});

vi.mock("vscode", () => ({
  workspace,
  commands,
  Range,
  Position,
  Uri,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("applyAutoFixes", () => {
  it("should return applied: false when no actions available", async () => {
    const uri = Uri.file("/workspace/file.ts");

    const doc = {
      getText: () => "const x = 1;",
      positionAt: (offset: number) => new Position(0, offset),
    };
    workspace.openTextDocument.mockResolvedValue(doc);
    commands.executeCommand.mockResolvedValue([]);

    const result = await applyAutoFixes(uri, { delayMs: 0 });

    expect(result.applied).toBe(false);
    expect(result.actionsApplied).toBe(0);
    expect(result.kindsWithNoActions).toEqual(DEFAULT_AUTOFIX_KINDS);
    expect(result.errors).toEqual([]);
  });

  it("should apply WorkspaceEdit from returned actions", async () => {
    const uri = Uri.file("/workspace/file.ts");

    const doc = {
      getText: () => "const x = 1;",
      positionAt: (offset: number) => new Position(0, offset),
    };
    workspace.openTextDocument.mockResolvedValue(doc);
    workspace.applyEdit.mockResolvedValue(true);

    const mockEdit = { entries: () => [] };
    const mockAction = {
      title: "Fix all auto-fixable problems",
      edit: mockEdit,
    };

    // First kind returns action, second returns empty
    commands.executeCommand.mockResolvedValueOnce([mockAction]);
    commands.executeCommand.mockResolvedValueOnce([]);

    const result = await applyAutoFixes(uri, { delayMs: 0 });

    expect(result.applied).toBe(true);
    expect(result.actionsApplied).toBe(1);
    expect(result.actionDescriptions).toEqual([
      "[source.fixAll] Fix all auto-fixable problems",
    ]);
    expect(workspace.applyEdit).toHaveBeenCalledWith(mockEdit);
  });

  it("should execute action.command after applying edit", async () => {
    const uri = Uri.file("/workspace/file.ts");

    const doc = {
      getText: () => "const x = 1;",
      positionAt: (offset: number) => new Position(0, offset),
    };
    workspace.openTextDocument.mockResolvedValue(doc);
    workspace.applyEdit.mockResolvedValue(true);

    const mockAction = {
      title: "Organize imports",
      edit: { entries: () => [] },
      command: {
        command: "editor.organizeImports",
        arguments: ["arg1"],
      },
    };

    // First kind returns empty, second returns action with command
    commands.executeCommand.mockResolvedValueOnce([]);
    commands.executeCommand.mockResolvedValueOnce([mockAction]);

    const result = await applyAutoFixes(uri, { delayMs: 0 });

    expect(result.applied).toBe(true);
    expect(commands.executeCommand).toHaveBeenCalledWith(
      "editor.organizeImports",
      "arg1",
    );
  });

  it("should handle errors in individual actions gracefully", async () => {
    const uri = Uri.file("/workspace/file.ts");

    const doc = {
      getText: () => "const x = 1;",
      positionAt: (offset: number) => new Position(0, offset),
    };
    workspace.openTextDocument.mockResolvedValue(doc);
    workspace.applyEdit.mockRejectedValueOnce(new Error("Edit failed"));

    const mockAction = {
      title: "Bad fix",
      edit: { entries: () => [] },
    };

    commands.executeCommand.mockResolvedValueOnce([mockAction]);
    commands.executeCommand.mockResolvedValueOnce([]);

    const result = await applyAutoFixes(uri, { delayMs: 0 });

    expect(result.applied).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Bad fix");
    expect(result.errors[0]).toContain("Edit failed");
  });

  it("should process multiple kinds in order", async () => {
    const uri = Uri.file("/workspace/file.ts");

    const doc = {
      getText: () => "const x = 1;",
      positionAt: (offset: number) => new Position(0, offset),
    };
    workspace.openTextDocument.mockResolvedValue(doc);
    workspace.applyEdit.mockResolvedValue(true);

    // Both kinds return actions
    commands.executeCommand.mockResolvedValueOnce([
      { title: "Fix lint", edit: {} },
    ]);
    commands.executeCommand.mockResolvedValueOnce([
      { title: "Organize imports", edit: {} },
    ]);

    const result = await applyAutoFixes(uri, { delayMs: 0 });

    expect(result.applied).toBe(true);
    expect(result.actionsApplied).toBe(2);
    expect(result.actionDescriptions[0]).toContain("source.fixAll");
    expect(result.actionDescriptions[1]).toContain("source.organizeImports");
  });

  it("should respect custom kinds option", async () => {
    const uri = Uri.file("/workspace/file.ts");

    const doc = {
      getText: () => "const x = 1;",
      positionAt: (offset: number) => new Position(0, offset),
    };
    workspace.openTextDocument.mockResolvedValue(doc);
    commands.executeCommand.mockResolvedValue([]);

    await applyAutoFixes(uri, {
      kinds: ["source.fixAll.eslint"],
      delayMs: 0,
    });

    // Should only call executeCommand with the custom kind
    expect(commands.executeCommand).toHaveBeenCalledTimes(1);
    expect(commands.executeCommand).toHaveBeenCalledWith(
      "vscode.executeCodeActionProvider",
      uri,
      expect.any(Range),
      "source.fixAll.eslint",
      expect.any(Number),
    );
  });

  it("should handle provider errors gracefully", async () => {
    const uri = Uri.file("/workspace/file.ts");

    workspace.openTextDocument.mockRejectedValue(
      new Error("Cannot open document"),
    );

    const result = await applyAutoFixes(uri, { delayMs: 0 });

    expect(result.applied).toBe(false);
    expect(result.errors).toHaveLength(DEFAULT_AUTOFIX_KINDS.length);
    expect(result.errors[0]).toContain("Cannot open document");
  });

  it("should handle null actions result", async () => {
    const uri = Uri.file("/workspace/file.ts");

    const doc = {
      getText: () => "const x = 1;",
      positionAt: (offset: number) => new Position(0, offset),
    };
    workspace.openTextDocument.mockResolvedValue(doc);
    commands.executeCommand.mockResolvedValue(null);

    const result = await applyAutoFixes(uri, { delayMs: 0 });

    expect(result.applied).toBe(false);
    expect(result.kindsWithNoActions).toEqual(DEFAULT_AUTOFIX_KINDS);
  });
});

describe("formatAutoFixSummary", () => {
  it("should return null when nothing applied and no errors", () => {
    const result: AutoFixResult = {
      applied: false,
      actionsApplied: 0,
      actionDescriptions: [],
      kindsWithNoActions: ["source.fixAll"],
      errors: [],
    };

    expect(formatAutoFixSummary(result)).toBeNull();
  });

  it("should list applied actions", () => {
    const result: AutoFixResult = {
      applied: true,
      actionsApplied: 2,
      actionDescriptions: [
        "[source.fixAll] Fix all problems",
        "[source.organizeImports] Organize imports",
      ],
      kindsWithNoActions: [],
      errors: [],
    };

    const summary = formatAutoFixSummary(result);
    expect(summary).not.toBeNull();
    expect(summary).toContain("2 action(s) applied");
    expect(summary).toContain("Fix all problems");
    expect(summary).toContain("Organize imports");
  });

  it("should include errors", () => {
    const result: AutoFixResult = {
      applied: false,
      actionsApplied: 0,
      actionDescriptions: [],
      kindsWithNoActions: [],
      errors: ['Failed to apply "Bad fix": Edit failed'],
    };

    const summary = formatAutoFixSummary(result);
    expect(summary).not.toBeNull();
    expect(summary).toContain("Auto-fix errors");
    expect(summary).toContain("Bad fix");
  });

  it("should include both applied actions and errors", () => {
    const result: AutoFixResult = {
      applied: true,
      actionsApplied: 1,
      actionDescriptions: ["[source.fixAll] Fix lint"],
      kindsWithNoActions: [],
      errors: ['Failed to apply "Organize": Timeout'],
    };

    const summary = formatAutoFixSummary(result);
    expect(summary).not.toBeNull();
    expect(summary).toContain("1 action(s) applied");
    expect(summary).toContain("Fix lint");
    expect(summary).toContain("Auto-fix errors");
    expect(summary).toContain("Timeout");
  });
});
