import { describe, expect, it } from "vitest";

import { ValidationError } from "./errors";
import { Priority, TaskStatus } from "./types";
import {
  validateCreateInput,
  validateDescription,
  validateDueDate,
  validateTags,
  validateTitle,
  validateUpdateInput,
} from "./validator";

describe("validateTitle", () => {
  it("trims whitespace", () => {
    expect(validateTitle("  Plan roadmap  ")).toBe("Plan roadmap");
  });

  it("rejects empty titles", () => {
    expect(() => validateTitle("")).toThrowError(
      new ValidationError("Title is required.", "title", "")
    );
  });

  it("rejects whitespace-only titles", () => {
    expect(() => validateTitle("   ")).toThrowError(
      new ValidationError("Title is required.", "title", "   ")
    );
  });

  it("rejects titles longer than 100 characters", () => {
    const longTitle = "a".repeat(101);

    expect(() => validateTitle(longTitle)).toThrowError(
      new ValidationError("Title must be at most 100 characters.", "title", longTitle)
    );
  });

  it("accepts title at max length", () => {
    const maxTitle = "a".repeat(100);

    expect(validateTitle(maxTitle)).toBe(maxTitle);
  });
});

describe("validateDescription", () => {
  it("allows empty description", () => {
    expect(validateDescription("")).toBe("");
  });

  it("preserves description text", () => {
    expect(validateDescription("Keep original text")).toBe(
      "Keep original text"
    );
  });

  it("accepts description at max length", () => {
    const maxDescription = "d".repeat(1000);

    expect(validateDescription(maxDescription)).toBe(maxDescription);
  });

  it("rejects descriptions longer than 1000 characters", () => {
    const longDescription = "d".repeat(1001);

    expect(() => validateDescription(longDescription)).toThrowError(
      new ValidationError(
        "Description must be at most 1000 characters.",
        "description",
        longDescription
      )
    );
  });
});

describe("validateTags", () => {
  it("returns empty array for empty input", () => {
    expect(validateTags(undefined)).toEqual([]);
    expect(validateTags(null)).toEqual([]);
    expect(validateTags([])).toEqual([]);
  });

  it("trims tags and removes duplicates", () => {
    expect(validateTags(["  alpha ", "beta", "alpha", "beta "])).toEqual([
      "alpha",
      "beta",
    ]);
  });

  it("rejects tags longer than 30 characters", () => {
    const longTag = "t".repeat(31);

    expect(() => validateTags([longTag])).toThrowError(
      new ValidationError("Tags must be at most 30 characters.", "tags", [longTag])
    );
  });

  it("rejects empty tags after trimming", () => {
    expect(() => validateTags(["  "])).toThrowError(
      new ValidationError("Tags cannot be empty.", "tags", ["  "])
    );
  });

  it("rejects more than 10 tags", () => {
    const tags = Array.from({ length: 11 }, (_, index) => `tag-${index + 1}`);

    expect(() => validateTags(tags)).toThrowError(
      new ValidationError("Tags must not exceed 10.", "tags", tags)
    );
  });
});

describe("validateDueDate", () => {
  it("returns null for null input", () => {
    expect(validateDueDate(null)).toBeNull();
  });

  it("accepts future due dates", () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);

    expect(validateDueDate(futureDate)).toBe(futureDate);
  });

  it("rejects past due dates", () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);

    expect(() => validateDueDate(pastDate)).toThrowError(
      new ValidationError("Due date must be today or in the future.", "dueDate", pastDate)
    );
  });

  it("rejects invalid dates", () => {
    const invalidDate = new Date("invalid");

    expect(() => validateDueDate(invalidDate)).toThrowError(
      new ValidationError("Due date must be a valid date.", "dueDate", invalidDate)
    );
  });
});

describe("validateCreateInput", () => {
  it("applies defaults and validates fields", () => {
    const input = {
      title: "  Build prototype  ",
      tags: [" ui ", "ui", "backend"],
    };

    expect(validateCreateInput(input)).toEqual({
      title: "Build prototype",
      description: "",
      priority: Priority.MEDIUM,
      dueDate: null,
      tags: ["ui", "backend"],
    });
  });

  it("rejects invalid priority", () => {
    const input = { title: "Task", priority: 9 } as unknown as {
      title: string;
      priority: number;
    };

    expect(() => validateCreateInput(input)).toThrowError(
      new ValidationError("Priority must be a valid value.", "priority", input)
    );
  });
});

describe("validateUpdateInput", () => {
  it("validates only provided fields", () => {
    const input = {
      description: "Updated",
      status: TaskStatus.IN_PROGRESS,
    };

    expect(validateUpdateInput(input)).toEqual({
      description: "Updated",
      status: TaskStatus.IN_PROGRESS,
    });
  });

  it("returns empty object when no fields provided", () => {
    expect(validateUpdateInput({})).toEqual({});
  });

  it("rejects invalid status", () => {
    const input = { status: "DONE" } as unknown as { status: TaskStatus };

    expect(() => validateUpdateInput(input)).toThrowError(
      new ValidationError("Status must be a valid value.", "status", input)
    );
  });
});
