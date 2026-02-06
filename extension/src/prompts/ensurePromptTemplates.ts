/**
 * Ensure prompt templates are synced from extension bundle to workspace.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export interface PromptTemplateLogger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface PromptTemplateOptions {
  logger?: PromptTemplateLogger;
  showErrorMessage?: (message: string) => void;
}

/**
 * Ensure prompt templates are synced from extension bundle to workspace
 * Always overwrites to ensure users have the latest template definitions
 *
 * Templates are copied from extension bundle at extension/templates/prompts/
 * to workspace at .orchestra/templates/prompts/
 */
export function ensurePromptTemplates(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  options: PromptTemplateOptions = {},
): void {
  const targetDir = path.join(
    workspaceRoot,
    ".orchestra",
    "templates",
    "prompts",
  );
  const partialsDir = path.join(targetDir, "_partials");
  const schemaDir = path.join(targetDir, "_schema");
  const sourceDir = path.join(context.extensionPath, "templates", "prompts");
  const effectiveLogger: PromptTemplateLogger = options.logger ?? {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  const showErrorMessage =
    options.showErrorMessage ??
    ((message: string) => {
      void vscode.window.showErrorMessage(message);
    });

  const handleError = (message: string, err: unknown): void => {
    const errorMessage = err instanceof Error ? err.message : String(err);
    effectiveLogger.error(`${message}: ${errorMessage}`);
    showErrorMessage(`Orchestra: ${message}. ${errorMessage}`);
  };

  const checkExists = (
    targetPath: string,
    description: string,
  ): boolean | null => {
    try {
      return fs.existsSync(targetPath);
    } catch (err) {
      handleError(`Failed to check ${description}`, err);
      return null;
    }
  };

  const ensureDir = (dir: string, description: string): boolean => {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        effectiveLogger.info(`Created ${description} directory at ${dir}`);
      }
      return true;
    } catch (err) {
      handleError(`Failed to create ${description} directory`, err);
      return false;
    }
  };

  const readDir = (dir: string, description: string): string[] | null => {
    try {
      return fs.readdirSync(dir);
    } catch (err) {
      handleError(`Failed to read ${description} directory`, err);
      return null;
    }
  };

  const getStat = (targetPath: string, description: string): fs.Stats | null => {
    try {
      return fs.statSync(targetPath);
    } catch (err) {
      handleError(`Failed to read ${description}`, err);
      return null;
    }
  };

  const copyFile = (
    sourcePath: string,
    targetPath: string,
    logMessage: string,
    errorContext: string,
  ): void => {
    try {
      fs.copyFileSync(sourcePath, targetPath);
      effectiveLogger.info(logMessage);
    } catch (err) {
      handleError(`Failed to copy ${errorContext}`, err);
    }
  };

  const runSync = (): void => {
    if (!ensureDir(targetDir, ".orchestra/templates/prompts")) {
      return;
    }

    if (!ensureDir(partialsDir, "_partials")) {
      return;
    }

    if (!ensureDir(schemaDir, "_schema")) {
      return;
    }

    const sourceExists = checkExists(
      sourceDir,
      "prompt templates source directory",
    );
    if (sourceExists === null) {
      return;
    }
    if (!sourceExists) {
      effectiveLogger.warn(
        `Prompt templates source directory not found: ${sourceDir}`,
      );
      return;
    }

    const sourceFiles = readDir(sourceDir, "prompt templates source");
    if (!sourceFiles) {
      return;
    }

    for (const file of sourceFiles) {
      const sourcePath = path.join(sourceDir, file);
      const stat = getStat(sourcePath, `prompt template ${file}`);

      if (stat?.isFile() && file.endsWith(".hbs")) {
        const targetPath = path.join(targetDir, file);
        copyFile(
          sourcePath,
          targetPath,
          `Synced prompt template: ${file}`,
          `prompt template ${file}`,
        );
      }
    }

    const sourcePartialsDir = path.join(sourceDir, "_partials");
    const partialsExists = checkExists(
      sourcePartialsDir,
      "prompt template partials directory",
    );
    if (partialsExists) {
      const partialFiles = readDir(sourcePartialsDir, "prompt template partials");
      if (partialFiles) {
        for (const file of partialFiles) {
          const sourcePath = path.join(sourcePartialsDir, file);
          const stat = getStat(sourcePath, `prompt partial ${file}`);

          if (stat?.isFile()) {
            const targetPath = path.join(partialsDir, file);
            copyFile(
              sourcePath,
              targetPath,
              `Synced partial template: ${file}`,
              `prompt partial ${file}`,
            );
          }
        }
      }
    }

    const sourceSchemaDir = path.join(sourceDir, "_schema");
    const schemaExists = checkExists(
      sourceSchemaDir,
      "prompt template schema directory",
    );
    if (schemaExists) {
      const schemaFiles = readDir(sourceSchemaDir, "prompt template schema");
      if (schemaFiles) {
        for (const file of schemaFiles) {
          const sourcePath = path.join(sourceSchemaDir, file);
          const stat = getStat(sourcePath, `prompt schema ${file}`);

          if (stat?.isFile()) {
            const targetPath = path.join(schemaDir, file);
            copyFile(
              sourcePath,
              targetPath,
              `Synced schema file: ${file}`,
              `prompt schema ${file}`,
            );
          }
        }
      }
    }
  };

  try {
    runSync();
  } catch (err) {
    handleError("Unexpected error while syncing prompt templates", err);
  }
}
