import { describe, expect, it } from "vitest";
import * as builders from "../../extension/src/prompts/promptTextBuilders.js";

describe("Prompt builders exist", () => {
  it("no longer exports migrated code review builders", () => {
    // These functions have been migrated to Handlebars templates
    expect(
      (builders as Record<string, unknown>).buildCodeReviewFixPromptText,
    ).toBeUndefined();
    expect(
      (builders as Record<string, unknown>).buildCodeReviewFixPreparePromptText,
    ).toBeUndefined();
    expect(
      (builders as Record<string, unknown>).buildCodeReviewFixImplementPromptText,
    ).toBeUndefined();
    expect((builders as Record<string, unknown>).buildCodeReviewPromptText).toBeUndefined();
    expect(
      (builders as Record<string, unknown>).buildCodeReviewReReviewPromptText,
    ).toBeUndefined();
  });
});
