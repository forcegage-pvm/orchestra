import { DartRunner } from "./DartRunner.js";
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
        return new DartRunner("dart");
      case "flutter":
        return new DartRunner("flutter");
      default:
        return assertNever(framework);
    }
  }
}