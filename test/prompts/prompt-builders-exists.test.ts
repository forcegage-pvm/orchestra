import { describe, expect, it } from "vitest";
import * as builders from "../../extension/src/prompts/promptTextBuilders.js";

describe("Prompt builders exist", () => {
  it("has remaining code review fix builders", () => {
    expect(typeof builders.buildCodeReviewFixPromptText).toBe("function");
    expect(typeof builders.buildCodeReviewFixPreparePromptText).toBe(
      "function",
    );
    expect(typeof builders.buildCodeReviewFixImplementPromptText).toBe(
      "function",
    );
  });

  it("no longer exports migrated code review builders", () => {
    // These functions have been migrated to Handlebars templates
    expect((builders as Record<string, unknown>).buildCodeReviewPromptText).toBeUndefined();
    expect((builders as Record<string, unknown>).buildCodeReviewReReviewPromptText).toBeUndefined();
  });
});
