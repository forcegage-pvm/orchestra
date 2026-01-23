/**
 * Default sprint environment configuration for tests
 *
 * Since Sprint 006, environment configuration is REQUIRED for all sprints.
 * This utility provides standard test fixtures for environment config.
 */

/**
 * Default TypeScript/Node.js environment for tests
 */
export const defaultTestEnvironment = {
  test_command: "npm test",
  test_file_pattern: "test/**/*.test.ts",
  source_base_dir: ".",
};

/**
 * Extension environment (for monorepo projects with extension/ subdirectory)
 */
export const extensionTestEnvironment = {
  test_command: "npm test",
  test_file_pattern: "extension/test/**/*.test.ts",
  source_base_dir: "extension",
};

/**
 * Dart/Flutter environment for tests
 */
export const dartTestEnvironment = {
  test_command: "flutter test",
  test_file_pattern: "test/**/*_test.dart",
  source_base_dir: ".",
};

/**
 * Python environment for tests
 */
export const pythonTestEnvironment = {
  test_command: "pytest",
  test_file_pattern: "tests/**/*.py",
  source_base_dir: ".",
};
