/**
 * Tests for PromptBuilder
 *
 * Verifies that PromptBuilder delegates template-based prompts
 * to TemplateLoader.render with the correct template names.
 */

import { describe, expect, it, vi } from "vitest";
import { PromptBuilder } from "../../src/prompts/PromptBuilder.js";
import type { PromptContext } from "../../src/prompts/promptTypes.js";
import type { TemplateLoader } from "../../src/prompts/TemplateLoader.js";

const baseContext: PromptContext = {
  task: {
    task_id: 4,
    title: "Sample Task",
    description: "Sample description",
  },
  sprint: {
    sprint_id: "sprint-001",
    title: "Sample Sprint",
  },
};

describe("PromptBuilder", () => {
  it("should call TemplateLoader.render for prepare prompt", () => {
    const render = vi.fn().mockReturnValue("prepare output");
    const templateLoader = { render } as TemplateLoader;
    const builder = new PromptBuilder({ templateLoader });

    const result = builder.buildPreparePrompt(baseContext);

    expect(render).toHaveBeenCalledWith("prepare", baseContext);
    expect(result).toBe("prepare output");
  });

  it("should call TemplateLoader.render for implement prompt", () => {
    const render = vi.fn().mockReturnValue("implement output");
    const templateLoader = { render } as TemplateLoader;
    const builder = new PromptBuilder({ templateLoader });

    const result = builder.buildImplementPrompt(baseContext);

    expect(render).toHaveBeenCalledWith("implement", baseContext);
    expect(result).toBe("implement output");
  });

  it("should call TemplateLoader.render for verify prompt", () => {
    const render = vi.fn().mockReturnValue("verify output");
    const templateLoader = { render } as TemplateLoader;
    const builder = new PromptBuilder({ templateLoader });

    const result = builder.buildVerifyPrompt(baseContext);

    expect(render).toHaveBeenCalledWith("verify", baseContext);
    expect(result).toBe("verify output");
  });

  it("should call TemplateLoader.render for retry prompt", () => {
    const render = vi.fn().mockReturnValue("retry output");
    const templateLoader = { render } as TemplateLoader;
    const builder = new PromptBuilder({ templateLoader });

    const retryContext = {
      ...baseContext,
      retryCount: 2,
      maxRetries: 3,
    };

    const result = builder.buildRetryPrompt(retryContext);

    expect(render).toHaveBeenCalledWith("retry", retryContext);
    expect(result).toBe("retry output");
  });
});