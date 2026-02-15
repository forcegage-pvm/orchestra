import { VitestRunner } from "./VitestRunner.js";
import type { TestFramework, TestRunner } from "./TestRunner.js";

function assertNever(value: never): never {
  throw new Error(`Unsupported test framework: ${String(value)}`);
}

/**
 * Factory for constructing test runners.
 */
export class TestRunnerFactory {
  static create(framework: TestFramework): TestRunner {
    switch (framework) {
      case "vitest":
        return new VitestRunner();
      case "dart":
      case "flutter":
        throw new Error(`Unsupported test framework: ${framework}`);
      default:
        return assertNever(framework);
    }
  }
}
