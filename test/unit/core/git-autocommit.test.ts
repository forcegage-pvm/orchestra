/**
 * Git auto-commit tests
 *
 * Validates auto-commit behavior is robust when cwd is a subdirectory.
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { autoCommitIfEnabled } from "../../../src/core/git.js";
import { getDb } from "../../../src/db/index.js";
import { config } from "../../../src/db/schema.js";
import { cleanupTestDb, setupTestDb } from "../../setup/db-cache.js";

describe("git auto-commit", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("orchestra-git-test-");

    // Initialize git repo in the workspace
    const git = simpleGit(tempDir);
    await git.init();
    await git.addConfig("user.name", "orchestra-test");
    await git.addConfig("user.email", "orchestra-test@example.com");
    await git.addConfig("commit.gpgsign", "false");

    // Avoid committing the SQLite DB in tests
    fs.writeFileSync(
      path.join(tempDir, ".gitignore"),
      ".orchestra/\n",
      "utf-8",
    );

    // Seed a tracked file we will modify later
    fs.writeFileSync(path.join(tempDir, "root.txt"), "v1\n", "utf-8");

    await git.add(["."]);
    await git.commit("chore: init");

    fs.mkdirSync(path.join(tempDir, "child"), { recursive: true });
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  it("stages and commits changes even when cwd is a subdirectory", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    // Enable auto-commit globally and for the tool
    await db
      .update(config)
      .set({ value: "true", updated_at: now })
      .where(eq(config.key, "git.auto_commit"));

    await db
      .update(config)
      .set({ value: "true", updated_at: now })
      .where(eq(config.key, "tools.signal_completion.auto_commit"));

    // Modify a file at repo root
    fs.appendFileSync(path.join(tempDir, "root.txt"), "v2\n", "utf-8");

    const commitMessage = "feat(orchestra): test auto-commit";

    const result = await autoCommitIfEnabled({
      toolName: "signal_completion",
      commitMessage,
      sprintId: null,
      taskInternalId: null,
      cwd: path.join(tempDir, "child"),
    });

    expect(result.committed).toBe(true);
    expect(result.sha).toBeTruthy();

    const git = simpleGit(tempDir);
    const log = await git.log({ maxCount: 1 });
    expect(log.latest?.message).toBe(commitMessage);

    const status = await git.status();
    expect(status.isClean()).toBe(true);
  });
});
