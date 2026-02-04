/**
 * Set Agent Verbosity Command
 *
 * Presents verbosity options and updates orchestra.agents.verbosity setting.
 */

import * as vscode from "vscode";
import type { VerbosityLevel } from "../agents/types.js";
import { getVerbosity } from "../config/settings.js";

interface VerbosityQuickPickItem extends vscode.QuickPickItem {
  value: VerbosityLevel;
}

export async function handleSetVerbosity(): Promise<void> {
  const options: VerbosityQuickPickItem[] = [
    {
      label: "Minimal",
      description: "Tool calls and results only",
      detail: "Hides thinking text",
      value: "minimal",
    },
    {
      label: "Normal",
      description: "Standard output",
      detail: "Includes thinking text and progress",
      value: "normal",
    },
    {
      label: "Detailed",
      description: "Expanded reasoning",
      detail: "Includes detailed context",
      value: "detailed",
    },
    {
      label: "Debug",
      description: "Tokens and timing",
      detail: "Shows raw metadata and timings",
      value: "debug",
    },
  ];

  const current = getVerbosity();
  const selection = await vscode.window.showQuickPick(
    options.map((option) => ({
      ...option,
      picked: option.value === current,
    })),
    {
      title: "Set Agent Verbosity",
      placeHolder: "Select verbosity level",
      ignoreFocusOut: true,
    },
  );

  if (!selection) {
    return;
  }

  const config = vscode.workspace.getConfiguration("orchestra");
  await config.update(
    "agents.verbosity",
    selection.value,
    vscode.ConfigurationTarget.Workspace,
  );

  vscode.window.showInformationMessage(
    `Orchestra: Verbosity set to ${selection.label}.`,
  );
}
