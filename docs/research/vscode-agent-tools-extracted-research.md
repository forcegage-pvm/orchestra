# VS Code Agent Tools - Extracted Research

This document provides in-depth research on the tools defined in the Orchestra agent configuration files (`extension/agents/*.agent.md`). These tools are what VS Code makes available to agents during chat interactions.

> **Scope**: This research focuses on Windows 32/64-bit systems and documents how to implement equivalent functionality in custom VS Code extension agents.

---

## Table of Contents

1. [Tools Inventory](#tools-inventory)
2. [VS Code Category Tools](#vscode-category-tools)
3. [Execute Category Tools](#execute-category-tools)
4. [Read Category Tools](#read-category-tools)
5. [Edit Tools](#edit-tools)
6. [Search Tools](#search-tools)
7. [Web Tools](#web-tools)
8. [Todo Tools](#todo-tools)
9. [MCP Integration Tools](#mcp-integration-tools)
10. [Tool Registration Architecture](#tool-registration-architecture)
11. [Windows-Specific Considerations](#windows-specific-considerations)
12. [Implementation Patterns](#implementation-patterns)

---

## Tools Inventory

### Orchestrator Agent Tools

```yaml
tools:
  - vscode/getProjectSetupInfo
  - vscode/runCommand
  - execute/testFailure
  - execute/getTerminalOutput
  - execute/runTask
  - execute/createAndRunTask
  - execute/runInTerminal
  - execute/runTests
  - read/problems
  - read/readFile
  - read/terminalSelection
  - read/terminalLastCommand
  - read/getTaskOutput
  - edit
  - search
  - web/fetch
  - orchestra-orc/* # MCP tools
  - todo
```

### Implementor Agent Tools

```yaml
tools:
  - vscode/getProjectSetupInfo
  - vscode/installExtension
  - vscode/newWorkspace
  - vscode/runCommand
  - execute/testFailure
  - execute/getTerminalOutput
  - execute/runTask
  - execute/createAndRunTask
  - execute/runInTerminal
  - execute/runTests
  - read/problems
  - read/readFile
  - read/terminalSelection
  - read/terminalLastCommand
  - read/getTaskOutput
  - edit
  - search
  - web/fetch
  - orchestra-imp/* # MCP tools
  - todo
```

### Controller Agent Tools

```yaml
tools:
  - read/readFile
  - search
  - web/fetch
  - orchestra-ctrl/* # MCP tools
```

---

## VS Code Category Tools

### `vscode/getProjectSetupInfo`

**Purpose**: Retrieves information about the project structure, detected languages, frameworks, and development environment.

**VS Code API Implementation**:

```typescript
import * as vscode from "vscode";

interface ProjectSetupInfo {
  workspaceFolders: string[];
  detectedLanguages: string[];
  packageManager?: string;
  buildSystem?: string;
  testFramework?: string;
  configFiles: string[];
}

async function getProjectSetupInfo(): Promise<ProjectSetupInfo> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return {
      workspaceFolders: [],
      detectedLanguages: [],
      configFiles: [],
    };
  }

  const info: ProjectSetupInfo = {
    workspaceFolders: workspaceFolders.map((f) => f.uri.fsPath),
    detectedLanguages: [],
    configFiles: [],
  };

  // Detect config files using workspace.findFiles
  const configPatterns = [
    "package.json",
    "tsconfig.json",
    "pyproject.toml",
    "Cargo.toml",
    "pubspec.yaml",
    "go.mod",
    ".eslintrc*",
    "vite.config.*",
    "webpack.config.*",
  ];

  for (const pattern of configPatterns) {
    const files = await vscode.workspace.findFiles(
      pattern,
      "**/node_modules/**",
      1,
    );
    if (files.length > 0) {
      info.configFiles.push(files[0].fsPath);
    }
  }

  // Detect languages from file extensions
  const sourceFiles = await vscode.workspace.findFiles(
    "**/*.{ts,js,py,rs,dart,go,java,cs,cpp,c}",
    "**/node_modules/**",
    100,
  );

  const extensions = new Set<string>();
  sourceFiles.forEach((file) => {
    const ext = file.fsPath.split(".").pop();
    if (ext) extensions.add(ext);
  });

  info.detectedLanguages = Array.from(extensions);

  // Detect package manager
  const packageJsonFiles = await vscode.workspace.findFiles(
    "package.json",
    "**/node_modules/**",
    1,
  );
  if (packageJsonFiles.length > 0) {
    const lockFiles = await vscode.workspace.findFiles(
      "{package-lock.json,yarn.lock,pnpm-lock.yaml,bun.lockb}",
      "**/node_modules/**",
      1,
    );
    if (lockFiles.length > 0) {
      const lockFile = lockFiles[0].fsPath;
      if (lockFile.includes("yarn.lock")) info.packageManager = "yarn";
      else if (lockFile.includes("pnpm-lock")) info.packageManager = "pnpm";
      else if (lockFile.includes("bun.lockb")) info.packageManager = "bun";
      else info.packageManager = "npm";
    }
  }

  return info;
}
```

**Key APIs Used**:

- `vscode.workspace.workspaceFolders` - Get open workspace folders
- `vscode.workspace.findFiles()` - Search for files by glob pattern

---

### `vscode/runCommand`

**Purpose**: Execute any VS Code command by ID.

**VS Code API Implementation**:

```typescript
import * as vscode from "vscode";

interface RunCommandInput {
  commandId: string;
  args?: any[];
}

interface RunCommandResult {
  success: boolean;
  result?: any;
  error?: string;
}

async function runCommand(input: RunCommandInput): Promise<RunCommandResult> {
  try {
    // Validate command exists
    const allCommands = await vscode.commands.getCommands(true);
    if (!allCommands.includes(input.commandId)) {
      return {
        success: false,
        error: `Command '${input.commandId}' not found`,
      };
    }

    // Execute the command
    const result = await vscode.commands.executeCommand(
      input.commandId,
      ...(input.args || []),
    );

    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

**Key APIs Used**:

- `vscode.commands.executeCommand()` - Execute any registered command
- `vscode.commands.getCommands()` - List all available commands

**Common Commands**:

```typescript
// Useful built-in commands
const builtInCommands = {
  // Editor
  "vscode.open": "Open a file or URI",
  "vscode.openFolder": "Open a folder as workspace",
  "editor.action.formatDocument": "Format the active document",

  // Search
  "workbench.action.findInFiles": "Open workspace search",
  "workbench.extensions.search": "Search for extensions",

  // Tasks
  "workbench.action.tasks.runTask": "Run a task",
  "workbench.action.tasks.terminate": "Terminate a running task",

  // Git
  "git.commit": "Commit staged changes",
  "git.push": "Push to remote",

  // Context
  setContext: "Set a context key value",
};
```

---

### `vscode/installExtension`

**Purpose**: Install a VS Code extension from the marketplace.

**VS Code API Implementation**:

```typescript
import * as vscode from "vscode";

interface InstallExtensionInput {
  extensionId: string; // format: publisher.extensionName
}

interface InstallExtensionResult {
  success: boolean;
  installed: boolean;
  error?: string;
}

async function installExtension(
  input: InstallExtensionInput,
): Promise<InstallExtensionResult> {
  try {
    // Check if already installed
    const existing = vscode.extensions.getExtension(input.extensionId);
    if (existing) {
      return {
        success: true,
        installed: false, // Already installed
      };
    }

    // Use the built-in command to install
    await vscode.commands.executeCommand(
      "workbench.extensions.installExtension",
      input.extensionId,
    );

    // Verify installation
    // Note: Extension may need reload to be active
    return {
      success: true,
      installed: true,
    };
  } catch (error) {
    return {
      success: false,
      installed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

**Key APIs Used**:

- `vscode.extensions.getExtension()` - Check if extension is installed
- `vscode.extensions.all` - List all installed extensions
- `workbench.extensions.installExtension` command - Install from marketplace

---

### `vscode/newWorkspace`

**Purpose**: Create or open a new workspace.

**VS Code API Implementation**:

```typescript
import * as vscode from "vscode";

interface NewWorkspaceInput {
  folderPath?: string;
  workspaceFilePath?: string;
  addToExisting?: boolean;
}

interface NewWorkspaceResult {
  success: boolean;
  workspaceFolders?: string[];
  error?: string;
}

async function newWorkspace(
  input: NewWorkspaceInput,
): Promise<NewWorkspaceResult> {
  try {
    if (input.workspaceFilePath) {
      // Open a .code-workspace file
      const uri = vscode.Uri.file(input.workspaceFilePath);
      await vscode.commands.executeCommand("vscode.openFolder", uri);

      return {
        success: true,
        workspaceFolders: vscode.workspace.workspaceFolders?.map(
          (f) => f.uri.fsPath,
        ),
      };
    }

    if (input.folderPath) {
      const uri = vscode.Uri.file(input.folderPath);

      if (input.addToExisting && vscode.workspace.workspaceFolders) {
        // Add to existing workspace
        const success = vscode.workspace.updateWorkspaceFolders(
          vscode.workspace.workspaceFolders.length,
          0,
          { uri, name: input.folderPath.split(/[\\/]/).pop() },
        );

        if (!success) {
          return {
            success: false,
            error: "Failed to add folder to workspace",
          };
        }
      } else {
        // Open folder as new workspace
        await vscode.commands.executeCommand("vscode.openFolder", uri);
      }

      return {
        success: true,
        workspaceFolders: vscode.workspace.workspaceFolders?.map(
          (f) => f.uri.fsPath,
        ),
      };
    }

    return {
      success: false,
      error: "Either folderPath or workspaceFilePath must be provided",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

**Key APIs Used**:

- `vscode.commands.executeCommand('vscode.openFolder')` - Open folder/workspace
- `vscode.workspace.updateWorkspaceFolders()` - Modify workspace folders
- `vscode.workspace.workspaceFolders` - Current workspace folders

---

## Execute Category Tools

### `execute/runInTerminal`

**Purpose**: Execute a command in a VS Code terminal with output capture.

**VS Code API Implementation**:

```typescript
import * as vscode from "vscode";

interface RunInTerminalInput {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  terminalName?: string;
  waitForExit?: boolean;
}

interface RunInTerminalResult {
  success: boolean;
  terminalId?: string;
  exitCode?: number;
  output?: string;
  error?: string;
}

async function runInTerminal(
  input: RunInTerminalInput,
): Promise<RunInTerminalResult> {
  // Find or create terminal
  let terminal = vscode.window.terminals.find(
    (t) => t.name === input.terminalName,
  );

  if (!terminal) {
    const options: vscode.TerminalOptions = {
      name: input.terminalName || "Agent Terminal",
      cwd: input.cwd ? vscode.Uri.file(input.cwd) : undefined,
      env: input.env,
    };
    terminal = vscode.window.createTerminal(options);
  }

  terminal.show();

  // If shell integration is available, use it for proper command execution
  if (terminal.shellIntegration) {
    try {
      const execution = terminal.shellIntegration.executeCommand(input.command);

      if (input.waitForExit) {
        // Collect output
        let output = "";
        const stream = execution.read();

        for await (const data of stream) {
          output += data;
        }

        const exitCode = await execution.exitCode;

        return {
          success: exitCode === 0,
          terminalId: terminal.name,
          exitCode: exitCode ?? undefined,
          output,
        };
      }

      return {
        success: true,
        terminalId: terminal.name,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } else {
    // Fallback: Use sendText (no exit code or output capture)
    terminal.sendText(input.command);

    return {
      success: true,
      terminalId: terminal.name,
      output: "Note: Shell integration not available, output not captured",
    };
  }
}
```

**Key APIs Used**:

- `vscode.window.terminals` - All open terminals
- `vscode.window.createTerminal()` - Create new terminal
- `Terminal.shellIntegration` - Shell integration for rich command execution
- `TerminalShellIntegration.executeCommand()` - Execute with exit code tracking
- `TerminalShellExecution.read()` - Stream output
- `TerminalShellExecution.exitCode` - Get exit code
- `Terminal.sendText()` - Fallback for basic execution

---

### `execute/getTerminalOutput`

**Purpose**: Retrieve output from a terminal execution.

**VS Code API Implementation**:

```typescript
import * as vscode from "vscode";

interface GetTerminalOutputInput {
  terminalName?: string;
  executionId?: string;
}

interface GetTerminalOutputResult {
  success: boolean;
  output?: string;
  isComplete?: boolean;
  exitCode?: number;
  error?: string;
}

// Track active executions
const activeExecutions = new Map<
  string,
  {
    execution: vscode.TerminalShellExecution;
    output: string;
    complete: boolean;
    exitCode?: number;
  }
>();

async function getTerminalOutput(
  input: GetTerminalOutputInput,
): Promise<GetTerminalOutputResult> {
  // If execution ID provided, get from tracked executions
  if (input.executionId && activeExecutions.has(input.executionId)) {
    const tracked = activeExecutions.get(input.executionId)!;
    return {
      success: true,
      output: tracked.output,
      isComplete: tracked.complete,
      exitCode: tracked.exitCode,
    };
  }

  // Find terminal by name
  const terminal = vscode.window.terminals.find(
    (t) => t.name === input.terminalName,
  );
  if (!terminal) {
    return {
      success: false,
      error: `Terminal '${input.terminalName}' not found`,
    };
  }

  // Note: Direct output reading requires shell integration
  if (!terminal.shellIntegration) {
    return {
      success: false,
      error: "Shell integration not available for output capture",
    };
  }

  return {
    success: true,
    output: "Use execution ID from runInTerminal for tracked output",
    isComplete: true,
  };
}
```

---

### `execute/runTask`

**Purpose**: Run a VS Code task defined in `tasks.json` or by a task provider.

**VS Code API Implementation**:

```typescript
import * as vscode from "vscode";

interface RunTaskInput {
  taskName?: string;
  taskType?: string;
  taskSource?: string;
}

interface RunTaskResult {
  success: boolean;
  taskExecution?: {
    name: string;
    source: string;
  };
  error?: string;
}

async function runTask(input: RunTaskInput): Promise<RunTaskResult> {
  try {
    // Fetch all available tasks
    const tasks = await vscode.tasks.fetchTasks(
      input.taskType ? { type: input.taskType } : undefined,
    );

    if (tasks.length === 0) {
      return {
        success: false,
        error: "No tasks found",
      };
    }

    // Find matching task
    let targetTask: vscode.Task | undefined;

    if (input.taskName) {
      targetTask = tasks.find((task) => {
        const nameMatch = task.name === input.taskName;
        const sourceMatch =
          !input.taskSource || task.source === input.taskSource;
        return nameMatch && sourceMatch;
      });
    }

    if (!targetTask) {
      return {
        success: false,
        error: `Task '${input.taskName}' not found. Available: ${tasks.map((t) => t.name).join(", ")}`,
      };
    }

    // Execute the task
    const execution = await vscode.tasks.executeTask(targetTask);

    return {
      success: true,
      taskExecution: {
        name: targetTask.name,
        source: targetTask.source,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

**Key APIs Used**:

- `vscode.tasks.fetchTasks()` - Get all available tasks
- `vscode.tasks.executeTask()` - Execute a task
- `vscode.tasks.taskExecutions` - Currently running tasks
- `vscode.tasks.onDidStartTask` - Event when task starts
- `vscode.tasks.onDidEndTask` - Event when task ends

---

### `execute/createAndRunTask`

**Purpose**: Create a task dynamically and execute it.

**VS Code API Implementation**:

```typescript
import * as vscode from "vscode";

interface CreateAndRunTaskInput {
  label: string;
  command: string;
  args?: string[];
  cwd?: string;
  type?: "shell" | "process";
  problemMatcher?: string[];
  isBackground?: boolean;
}

interface CreateAndRunTaskResult {
  success: boolean;
  taskName?: string;
  error?: string;
}

async function createAndRunTask(
  input: CreateAndRunTaskInput,
): Promise<CreateAndRunTaskResult> {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return {
        success: false,
        error: "No workspace folder open",
      };
    }

    const scope = workspaceFolders[0];

    // Create task definition
    const taskDefinition: vscode.TaskDefinition = {
      type: input.type || "shell",
    };

    // Create execution
    let execution: vscode.ShellExecution | vscode.ProcessExecution;

    if (input.type === "process") {
      execution = new vscode.ProcessExecution(input.command, input.args || [], {
        cwd: input.cwd,
      });
    } else {
      const commandLine = input.args
        ? `${input.command} ${input.args.join(" ")}`
        : input.command;

      const options: vscode.ShellExecutionOptions = {};
      if (input.cwd) {
        options.cwd = input.cwd;
      }

      execution = new vscode.ShellExecution(commandLine, options);
    }

    // Create the task
    const task = new vscode.Task(
      taskDefinition,
      scope,
      input.label,
      "agent", // source
      execution,
      input.problemMatcher,
    );

    task.isBackground = input.isBackground || false;
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.New,
    };

    // Execute the task
    const taskExecution = await vscode.tasks.executeTask(task);

    return {
      success: true,
      taskName: task.name,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

**Key APIs Used**:

- `vscode.Task` - Task class constructor
- `vscode.ShellExecution` - Shell command execution
- `vscode.ProcessExecution` - Direct process execution
- `vscode.TaskDefinition` - Task type definition

---

### `execute/runTests`

**Purpose**: Run tests using VS Code's Test API.

**VS Code API Implementation**:

```typescript
import * as vscode from "vscode";

interface RunTestsInput {
  testNames?: string[];
  testFiles?: string[];
  debug?: boolean;
  coverage?: boolean;
}

interface RunTestsResult {
  success: boolean;
  passed: number;
  failed: number;
  skipped: number;
  errors?: string[];
}

async function runTests(input: RunTestsInput): Promise<RunTestsResult> {
  // Option 1: Use built-in test command
  try {
    if (input.coverage) {
      await vscode.commands.executeCommand("testing.runAllWithCoverage");
    } else if (input.debug) {
      await vscode.commands.executeCommand("testing.debugAll");
    } else {
      await vscode.commands.executeCommand("testing.runAll");
    }

    // Note: The actual test results are shown in the Test Explorer
    // Extension would need to implement TestController for direct access

    return {
      success: true,
      passed: 0, // Would come from TestController
      failed: 0,
      skipped: 0,
    };
  } catch (error) {
    return {
      success: false,
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}
```

**For Full Test Control - TestController Implementation**:

```typescript
// Register a test controller for direct test management
const testController = vscode.tests.createTestController(
  "myTests",
  "My Test Controller",
);

// Create run profile
const runProfile = testController.createRunProfile(
  "Run Tests",
  vscode.TestRunProfileKind.Run,
  async (request, token) => {
    const run = testController.createTestRun(request);

    const queue: vscode.TestItem[] = [];
    if (request.include) {
      request.include.forEach((test) => queue.push(test));
    } else {
      testController.items.forEach((test) => queue.push(test));
    }

    while (queue.length > 0 && !token.isCancellationRequested) {
      const test = queue.pop()!;

      if (request.exclude?.includes(test)) continue;

      const start = Date.now();
      try {
        // Execute test logic
        await executeTest(test);
        run.passed(test, Date.now() - start);
      } catch (e) {
        run.failed(test, new vscode.TestMessage(e.message), Date.now() - start);
      }

      test.children.forEach((child) => queue.push(child));
    }

    run.end();
  },
  true, // isDefault
);
```

**Key APIs Used**:

- `vscode.tests.createTestController()` - Create test controller
- `TestController.createRunProfile()` - Create run/debug/coverage profiles
- `TestController.createTestRun()` - Create a test run instance
- `TestRun.passed()`, `TestRun.failed()`, `TestRun.skipped()` - Report results
- `TestRunRequest` - Specifies which tests to run

---

### `execute/testFailure`

**Purpose**: Access test failure information from the last test run.

**VS Code API Implementation**:

```typescript
import * as vscode from "vscode";

interface TestFailure {
  testName: string;
  message: string;
  expected?: string;
  actual?: string;
  stack?: string;
  location?: {
    file: string;
    line: number;
  };
}

interface TestFailureResult {
  failures: TestFailure[];
}

async function getTestFailures(): Promise<TestFailureResult> {
  // This would typically be implemented with a TestController
  // that tracks test results

  // Example: Use the test results view command
  await vscode.commands.executeCommand("testing.openResults");

  // For actual implementation, track failures during test runs:
  // const failures: TestFailure[] = [];
  // run.failed(test, message) would populate this

  return {
    failures: [], // Would be populated by TestController
  };
}
```

---

### `execute/getTaskOutput`

**Purpose**: Get output from a running or completed task.

**VS Code API Implementation**:

```typescript
import * as vscode from "vscode";

interface GetTaskOutputInput {
  taskName: string;
  taskSource?: string;
}

interface GetTaskOutputResult {
  success: boolean;
  output?: string;
  isRunning?: boolean;
  error?: string;
}

// Track task outputs (tasks use terminals internally)
const taskOutputs = new Map<string, string>();

function setupTaskOutputTracking() {
  // Listen for task terminal creation
  vscode.window.onDidOpenTerminal((terminal) => {
    // Task terminals have specific naming patterns
    if (terminal.name.startsWith("Task -")) {
      // Track this terminal's output if shell integration available
      if (terminal.shellIntegration) {
        // Would need to track executions
      }
    }
  });

  vscode.tasks.onDidEndTask((event) => {
    const taskName = event.execution.task.name;
    // Task completed - output would be in associated terminal
  });
}

async function getTaskOutput(
  input: GetTaskOutputInput,
): Promise<GetTaskOutputResult> {
  // Check if task is currently running
  const runningExecution = vscode.tasks.taskExecutions.find(
    (exec) => exec.task.name === input.taskName,
  );

  if (runningExecution) {
    return {
      success: true,
      output: taskOutputs.get(input.taskName) || "",
      isRunning: true,
    };
  }

  // Check stored output
  if (taskOutputs.has(input.taskName)) {
    return {
      success: true,
      output: taskOutputs.get(input.taskName),
      isRunning: false,
    };
  }

  return {
    success: false,
    error: `No output found for task '${input.taskName}'`,
  };
}
```

---

## Read Category Tools

### `read/problems`

**Purpose**: Get diagnostics (errors, warnings) from the Problems panel.

**VS Code API Implementation**:

```typescript
import * as vscode from "vscode";

interface Problem {
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  source?: string;
  file: string;
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  code?: string | number;
}

interface GetProblemsInput {
  filePath?: string;
  severity?: "error" | "warning" | "info" | "hint";
}

interface GetProblemsResult {
  problems: Problem[];
  errorCount: number;
  warningCount: number;
}

function getProblems(input: GetProblemsInput): GetProblemsResult {
  let diagnosticsList: [vscode.Uri, vscode.Diagnostic[]][];

  if (input.filePath) {
    // Get diagnostics for specific file
    const uri = vscode.Uri.file(input.filePath);
    const diagnostics = vscode.languages.getDiagnostics(uri);
    diagnosticsList = [[uri, diagnostics]];
  } else {
    // Get all diagnostics
    diagnosticsList = vscode.languages.getDiagnostics();
  }

  const problems: Problem[] = [];
  let errorCount = 0;
  let warningCount = 0;

  for (const [uri, diagnostics] of diagnosticsList) {
    for (const diagnostic of diagnostics) {
      const severityMap: Record<
        vscode.DiagnosticSeverity,
        "error" | "warning" | "info" | "hint"
      > = {
        [vscode.DiagnosticSeverity.Error]: "error",
        [vscode.DiagnosticSeverity.Warning]: "warning",
        [vscode.DiagnosticSeverity.Information]: "info",
        [vscode.DiagnosticSeverity.Hint]: "hint",
      };

      const severity = severityMap[diagnostic.severity];

      // Apply severity filter if specified
      if (input.severity && severity !== input.severity) continue;

      if (diagnostic.severity === vscode.DiagnosticSeverity.Error) errorCount++;
      if (diagnostic.severity === vscode.DiagnosticSeverity.Warning)
        warningCount++;

      problems.push({
        severity,
        message: diagnostic.message,
        source: diagnostic.source,
        file: uri.fsPath,
        range: {
          startLine: diagnostic.range.start.line + 1, // 1-indexed
          startColumn: diagnostic.range.start.character + 1,
          endLine: diagnostic.range.end.line + 1,
          endColumn: diagnostic.range.end.character + 1,
        },
        code:
          typeof diagnostic.code === "object"
            ? diagnostic.code.value
            : diagnostic.code,
      });
    }
  }

  return {
    problems,
    errorCount,
    warningCount,
  };
}
```

**Key APIs Used**:

- `vscode.languages.getDiagnostics()` - Get all diagnostics
- `vscode.languages.getDiagnostics(uri)` - Get diagnostics for specific file
- `vscode.DiagnosticSeverity` - Error, Warning, Information, Hint

---

### `read/readFile`

**Purpose**: Read file contents from the workspace.

**VS Code API Implementation**:

```typescript
import * as vscode from "vscode";

interface ReadFileInput {
  filePath: string;
  startLine?: number; // 1-indexed
  endLine?: number; // 1-indexed, inclusive
  encoding?: string;
}

interface ReadFileResult {
  success: boolean;
  content?: string;
  totalLines?: number;
  error?: string;
}

async function readFile(input: ReadFileInput): Promise<ReadFileResult> {
  try {
    const uri = vscode.Uri.file(input.filePath);

    // Read file using workspace.fs
    const fileData = await vscode.workspace.fs.readFile(uri);
    const content = new TextDecoder(input.encoding || "utf-8").decode(fileData);

    const lines = content.split(/\r?\n/);
    const totalLines = lines.length;

    // Handle line range extraction
    if (input.startLine !== undefined || input.endLine !== undefined) {
      const start = (input.startLine || 1) - 1; // Convert to 0-indexed
      const end = input.endLine || lines.length;

      const selectedLines = lines.slice(start, end);
      return {
        success: true,
        content: selectedLines.join("\n"),
        totalLines,
      };
    }

    return {
      success: true,
      content,
      totalLines,
    };
  } catch (error) {
    if (error instanceof vscode.FileSystemError) {
      if (error.code === "FileNotFound") {
        return {
          success: false,
          error: `File not found: ${input.filePath}`,
        };
      }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

**Key APIs Used**:

- `vscode.workspace.fs.readFile()` - Read file as Uint8Array
- `TextDecoder` - Decode binary to string
- `vscode.FileSystemError` - Handle file system errors

---

### `read/terminalSelection`

**Purpose**: Get the currently selected text in the active terminal.

**VS Code API Implementation**:

```typescript
import * as vscode from "vscode";

interface TerminalSelectionResult {
  success: boolean;
  selection?: string;
  terminalName?: string;
  error?: string;
}

async function getTerminalSelection(): Promise<TerminalSelectionResult> {
  const activeTerminal = vscode.window.activeTerminal;

  if (!activeTerminal) {
    return {
      success: false,
      error: "No active terminal",
    };
  }

  // Note: Direct selection access requires proposed API
  // Workaround: Use copy command
  try {
    // Store clipboard content
    const previousClipboard = await vscode.env.clipboard.readText();

    // Copy selection to clipboard
    await vscode.commands.executeCommand(
      "workbench.action.terminal.copySelection",
    );

    // Read the selection
    const selection = await vscode.env.clipboard.readText();

    // Restore clipboard if different
    if (selection !== previousClipboard) {
      await vscode.env.clipboard.writeText(previousClipboard);
    }

    return {
      success: true,
      selection,
      terminalName: activeTerminal.name,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

**Alternative with Proposed API**:

```typescript
// Requires: "enabledApiProposals": ["terminalSelection"]
// In extension manifest

async function getTerminalSelectionProposed(): Promise<string | undefined> {
  const activeTerminal = vscode.window.activeTerminal;
  if (!activeTerminal) return undefined;

  // Proposed API
  return activeTerminal.selection;
}
```

---

### `read/terminalLastCommand`

**Purpose**: Get the last command executed in the active terminal.

**VS Code API Implementation**:

```typescript
import * as vscode from "vscode";

interface LastCommandResult {
  success: boolean;
  command?: string;
  exitCode?: number;
  terminalName?: string;
  error?: string;
}

// Track last commands per terminal using shell integration
const lastCommands = new Map<
  string,
  {
    command: string;
    exitCode?: number;
  }
>();

function setupLastCommandTracking() {
  // Track when shell execution ends
  vscode.window.onDidEndTerminalShellExecution((event) => {
    const terminalName = event.terminal.name;
    const commandLine = event.commandLine;

    event.exitCode.then((exitCode) => {
      lastCommands.set(terminalName, {
        command: commandLine,
        exitCode,
      });
    });
  });
}

function getTerminalLastCommand(): LastCommandResult {
  const activeTerminal = vscode.window.activeTerminal;

  if (!activeTerminal) {
    return {
      success: false,
      error: "No active terminal",
    };
  }

  const lastCommand = lastCommands.get(activeTerminal.name);

  if (!lastCommand) {
    return {
      success: false,
      error: "No command history available",
      terminalName: activeTerminal.name,
    };
  }

  return {
    success: true,
    command: lastCommand.command,
    exitCode: lastCommand.exitCode,
    terminalName: activeTerminal.name,
  };
}
```

**Key APIs Used**:

- `vscode.window.onDidEndTerminalShellExecution` - Event when command completes
- `TerminalShellExecution.commandLine` - The executed command
- `TerminalShellExecution.exitCode` - Exit code promise

---

## Edit Tools

See [vscode-agent-tools-research.md](./vscode-agent-tools-research.md) for comprehensive coverage of:

- File editing with `WorkspaceEdit`
- Text document operations
- File creation and deletion
- Notebook editing

---

## Search Tools

### `search`

**Purpose**: Search for files or text in the workspace.

**VS Code API Implementation**:

```typescript
import * as vscode from "vscode";

interface SearchInput {
  query: string;
  type: "files" | "text" | "symbols";
  include?: string; // Glob pattern
  exclude?: string; // Glob pattern
  maxResults?: number;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
}

interface FileSearchResult {
  path: string;
  relativePath: string;
}

interface TextSearchResult {
  file: string;
  line: number;
  column: number;
  match: string;
  lineText: string;
}

interface SymbolSearchResult {
  name: string;
  kind: string;
  file: string;
  range: vscode.Range;
}

type SearchResult =
  | {
      type: "files";
      results: FileSearchResult[];
    }
  | {
      type: "text";
      results: TextSearchResult[];
    }
  | {
      type: "symbols";
      results: SymbolSearchResult[];
    };

async function search(input: SearchInput): Promise<SearchResult> {
  switch (input.type) {
    case "files":
      return searchFiles(input);
    case "text":
      return searchText(input);
    case "symbols":
      return searchSymbols(input);
  }
}

async function searchFiles(
  input: SearchInput,
): Promise<{ type: "files"; results: FileSearchResult[] }> {
  const files = await vscode.workspace.findFiles(
    input.query,
    input.exclude,
    input.maxResults,
  );

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  return {
    type: "files",
    results: files.map((uri) => ({
      path: uri.fsPath,
      relativePath: workspaceFolder
        ? vscode.workspace.asRelativePath(uri)
        : uri.fsPath,
    })),
  };
}

async function searchText(
  input: SearchInput,
): Promise<{ type: "text"; results: TextSearchResult[] }> {
  const results: TextSearchResult[] = [];

  // Use findTextInFiles (requires proposed API in some versions)
  // Or use the built-in search command
  await vscode.commands.executeCommand("workbench.action.findInFiles", {
    query: input.query,
    triggerSearch: true,
    matchCase: input.caseSensitive,
    matchWholeWord: input.wholeWord,
    isRegex: input.useRegex,
    filesToInclude: input.include,
    filesToExclude: input.exclude,
  });

  // Alternative: Manual search implementation
  const files = await vscode.workspace.findFiles(
    input.include || "**/*",
    input.exclude || "**/node_modules/**",
    input.maxResults,
  );

  for (const fileUri of files) {
    try {
      const document = await vscode.workspace.openTextDocument(fileUri);
      const text = document.getText();
      const lines = text.split(/\r?\n/);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let searchIndex = 0;

        while (true) {
          const index = input.caseSensitive
            ? line.indexOf(input.query, searchIndex)
            : line
                .toLowerCase()
                .indexOf(input.query.toLowerCase(), searchIndex);

          if (index === -1) break;

          results.push({
            file: fileUri.fsPath,
            line: i + 1,
            column: index + 1,
            match: input.query,
            lineText: line,
          });

          searchIndex = index + 1;

          if (input.maxResults && results.length >= input.maxResults) {
            return { type: "text", results };
          }
        }
      }
    } catch {
      // Skip files that can't be opened
    }
  }

  return { type: "text", results };
}

async function searchSymbols(
  input: SearchInput,
): Promise<{ type: "symbols"; results: SymbolSearchResult[] }> {
  const symbols = await vscode.commands.executeCommand<
    vscode.SymbolInformation[]
  >("vscode.executeWorkspaceSymbolProvider", input.query);

  const kindNames: Record<vscode.SymbolKind, string> = {
    [vscode.SymbolKind.File]: "File",
    [vscode.SymbolKind.Module]: "Module",
    [vscode.SymbolKind.Namespace]: "Namespace",
    [vscode.SymbolKind.Package]: "Package",
    [vscode.SymbolKind.Class]: "Class",
    [vscode.SymbolKind.Method]: "Method",
    [vscode.SymbolKind.Property]: "Property",
    [vscode.SymbolKind.Field]: "Field",
    [vscode.SymbolKind.Constructor]: "Constructor",
    [vscode.SymbolKind.Enum]: "Enum",
    [vscode.SymbolKind.Interface]: "Interface",
    [vscode.SymbolKind.Function]: "Function",
    [vscode.SymbolKind.Variable]: "Variable",
    [vscode.SymbolKind.Constant]: "Constant",
    [vscode.SymbolKind.String]: "String",
    [vscode.SymbolKind.Number]: "Number",
    [vscode.SymbolKind.Boolean]: "Boolean",
    [vscode.SymbolKind.Array]: "Array",
    [vscode.SymbolKind.Object]: "Object",
    [vscode.SymbolKind.Key]: "Key",
    [vscode.SymbolKind.Null]: "Null",
    [vscode.SymbolKind.EnumMember]: "EnumMember",
    [vscode.SymbolKind.Struct]: "Struct",
    [vscode.SymbolKind.Event]: "Event",
    [vscode.SymbolKind.Operator]: "Operator",
    [vscode.SymbolKind.TypeParameter]: "TypeParameter",
  };

  return {
    type: "symbols",
    results: (symbols || []).slice(0, input.maxResults).map((symbol) => ({
      name: symbol.name,
      kind: kindNames[symbol.kind] || "Unknown",
      file: symbol.location.uri.fsPath,
      range: symbol.location.range,
    })),
  };
}
```

**Key APIs Used**:

- `vscode.workspace.findFiles()` - File pattern search
- `vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider')` - Symbol search
- `vscode.workspace.openTextDocument()` - Open document for text search

---

## Web Tools

### `web/fetch`

**Purpose**: Fetch content from web URLs.

**Implementation**:

```typescript
import * as vscode from "vscode";

interface FetchInput {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

interface FetchResult {
  success: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
  error?: string;
}

async function webFetch(input: FetchInput): Promise<FetchResult> {
  try {
    // Node.js fetch (available in recent Node versions)
    // Or use the extension's http module
    const controller = new AbortController();
    const timeoutId = input.timeout
      ? setTimeout(() => controller.abort(), input.timeout)
      : undefined;

    const response = await fetch(input.url, {
      method: input.method || "GET",
      headers: input.headers,
      body: input.body,
      signal: controller.signal,
    });

    if (timeoutId) clearTimeout(timeoutId);

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const body = await response.text();

    return {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

**Alternative using VS Code's request module**:

```typescript
import * as https from "https";
import * as http from "http";

async function webFetchNode(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;

    client
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}
```

---

## Todo Tools

### `todo`

**Purpose**: Manage a todo list for tracking progress.

**Implementation**:

```typescript
import * as vscode from "vscode";

interface TodoItem {
  id: number;
  title: string;
  description?: string;
  status: "not-started" | "in-progress" | "completed";
  createdAt: Date;
  updatedAt: Date;
}

interface TodoInput {
  operation: "read" | "write" | "update";
  todoList?: TodoItem[];
  itemId?: number;
  updates?: Partial<TodoItem>;
}

interface TodoResult {
  success: boolean;
  todoList?: TodoItem[];
  error?: string;
}

// Store todos in extension context or workspace state
let todos: TodoItem[] = [];

function manageTodoList(
  context: vscode.ExtensionContext,
  input: TodoInput,
): TodoResult {
  switch (input.operation) {
    case "read":
      return {
        success: true,
        todoList: todos,
      };

    case "write":
      if (!input.todoList) {
        return {
          success: false,
          error: "todoList is required for write operation",
        };
      }
      todos = input.todoList;

      // Persist to workspace state
      context.workspaceState.update("agentTodos", todos);

      return {
        success: true,
        todoList: todos,
      };

    case "update":
      if (input.itemId === undefined || !input.updates) {
        return {
          success: false,
          error: "itemId and updates are required for update operation",
        };
      }

      const index = todos.findIndex((t) => t.id === input.itemId);
      if (index === -1) {
        return {
          success: false,
          error: `Todo item ${input.itemId} not found`,
        };
      }

      todos[index] = {
        ...todos[index],
        ...input.updates,
        updatedAt: new Date(),
      };

      context.workspaceState.update("agentTodos", todos);

      return {
        success: true,
        todoList: todos,
      };

    default:
      return {
        success: false,
        error: `Unknown operation: ${input.operation}`,
      };
  }
}

// Initialize from persisted state
function initializeTodos(context: vscode.ExtensionContext) {
  const persisted = context.workspaceState.get<TodoItem[]>("agentTodos");
  if (persisted) {
    todos = persisted;
  }
}
```

---

## MCP Integration Tools

The `orchestra-orc/*`, `orchestra-imp/*`, and `orchestra-ctrl/*` tools are **MCP (Model Context Protocol) tools**, not direct VS Code API calls. These are registered and invoked differently.

### MCP Tool Registration

```typescript
import * as vscode from "vscode";

// MCP tools are typically accessed via an MCP client
interface MCPTool {
  name: string;
  description: string;
  inputSchema: object;
  handler: (input: any) => Promise<any>;
}

// Example: Registering MCP tools as VS Code LM tools
function registerMCPTools(context: vscode.ExtensionContext, mcpClient: any) {
  // Get tools from MCP server
  const mcpTools = mcpClient.listTools();

  for (const tool of mcpTools) {
    // Register as language model tool
    const disposable = vscode.lm.registerTool(tool.name, {
      async invoke(options, token) {
        // Call MCP server
        const result = await mcpClient.callTool(tool.name, options.input);

        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(JSON.stringify(result)),
        ]);
      },
    });

    context.subscriptions.push(disposable);
  }
}
```

### MCP Tool Categories

| Pattern            | Role         | Examples                                                            |
| ------------------ | ------------ | ------------------------------------------------------------------- |
| `orchestra-orc/*`  | Orchestrator | `get_sprint_status`, `prepare_task`, `submit_verification_judgment` |
| `orchestra-imp/*`  | Implementor  | `get_current_task`, `signal_completion`, `get_feedback`             |
| `orchestra-ctrl/*` | Controller   | `get_sprint_status`, `approve_sprint`, `reject_handover`            |

---

## Tool Registration Architecture

### Package.json Contribution

```json
{
  "contributes": {
    "languageModelTools": [
      {
        "name": "vscode_runCommand",
        "tags": ["vscode", "commands"],
        "displayName": "Run VS Code Command",
        "modelDescription": "Execute any VS Code command by ID",
        "icon": "$(terminal)",
        "inputSchema": {
          "type": "object",
          "properties": {
            "commandId": {
              "type": "string",
              "description": "The VS Code command ID to execute"
            },
            "args": {
              "type": "array",
              "description": "Arguments to pass to the command"
            }
          },
          "required": ["commandId"]
        }
      }
    ]
  }
}
```

### Tool Implementation Class

```typescript
import * as vscode from "vscode";

export class RunCommandTool implements vscode.LanguageModelTool<{
  commandId: string;
  args?: any[];
}> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<{
      commandId: string;
      args?: any[];
    }>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const { commandId, args = [] } = options.input;

    try {
      const result = await vscode.commands.executeCommand(commandId, ...args);

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          JSON.stringify({
            success: true,
            result,
          }),
        ),
      ]);
    } catch (error) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
      ]);
    }
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<{
      commandId: string;
      args?: any[];
    }>,
    token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: `Running command: ${options.input.commandId}`,
    };
  }
}
```

### Registration in Extension Activate

```typescript
import * as vscode from "vscode";
import { RunCommandTool } from "./tools/runCommand";
import { ReadFileToolTool } from "./tools/readFile";
import { SearchTool } from "./tools/search";

export function activate(context: vscode.ExtensionContext) {
  // Register all agent tools
  const tools = [
    ["vscode_runCommand", new RunCommandTool()],
    ["read_file", new ReadFileTool()],
    ["search", new SearchTool()],
    // ... more tools
  ] as const;

  for (const [name, tool] of tools) {
    context.subscriptions.push(vscode.lm.registerTool(name, tool));
  }
}
```

---

## Windows-Specific Considerations

### Path Handling

```typescript
import * as vscode from "vscode";
import * as path from "path";

// Always use Uri.file() for path normalization
function normalizePath(inputPath: string): vscode.Uri {
  // Handle both forward and backslashes
  const normalized = path.normalize(inputPath);
  return vscode.Uri.file(normalized);
}

// Windows path examples
const examples = {
  local: "C:\\Users\\user\\project\\file.ts",
  unc: "\\\\server\\share\\file.ts",
  forward: "C:/Users/user/project/file.ts", // Also valid
};
```

### Terminal Shell Detection

```typescript
function getDefaultShell(): string {
  // VS Code typically uses PowerShell on Windows
  const config = vscode.workspace.getConfiguration("terminal.integrated");
  const defaultProfile = config.get<string>("defaultProfile.windows");

  return defaultProfile || "PowerShell";
}

// Create terminal with specific shell
function createPowerShellTerminal(): vscode.Terminal {
  return vscode.window.createTerminal({
    name: "PowerShell",
    shellPath: "pwsh.exe", // PowerShell 7+
    // Or: 'powershell.exe' for Windows PowerShell
  });
}
```

### Environment Variables

```typescript
// Windows environment variables are case-insensitive
function getEnvVar(name: string): string | undefined {
  // Process.env keys are case-insensitive on Windows
  const upperName = name.toUpperCase();

  for (const [key, value] of Object.entries(process.env)) {
    if (key.toUpperCase() === upperName) {
      return value;
    }
  }

  return undefined;
}
```

### Line Endings

```typescript
// Handle CRLF in file content
function normalizeLineEndings(content: string): string {
  // Convert all line endings to LF for consistency
  return content.replace(/\r\n/g, "\n");
}

function preserveLineEndings(content: string, original: string): string {
  // Preserve original line endings
  const hasCRLF = original.includes("\r\n");

  if (hasCRLF) {
    return content.replace(/\n/g, "\r\n");
  }

  return content;
}
```

---

## Implementation Patterns

### Error Handling Pattern

```typescript
import * as vscode from "vscode";

interface ToolResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

async function safeToolExecution<T>(
  operation: () => Promise<T>,
  errorContext: string,
): Promise<ToolResult<T>> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error) {
    if (error instanceof vscode.FileSystemError) {
      return {
        success: false,
        error: {
          code: error.code || "FileSystemError",
          message: error.message,
          details: { name: error.name },
        },
      };
    }

    return {
      success: false,
      error: {
        code: "TOOL_ERROR",
        message: error instanceof Error ? error.message : String(error),
        details: { context: errorContext },
      },
    };
  }
}
```

### Cancellation Support

```typescript
async function toolWithCancellation(
  token: vscode.CancellationToken,
): Promise<void> {
  // Check cancellation before long operations
  if (token.isCancellationRequested) {
    throw new vscode.CancellationError();
  }

  // Register cancellation callback for cleanup
  const cleanup = token.onCancellationRequested(() => {
    // Cleanup resources
  });

  try {
    // Do work...

    // Periodic cancellation checks
    for (const item of items) {
      if (token.isCancellationRequested) {
        throw new vscode.CancellationError();
      }
      await processItem(item);
    }
  } finally {
    cleanup.dispose();
  }
}
```

### Progress Reporting

```typescript
async function toolWithProgress<T>(
  title: string,
  operation: (
    progress: vscode.Progress<{ message?: string; increment?: number }>,
  ) => Promise<T>,
): Promise<T> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title,
      cancellable: true,
    },
    async (progress, token) => {
      return operation(progress);
    },
  );
}

// Usage
await toolWithProgress("Processing files", async (progress) => {
  const files = await getFiles();
  const increment = 100 / files.length;

  for (const file of files) {
    progress.report({ message: `Processing ${file}`, increment });
    await processFile(file);
  }
});
```

---

## Summary

This research document covers all the tools extracted from the Orchestra agent configuration files:

| Category          | Tools                                                                                                           | Primary VS Code APIs                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **vscode/**       | `getProjectSetupInfo`, `runCommand`, `installExtension`, `newWorkspace`                                         | `workspace`, `commands`, `extensions`                  |
| **execute/**      | `runInTerminal`, `getTerminalOutput`, `runTask`, `createAndRunTask`, `runTests`, `testFailure`, `getTaskOutput` | `window.createTerminal`, `Terminal`, `tasks`, `tests`  |
| **read/**         | `problems`, `readFile`, `terminalSelection`, `terminalLastCommand`, `getTaskOutput`                             | `languages.getDiagnostics`, `workspace.fs`, `Terminal` |
| **edit**          | (See main research doc)                                                                                         | `WorkspaceEdit`, `workspace.applyEdit`                 |
| **search**        | File, text, symbol search                                                                                       | `workspace.findFiles`, `commands.executeCommand`       |
| **web/**          | `fetch`                                                                                                         | Node.js `fetch`/`http`                                 |
| **todo**          | Task tracking                                                                                                   | `ExtensionContext.workspaceState`                      |
| **orchestra-\*/** | MCP integration                                                                                                 | `lm.registerTool`, MCP client                          |

Each tool category has specific VS Code APIs and implementation patterns optimized for Windows 32/64-bit environments.
