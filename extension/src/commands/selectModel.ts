/**
 * Select Model Command
 *
 * Allows users to choose which model to use for each agent role.
 * Uses a two-step quick pick: role selection then model selection.
 */

import * as vscode from "vscode";
import type { Role } from "../config/ConfigService.js";

interface RoleQuickPickItem extends vscode.QuickPickItem {
  value: Role;
}

interface ModelQuickPickItem extends vscode.QuickPickItem {
  value: string;
}

const roleOptions: RoleQuickPickItem[] = [
  {
    label: "Orchestrator",
    description: "Plans and prepares tasks",
    value: "orchestrator",
  },
  {
    label: "Implementor",
    description: "Executes tasks and writes code",
    value: "implementor",
  },
  {
    label: "Controller",
    description: "Reviews specs and handovers",
    value: "controller",
  },
];

function isRole(value: unknown): value is Role {
  return (
    value === "orchestrator" ||
    value === "implementor" ||
    value === "controller"
  );
}

/**
 * Check if model selection is required for a given role.
 *
 * Model selection is NOT required if:
 * 1. A user has explicitly set a value in workspace or global settings, OR
 * 2. The package.json defines a default value
 *
 * This ensures users don't get prompted for model selection when defaults exist.
 */
export function isModelSelectionRequired(
  role: Role,
  configuration?: Pick<vscode.WorkspaceConfiguration, "inspect">,
): boolean {
  const config =
    configuration ?? vscode.workspace.getConfiguration("orchestra");
  const inspect = config.inspect<string>(`models.${role}`);
  if (!inspect) {
    return true;
  }

  // Check for explicit user-set value first
  const explicitValue = inspect.workspaceValue ?? inspect.globalValue;
  if (typeof explicitValue === "string" && explicitValue.trim().length > 0) {
    return false; // User has set a value, no selection needed
  }

  // Check for default value from package.json
  const defaultValue = inspect.defaultValue;
  if (typeof defaultValue === "string" && defaultValue.trim().length > 0) {
    return false; // Default exists, no selection needed
  }

  // No value configured anywhere
  return true;
}

export async function handleSelectModel(
  preferredRole?: Role,
): Promise<boolean> {
  let selectedRole: Role;

  // If role is provided, skip the role selection step
  if (isRole(preferredRole)) {
    selectedRole = preferredRole;
  } else {
    const roleSelection = await vscode.window.showQuickPick(roleOptions, {
      title: "Select Agent Role",
      placeHolder: "Choose which agent role to configure",
      ignoreFocusOut: true,
    });

    if (!roleSelection) {
      return false;
    }
    selectedRole = roleSelection.value;
  }

  const models = await vscode.lm.selectChatModels();
  if (!models || models.length === 0) {
    vscode.window.showErrorMessage(
      "Orchestra: No language models are available. Configure a model provider in VS Code settings.",
    );
    return false;
  }

  const modelItems: ModelQuickPickItem[] = models.map((model) => ({
    label: model.name ?? model.id,
    description: model.name ? model.id : undefined,
    detail: model.id,
    value: model.id,
  }));

  const roleLabel =
    roleOptions.find((r) => r.value === selectedRole)?.label ?? selectedRole;

  const modelSelection = await vscode.window.showQuickPick(modelItems, {
    title: `Select Model for ${roleLabel}`,
    placeHolder: "Choose a model",
    ignoreFocusOut: true,
  });

  if (!modelSelection) {
    return false;
  }

  const config = vscode.workspace.getConfiguration("orchestra");
  await config.update(
    `models.${selectedRole}`,
    modelSelection.value,
    vscode.ConfigurationTarget.Workspace,
  );

  vscode.window.showInformationMessage(
    `Orchestra: ${roleLabel} model set to ${modelSelection.label}.`,
  );

  return true;
}
