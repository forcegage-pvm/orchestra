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
    try {
      validateTitle("");
      throw new Error("Expected ValidationError");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toBe("Title is required");
      expect(e.field).toBe("title");
      expect(e.value).toBe("");
    }
  });

  it("rejects whitespace-only titles", () => {
    const input = "   ";
    try {
      validateTitle(input);
      throw new Error("Expected ValidationError");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toBe("Title is required");
      expect(e.field).toBe("title");
      expect(e.value).toBe(input);
    }
  });

  it("rejects titles longer than 100 characters", () => {
    const longTitle = "a".repeat(101);

    try {
      validateTitle(longTitle);
      throw new Error("Expected ValidationError");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toBe("Title must be 100 characters or less");
      expect(e.field).toBe("title");
      expect(e.value).toBe(longTitle);
    }
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

    try {
      validateDescription(longDescription);
      throw new Error("Expected ValidationError");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toBe("Description must be at most 1000 characters.");
      expect(e.field).toBe("description");
      expect(e.value).toBe(longDescription);
    }
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

    try {
      validateTags([longTag]);
      throw new Error("Expected ValidationError");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toBe("Tags must be 30 characters or less");
      expect(e.field).toBe("tags");
      expect(e.value).toEqual([longTag]);
    }
  });

  it("rejects empty tags after trimming", () => {
    const tags = ["  "];
    try {
      validateTags(tags);
      throw new Error("Expected ValidationError");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toBe("Tags cannot be empty.");
      expect(e.field).toBe("tags");
      expect(e.value).toEqual(tags);
    }
  });

  it("rejects more than 10 tags", () => {
    const tags = Array.from({ length: 11 }, (_, index) => `tag-${index + 1}`);

    try {
      validateTags(tags);
      throw new Error("Expected ValidationError");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toBe("Maximum 10 tags allowed");
      expect(e.field).toBe("tags");
      expect(e.value).toEqual(tags);
    }
  });

  it("is case-sensitive when deduping", () => {
    expect(validateTags(["Tag", "tag"])).toEqual(["Tag", "tag"]);
  });
});

describe("validateDueDate", () => {
  it("returns null for null input", () => {
    expect(validateDueDate(null)).toBeNull();
  });

  it("accepts future due dates (deterministic)", () => {
    // Use explicit fixed date: 2025-01-10
    const futureDate = new Date("3000-01-10T00:00:00.000Z");

    expect(validateDueDate(futureDate)).toBe(futureDate);
  });

  it("rejects past due dates (deterministic)", () => {
    // Choose a date known to be in the past: 2000-01-01
    const pastDate = new Date("2000-01-01T00:00:00.000Z");

    try {
      validateDueDate(pastDate);
      throw new Error("Expected ValidationError");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toBe("Due date cannot be in the past");
      expect(e.field).toBe("dueDate");
      expect(e.value).toBe(pastDate);
    }
  });

  it("rejects invalid dates", () => {
    const invalidDate = new Date("invalid");

    try {
      validateDueDate(invalidDate);
      throw new Error("Expected ValidationError");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toBe("Invalid date");
      expect(e.field).toBe("dueDate");
      expect(e.value).toBe(invalidDate);
    }
  });
});

describe("validateCreateInput", () => {
  it("applies defaults and validates fields", () => {
    const input = {
      title: "  Build prototype  ",
      tags: [" ui ", "ui", "backend"],
      description: undefined,
      priority: undefined,
      dueDate: undefined,
    } as unknown as {
      title: string;
      tags?: string[];
      description?: string;
      priority?: Priority;
      dueDate?: Date | null;
    };

    expect(validateCreateInput(input)).toEqual({
      title: "Build prototype",
      description: "",
      priority: Priority.MEDIUM,
      dueDate: null,
      tags: ["ui", "backend"],
    });
  });

  it("validates all fields together and rejects invalid priority", () => {
    const input = {
      title: "Task",
      description: "Desc",
      priority: 9,
      dueDate: new Date("2025-01-01T00:00:00.000Z"),
      tags: ["a"],
    } as unknown as {
      title: string;
      description?: string;
      priority?: number;
      dueDate?: Date | null;
      tags?: string[];
    };

    try {
      validateCreateInput(input as any);
      throw new Error("Expected ValidationError");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toBe("Priority must be a valid value.");
      expect(e.field).toBe("priority");
      expect(e.value).toBe(input);
    }
  });
});

describe("validateUpdateInput", () => {
  it("validates only provided fields", () => {
    const input = {
      description: "Updated",
      status: TaskStatus.IN_PROGRESS,
    } as const;

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

    try {
      validateUpdateInput(input);
      throw new Error("Expected ValidationError");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toBe("Status must be a valid value.");
      expect(e.field).toBe("status");
      expect(e.value).toBe(input);
    }
  });

  it("validates provided dueDate deterministically", () => {
    const input = { dueDate: new Date("3000-02-02T00:00:00.000Z") } as const;

    expect(validateUpdateInput(input)).toEqual({ dueDate: input.dueDate });
  });
});
