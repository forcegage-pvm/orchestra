/**
 * Mock for VS Code API
 */

export class ThemeColor {
  constructor(public id: string) {}
}

export class Uri {
  static file(path: string): Uri {
    return new Uri("file", "", path, "", "");
  }

  static parse(value: string): Uri {
    return new Uri("", "", "", "", "");
  }

  private constructor(
    public scheme: string,
    public authority: string,
    public path: string,
    public query: string,
    public fragment: string,
  ) {}
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
}

export const window = {
  createWebviewPanel: vi.fn(),
  showErrorMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  createOutputChannel: vi.fn(() => ({
    append: vi.fn(),
    appendLine: vi.fn(),
    clear: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  })),
  terminals: [],
  createTerminal: vi.fn(() => ({
    name: "Mock Terminal",
    shellIntegration: undefined, // No shell integration in tests
    show: vi.fn(),
    dispose: vi.fn(),
    sendText: vi.fn(),
  })),
  onDidEndTerminalShellExecution: vi.fn(() => ({ dispose: vi.fn() })),
};

export const commands = {
  registerCommand: vi.fn(),
  executeCommand: vi.fn(),
};

export const workspace = {
  workspaceFolders: [],
  getConfiguration: vi.fn(() => ({
    get: vi.fn(),
    update: vi.fn(),
  })),
};
