/**
 * Tests for PromptBuilder
 *
 * Verifies that PromptBuilder delegates template-based prompts
 * to TemplateLoader.render with the correct template names.
 */

import { describe, expect, it, vi } from "vitest";
import { PromptBuilder } from "../../src/prompts/PromptBuilder.js";
import type { PromptContext, SprintReviewContext } from "../../src/prompts/promptTypes.js";
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

  it("should call TemplateLoader.render for sprint review prompt", () => {
    const render = vi.fn().mockReturnValue("sprint review output");
    const templateLoader = { render } as TemplateLoader;
    const builder = new PromptBuilder({ templateLoader });

    const sprintReviewContext: SprintReviewContext = {
      sprint: {
        sprint_id: "sprint-001",
        title: "Sample Sprint",
      },
      reviewAttempt: 1,
    };

    const result = builder.buildSprintReviewPrompt(sprintReviewContext);

    expect(render).toHaveBeenCalledWith("sprint-review", sprintReviewContext);
    expect(result).toBe("sprint review output");
  });

  it("should call TemplateLoader.render for handover review prompt", () => {
    const render = vi.fn().mockReturnValue("handover review output");
    const templateLoader = { render } as TemplateLoader;
    const builder = new PromptBuilder({ templateLoader });

    const handoverReviewContext: PromptContext = {
      ...baseContext,
      reviewAttempt: 2,
    };

    const result = builder.buildHandoverReviewPrompt(handoverReviewContext);

    expect(render).toHaveBeenCalledWith("handover-review", handoverReviewContext);
    expect(result).toBe("handover review output");
  });

  it("should call TemplateLoader.render for handover fix prompt", () => {
    const render = vi.fn().mockReturnValue("handover fix output");
    const templateLoader = { render } as TemplateLoader;
    const builder = new PromptBuilder({ templateLoader });

    const handoverFixContext = {
      ...baseContext,
      rejection: {
        issues: "Some issues found",
        recommendations: "Fix things",
        revision_count: 1,
      },
    };

    const result = builder.buildHandoverFixPrompt(handoverFixContext);

    expect(render).toHaveBeenCalledWith("handover-fix", handoverFixContext);
    expect(result).toBe("handover fix output");
  });
});