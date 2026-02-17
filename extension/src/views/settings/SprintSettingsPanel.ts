/**
 * Sprint Settings Panel
 *
 * WebView panel for human supervisors to configure TDD enforcement settings
 * and pre-signal commands. Reads/writes to config table in database.
 */

import * as vscode from "vscode";
import { OrchestraDB } from "../../database/client.js";
import * as schema from "../../database/local-schema.js";
import { OrchestraLogger } from "../../utils/logger.js";

interface SprintSettings {
  requireTests: boolean;
  requireTestsCategories: string;
  testFilePattern: string;
  testPattern: string;
  preSignalBuildCommand: string;
  preSignalTestCommand: string;
  autoCommit: boolean;
  orchestratorModel: string;
  implementorModel: string;
  controllerModel: string;
  maxIterations: number;
}

export class SprintSettingsPanel {
  public static currentPanel: SprintSettingsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _workspaceRoot: string;
  private readonly _logger: OrchestraLogger;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    workspaceRoot: string,
    logger: OrchestraLogger,
  ) {
    this._panel = panel;
    this._workspaceRoot = workspaceRoot;
    this._logger = logger;

    // Set the webview's HTML content
    this._update();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message) => this._handleMessage(message),
      null,
      this._disposables,
    );
  }

  /**
   * Show or create the settings panel
   */
  public static show(workspaceRoot: string, logger: OrchestraLogger): void {
    const column = vscode.ViewColumn.One;

    // If panel already exists, reveal it
    if (SprintSettingsPanel.currentPanel) {
      SprintSettingsPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      "orchestraSprintSettings",
      "Sprint Settings",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    SprintSettingsPanel.currentPanel = new SprintSettingsPanel(
      panel,
      workspaceRoot,
      logger,
    );
  }

  /**
   * Dispose of the panel
   */
  public dispose(): void {
    SprintSettingsPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  /**
   * Handle messages from the webview
   */
  private async _handleMessage(message: {
    type: string;
    settings?: SprintSettings;
  }): Promise<void> {
    switch (message.type) {
      case "load":
        await this._loadSettings();
        break;
      case "save":
        if (message.settings) {
          await this._saveSettings(message.settings);
        }
        break;
      default:
        this._logger.warn(`Unknown message type: ${message.type}`);
    }
  }

  /**
   * Load settings from database and send to webview
   */
  private async _loadSettings(): Promise<void> {
    try {
      const db = OrchestraDB.getDrizzleInstance(this._workspaceRoot);

      // Query all config entries
      const configRows = db
        .select()
        .from(schema.config as unknown as typeof schema.config)
        .all() as Array<{ key: string; value: string }>;

      const configMap = new Map(configRows.map((row) => [row.key, row.value]));

      // Build settings object with defaults
      const workspaceConfig = vscode.workspace.getConfiguration("orchestra");
      const defaultModels = {
        orchestrator: workspaceConfig.get<string>(
          "models.orchestrator",
          "claude-opus-4.5",
        ),
        implementor: workspaceConfig.get<string>(
          "models.implementor",
          "claude-sonnet-4.5",
        ),
        controller: workspaceConfig.get<string>(
          "models.controller",
          "claude-opus-4.5",
        ),
      };

      const settings: SprintSettings = {
        requireTests: configMap.get("tdd.require_tests") === "true",
        requireTestsCategories:
          configMap.get("tdd.require_tests_categories") ||
          "INFRASTRUCTURE,INTEGRATION",
        testFilePattern:
          configMap.get("tdd.test_file_pattern") || "test/**/*.test.ts",
        testPattern: configMap.get("tdd.test_pattern") || "describe|test|it",
        preSignalBuildCommand: configMap.get("pre_signal_build_command") || "",
        preSignalTestCommand: configMap.get("pre_signal_test_command") || "",
        autoCommit: configMap.get("git.auto_commit") === "true",
        orchestratorModel:
          configMap.get("models.orchestrator") || defaultModels.orchestrator,
        implementorModel:
          configMap.get("models.implementor") || defaultModels.implementor,
        controllerModel:
          configMap.get("models.controller") || defaultModels.controller,
        maxIterations: parseInt(
          configMap.get("agent.max_iterations") || "80",
          10,
        ),
      };

      const availableModels = await this._getAvailableModels();

      await this._panel.webview.postMessage({
        type: "settingsLoaded",
        settings,
        availableModels,
      });
    } catch (error) {
      this._logger.error("Failed to load settings", error);
      await this._panel.webview.postMessage({
        type: "error",
        message: `Failed to load settings: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  }

  /**
   * Save settings to database
   */
  private async _saveSettings(settings: SprintSettings): Promise<void> {
    try {
      const db = OrchestraDB.getInstance(this._workspaceRoot);
      const now = new Date().toISOString();

      // Prepare upsert statements
      const upsert = db.prepare(`
        INSERT INTO config (key, value, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `);

      // Save each setting
      const configEntries = [
        {
          key: "tdd.require_tests",
          value: settings.requireTests.toString(),
          description: "Enable TDD test requirement enforcement",
        },
        {
          key: "tdd.require_tests_categories",
          value: settings.requireTestsCategories,
          description: "Task categories requiring tests (comma-separated)",
        },
        {
          key: "tdd.test_file_pattern",
          value: settings.testFilePattern,
          description: "Glob pattern for test files",
        },
        {
          key: "tdd.test_pattern",
          value: settings.testPattern,
          description: "Regex pattern for test content",
        },
        {
          key: "pre_signal_build_command",
          value: settings.preSignalBuildCommand,
          description: "Command to run before signal (build)",
        },
        {
          key: "pre_signal_test_command",
          value: settings.preSignalTestCommand,
          description: "Command to run before signal (test)",
        },
        {
          key: "git.auto_commit",
          value: settings.autoCommit.toString(),
          description: "Enable automatic git commits after task operations",
        },
        {
          key: "models.orchestrator",
          value: settings.orchestratorModel,
          description: "AI model for orchestrator role",
        },
        {
          key: "models.implementor",
          value: settings.implementorModel,
          description: "AI model for implementor role",
        },
        {
          key: "models.controller",
          value: settings.controllerModel,
          description: "AI model for controller role",
        },
        {
          key: "agent.max_iterations",
          value: settings.maxIterations.toString(),
          description: "Maximum agent loop iterations",
        },
        {
          key: "tools.prepare_task.auto_commit",
          value: settings.autoCommit.toString(),
          description: "Auto-commit handover files after prepare",
        },
        {
          key: "tools.signal_completion.auto_commit",
          value: settings.autoCommit.toString(),
          description: "Auto-commit implementation after signal",
        },
        {
          key: "tools.complete_task.auto_commit",
          value: settings.autoCommit.toString(),
          description: "Auto-commit after task completion",
        },
      ];

      for (const entry of configEntries) {
        upsert.run(entry.key, entry.value, entry.description, now, now);
      }

      this._logger.info("Sprint settings saved successfully");

      await this._panel.webview.postMessage({
        type: "saved",
      });

      vscode.window.showInformationMessage(
        "Sprint settings saved successfully",
      );
    } catch (error) {
      this._logger.error("Failed to save settings", error);
      await this._panel.webview.postMessage({
        type: "error",
        message: `Failed to save settings: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
      vscode.window.showErrorMessage(
        `Failed to save settings: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  private async _getAvailableModels(): Promise<
    Array<{ id: string; label: string }>
  > {
    try {
      const copilotModels = await vscode.lm.selectChatModels({
        vendor: "copilot",
      });

      const models =
        copilotModels.length > 0
          ? copilotModels
          : await vscode.lm.selectChatModels();

      return models.map((model) => ({
        id: model.id,
        label: this._formatModelLabel(model),
      }));
    } catch (error) {
      this._logger.warn("Failed to load Copilot models", error);
      return [];
    }
  }

  private _formatModelLabel(model: vscode.LanguageModelChat): string {
    const vendor = model.vendor ? model.vendor : "model";
    const family = model.family ? ` ${model.family}` : "";
    const version = model.version ? ` ${model.version}` : "";
    const label = `${vendor}${family}${version}`.trim();
    return label || model.id;
  }

  /**
   * Update the webview's HTML content
   */
  private _update(): void {
    this._panel.webview.html = this._getHtmlContent();
  }

  /**
   * Generate the HTML content for the webview
   */
  private _getHtmlContent(): string {
    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Sprint Settings</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 20px;
      max-width: 800px;
    }
    h1 {
      color: var(--vscode-foreground);
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    h2 {
      color: var(--vscode-foreground);
      font-size: 1.1em;
      margin-top: 30px;
      margin-bottom: 15px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      margin-bottom: 5px;
      font-weight: 500;
    }
    input[type="text"],
    input[type="number"],
    textarea,
    select {
      width: 100%;
      padding: 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      box-sizing: border-box;
    }
    input[type="text"]:focus,
    input[type="number"]:focus,
    textarea:focus,
    select:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    input[type="checkbox"] {
      margin-right: 8px;
    }
    .checkbox-label {
      display: flex;
      align-items: center;
      cursor: pointer;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 10px 20px;
      cursor: pointer;
      font-size: 14px;
      margin-right: 10px;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .button-group {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .help-text {
      font-size: 0.9em;
      color: var(--vscode-descriptionForeground);
      margin-top: 5px;
    }
    .error {
      color: var(--vscode-errorForeground);
      margin-top: 10px;
      padding: 10px;
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
    }
    .success {
      color: var(--vscode-terminal-ansiGreen);
      margin-top: 10px;
      padding: 10px;
    }
  </style>
</head>
<body>
  <h1>Sprint Settings</h1>
  
  <h2>TDD Enforcement</h2>
  
  <div class="form-group">
    <label class="checkbox-label">
      <input type="checkbox" id="requireTests">
      <span>Require tests for tasks</span>
    </label>
    <div class="help-text">When enabled, prepare_task will auto-inject test verification checks for matching task categories</div>
  </div>
  
  <div class="form-group">
    <label for="requireTestsCategories">Task categories requiring tests</label>
    <input type="text" id="requireTestsCategories" placeholder="INFRASTRUCTURE,INTEGRATION">
    <div class="help-text">Comma-separated list of task categories that require tests</div>
  </div>
  
  <div class="form-group">
    <label for="testFilePattern">Test file pattern (auto-detected if empty)</label>
    <input type="text" id="testFilePattern" placeholder="test/**/*.test.ts">
    <div class="help-text">Glob pattern to match test files. If empty, Orchestra auto-detects based on project language (Dart, Python, Go, Rust, etc.)</div>
  </div>
  
  <div class="form-group">
    <label for="testPattern">Test content pattern (auto-detected if empty)</label>
    <input type="text" id="testPattern" placeholder="describe|test|it">
    <div class="help-text">Regex pattern to match test declarations. If empty, Orchestra auto-detects based on project language</div>
  </div>
  
  <h2>Pre-Signal Commands</h2>
  
  <div class="form-group">
    <label for="preSignalBuildCommand">Build command</label>
    <input type="text" id="preSignalBuildCommand" placeholder="npm run build">
    <div class="help-text">Command to run before signal completion (build step)</div>
  </div>
  
  <div class="form-group">
    <label for="preSignalTestCommand">Test command</label>
    <input type="text" id="preSignalTestCommand" placeholder="npm test">
    <div class="help-text">Command to run before signal completion (test step)</div>
  </div>

  <h2>Agent Models (Copilot)</h2>

  <div class="form-group">
    <label for="orchestratorModel">Orchestrator model</label>
    <select id="orchestratorModel"></select>
    <div class="help-text">Model used for orchestrator prompts (task preparation and verification)</div>
  </div>

  <div class="form-group">
    <label for="implementorModel">Implementor model</label>
    <select id="implementorModel"></select>
    <div class="help-text">Model used for implementor prompts (task execution)</div>
  </div>

  <div class="form-group">
    <label for="controllerModel">Controller model</label>
    <select id="controllerModel"></select>
    <div class="help-text">Model used for controller prompts (review and verification)</div>
  </div>

  <h2>Agent Execution</h2>

  <div class="form-group">
    <label for="maxIterations">Maximum agent loop iterations</label>
    <input type="number" id="maxIterations" min="10" max="500" step="10" value="80">
    <div class="help-text">Maximum number of tool calls/iterations per agent run (default: 80)</div>
  </div>
  
  <h2>Git Automation</h2>
  
  <div class="form-group">
    <label class="checkbox-label">
      <input type="checkbox" id="autoCommit">
      <span>Auto-commit after task operations</span>
    </label>
    <div class="help-text">When enabled, automatically create git commits after prepare_task, signal_completion, and complete_task</div>
  </div>
  
  <div class="button-group">
    <button id="saveButton">Save Settings</button>
    <button id="cancelButton">Cancel</button>
  </div>
  
  <div id="message"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    
    // Form elements
    const requireTests = document.getElementById('requireTests');
    const requireTestsCategories = document.getElementById('requireTestsCategories');
    const testFilePattern = document.getElementById('testFilePattern');
    const testPattern = document.getElementById('testPattern');
    const preSignalBuildCommand = document.getElementById('preSignalBuildCommand');
    const preSignalTestCommand = document.getElementById('preSignalTestCommand');
    const autoCommit = document.getElementById('autoCommit');
    const orchestratorModel = document.getElementById('orchestratorModel');
    const implementorModel = document.getElementById('implementorModel');
    const controllerModel = document.getElementById('controllerModel');
    const maxIterations = document.getElementById('maxIterations');
    const saveButton = document.getElementById('saveButton');
    const cancelButton = document.getElementById('cancelButton');
    const messageDiv = document.getElementById('message');
    
    // Load settings on startup
    vscode.postMessage({ type: 'load' });
    
    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      
      switch (message.type) {
        case 'settingsLoaded':
          populateForm(message.settings, message.availableModels || []);
          break;
        case 'saved':
          showMessage('Settings saved successfully', 'success');
          break;
        case 'error':
          showMessage(message.message, 'error');
          break;
      }
    });
    
    // Populate form with settings
    function populateForm(settings, availableModels) {
      requireTests.checked = settings.requireTests;
      requireTestsCategories.value = settings.requireTestsCategories;
      testFilePattern.value = settings.testFilePattern;
      testPattern.value = settings.testPattern;
      preSignalBuildCommand.value = settings.preSignalBuildCommand;
      preSignalTestCommand.value = settings.preSignalTestCommand;
      autoCommit.checked = settings.autoCommit;
      maxIterations.value = settings.maxIterations.toString();
      populateModelSelect(orchestratorModel, availableModels, settings.orchestratorModel);
      populateModelSelect(implementorModel, availableModels, settings.implementorModel);
      populateModelSelect(controllerModel, availableModels, settings.controllerModel);
    }

    function populateModelSelect(selectEl, models, currentValue) {
      selectEl.innerHTML = '';

      const values = new Set(models.map(m => m.id));
      if (currentValue && !values.has(currentValue)) {
        const option = document.createElement('option');
        option.value = currentValue;
        option.textContent = currentValue + ' (unavailable)';
        selectEl.appendChild(option);
      }

      for (const model of models) {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.label || model.id;
        selectEl.appendChild(option);
      }

      if (currentValue) {
        selectEl.value = currentValue;
      }
    }
    
    // Save button handler
    saveButton.addEventListener('click', () => {
      const settings = {
        requireTests: requireTests.checked,
        requireTestsCategories: requireTestsCategories.value.trim(),
        testFilePattern: testFilePattern.value.trim(),
        testPattern: testPattern.value.trim(),
        preSignalBuildCommand: preSignalBuildCommand.value.trim(),
        preSignalTestCommand: preSignalTestCommand.value.trim(),
        autoCommit: autoCommit.checked,
        orchestratorModel: orchestratorModel.value,
        implementorModel: implementorModel.value,
        controllerModel: controllerModel.value,
        maxIterations: parseInt(maxIterations.value, 10) || 80,
      };
      
      vscode.postMessage({ type: 'save', settings });
      saveButton.disabled = true;
      saveButton.textContent = 'Saving...';
    });
    
    // Cancel button handler
    cancelButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'load' }); // Reload original settings
      messageDiv.innerHTML = '';
    });
    
    // Show message to user
    function showMessage(text, type) {
      messageDiv.className = type;
      messageDiv.textContent = text;
      saveButton.disabled = false;
      saveButton.textContent = 'Save Settings';
      
      if (type === 'success') {
        setTimeout(() => {
          messageDiv.innerHTML = '';
        }, 3000);
      }
    }
  </script>
</body>
</html>`;
  }

  /**
   * Generate a nonce for CSP
   */
  private _getNonce(): string {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
