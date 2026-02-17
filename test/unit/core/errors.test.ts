/**
 * Error Classes Tests
 *
 * Tests for the Orchestra error hierarchy.
 */

import { describe, expect, it } from "vitest";
import {
  ConfigurationError,
  FileError,
  GitError,
  HandoverError,
  isOrchestraError,
  isValidationError,
  ManifestError,
  OrchestraError,
  TaskError,
  ValidationError,
  wrapError,
} from "../../../src/core/errors.js";

describe("OrchestraError", () => {
  it("should create error with message, code, and context", () => {
    const error = new OrchestraError("Test error", "TEST_ERROR", {
      key: "value",
    });

    expect(error.message).toBe("Test error");
    expect(error.code).toBe("TEST_ERROR");
    expect(error.context).toEqual({ key: "value" });
    expect(error.name).toBe("OrchestraError");
  });

  it("should be instance of Error", () => {
    const error = new OrchestraError("Test", "TEST");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(OrchestraError);
  });

  it("should serialize to JSON", () => {
    const error = new OrchestraError("Test error", "TEST_ERROR", {
      detail: "info",
    });
    const json = error.toJSON();

    expect(json).toEqual({
      name: "OrchestraError",
      code: "TEST_ERROR",
      message: "Test error",
      context: { detail: "info" },
    });
  });

  it("should work without context", () => {
    const error = new OrchestraError("Test", "TEST");
    expect(error.context).toBeUndefined();
  });
});

describe("ConfigurationError", () => {
  it("should have CONFIG_ERROR code", () => {
    const error = new ConfigurationError("Config issue");
    expect(error.code).toBe("CONFIG_ERROR");
    expect(error.name).toBe("ConfigurationError");
  });

  it("should extend OrchestraError", () => {
    const error = new ConfigurationError("Config issue");
    expect(error).toBeInstanceOf(OrchestraError);
    expect(error).toBeInstanceOf(ConfigurationError);
  });
});

describe("ManifestError", () => {
  it("should have MANIFEST_ERROR code", () => {
    const error = new ManifestError("Manifest issue");
    expect(error.code).toBe("MANIFEST_ERROR");
    expect(error.name).toBe("ManifestError");
  });

  it("should extend OrchestraError", () => {
    const error = new ManifestError("Manifest issue");
    expect(error).toBeInstanceOf(OrchestraError);
  });
});

describe("TaskError", () => {
  it("should have TASK_ERROR code", () => {
    const error = new TaskError("Task issue");
    expect(error.code).toBe("TASK_ERROR");
    expect(error.name).toBe("TaskError");
  });
});

describe("FileError", () => {
  it("should have FILE_ERROR code", () => {
    const error = new FileError("File issue");
    expect(error.code).toBe("FILE_ERROR");
    expect(error.name).toBe("FileError");
  });
});

describe("ValidationError", () => {
  it("should have VALIDATION_ERROR code and errors array", () => {
    const errors = [
      { path: "field1", message: "Required" },
      { path: "field2", message: "Invalid" },
    ];
    const error = new ValidationError("Validation failed", errors);

    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.name).toBe("ValidationError");
    expect(error.errors).toEqual(errors);
  });

  it("should include errors in JSON serialization", () => {
    const errors = [{ path: "test", message: "error" }];
    const error = new ValidationError("Failed", errors);
    const json = error.toJSON();

    expect(json.errors).toEqual(errors);
  });
});

describe("GitError", () => {
  it("should have GIT_ERROR code", () => {
    const error = new GitError("Git issue");
    expect(error.code).toBe("GIT_ERROR");
    expect(error.name).toBe("GitError");
  });
});

describe("HandoverError", () => {
  it("should have HANDOVER_ERROR code", () => {
    const error = new HandoverError("Handover issue");
    expect(error.code).toBe("HANDOVER_ERROR");
    expect(error.name).toBe("HandoverError");
  });
});

describe("isOrchestraError", () => {
  it("should return true for OrchestraError instances", () => {
    expect(isOrchestraError(new OrchestraError("Test", "TEST"))).toBe(true);
    expect(isOrchestraError(new ConfigurationError("Test"))).toBe(true);
    expect(isOrchestraError(new ManifestError("Test"))).toBe(true);
  });

  it("should return false for non-OrchestraError", () => {
    expect(isOrchestraError(new Error("Test"))).toBe(false);
    expect(isOrchestraError("string error")).toBe(false);
    expect(isOrchestraError(null)).toBe(false);
    expect(isOrchestraError(undefined)).toBe(false);
  });
});

describe("isValidationError", () => {
  it("should return true for ValidationError instances", () => {
    expect(isValidationError(new ValidationError("Test", []))).toBe(true);
  });

  it("should return false for other errors", () => {
    expect(isValidationError(new OrchestraError("Test", "TEST"))).toBe(false);
    expect(isValidationError(new Error("Test"))).toBe(false);
  });
});

describe("wrapError", () => {
  it("should return OrchestraError as-is", () => {
    const original = new ManifestError("Test");
    const wrapped = wrapError(original);
    expect(wrapped).toBe(original);
  });

  it("should wrap regular Error", () => {
    const original = new Error("Regular error");
    const wrapped = wrapError(original, "CUSTOM_CODE");

    expect(wrapped).toBeInstanceOf(OrchestraError);
    expect(wrapped.message).toBe("Regular error");
    expect(wrapped.code).toBe("CUSTOM_CODE");
    expect(wrapped.context?.originalError).toBe("Error");
  });

  it("should wrap string", () => {
    const wrapped = wrapError("String error");
    expect(wrapped).toBeInstanceOf(OrchestraError);
    expect(wrapped.message).toBe("String error");
    expect(wrapped.code).toBe("UNKNOWN_ERROR");
  });

  it("should wrap other values", () => {
    const wrapped = wrapError(42);
    expect(wrapped.message).toBe("42");
  });
});
