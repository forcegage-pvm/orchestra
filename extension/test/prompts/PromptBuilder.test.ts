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

  it("should call TemplateLoader.render for single task code review prompt", () => {
    const render = vi.fn().mockReturnValue("code review output");
    const templateLoader = { render } as TemplateLoader;
    const builder = new PromptBuilder({ templateLoader });

    const result = builder.buildCodeReviewPrompt(
      1,
      "sprint-001",
      "Sample Sprint",
      { taskId: 4, title: "Sample Task", dbId: 100 },
    );

    expect(render).toHaveBeenCalledWith("code-review", {
      sprint: { sprint_id: "sprint-001", title: "Sample Sprint" },
      task: { task_id: 4, title: "Sample Task" },
    });
    expect(result).toBe("code review output");
  });

  it("should call TemplateLoader.render for bulk code review prompt when no taskInfo", () => {
    const render = vi.fn().mockReturnValue("bulk code review output");
    const templateLoader = { render } as TemplateLoader;
    const builder = new PromptBuilder({ templateLoader });

    const result = builder.buildCodeReviewPrompt(
      5,
      "sprint-001",
      "Sample Sprint",
    );

    expect(render).toHaveBeenCalledWith("code-review-bulk", {
      pendingCount: 5,
      sprint: { sprint_id: "sprint-001", title: "Sample Sprint" },
    });
    expect(result).toBe("bulk code review output");
  });

  it("should call TemplateLoader.render for code review re-review prompt", () => {
    const render = vi.fn().mockReturnValue("re-review output");
    const templateLoader = { render } as TemplateLoader;
    const builder = new PromptBuilder({ templateLoader });

    const result = builder.buildCodeReviewReReviewPrompt(
      "sprint-001",
      "Sample Sprint",
      { taskId: 4, title: "Sample Task", dbId: 100 },
      7,
    );

    expect(render).toHaveBeenCalledWith("code-review-re-review", {
      sprint: { sprint_id: "sprint-001", title: "Sample Sprint" },
      task: { task_id: 4, title: "Sample Task" },
      codeReview: { reviewId: 7 },
    });
    expect(result).toBe("re-review output");
  });

  it("should call TemplateLoader.render for code review fix prompt (openIssueCount)", () => {
    const render = vi.fn().mockReturnValue("code review fix output");
    const templateLoader = { render } as TemplateLoader;
    const builder = new PromptBuilder({ templateLoader });

    const result = builder.buildCodeReviewFixPrompt(3, "sprint-002", "Sprint Two");

    expect(render).toHaveBeenCalledWith("code-review-fix", {
      openIssueCount: 3,
      sprint: { sprint_id: "sprint-002", title: "Sprint Two" },
    });
    expect(result).toBe("code review fix output");
  });

  it("should format status and include summary for code review fix prepare prompt", () => {
    const render = vi.fn().mockReturnValue("code review fix prepare output");
    const templateLoader = { render } as TemplateLoader;
    const builder = new PromptBuilder({ templateLoader });

    const context: PromptContext = { ...baseContext } as any;
    const review = { status: "CHANGES_REQUESTED", summary: "Please fix X" } as any;

    const result = builder.buildCodeReviewFixPreparePrompt(context, review);

    expect(render).toHaveBeenCalledWith("code-review-fix-prepare", expect.objectContaining({
      ...context,
      codeReview: { status: "Changes requested", summary: "Please fix X" },    }));
    expect(result).toBe("code review fix prepare output");
  });

  it("should format status and omit summary when not provided for code review fix implement prompt", () => {
    const render = vi.fn().mockReturnValue("code review fix implement output");
    const templateLoader = { render } as TemplateLoader;
    const builder = new PromptBuilder({ templateLoader });

    const context: PromptContext = { ...baseContext } as any;
    const review = { status: "APPROVED" } as any;

    const result = builder.buildCodeReviewFixImplementPrompt(context, review);

    expect(render).toHaveBeenCalledWith("code-review-fix-implement", expect.objectContaining({
      ...context,
      codeReview: { status: "Approved" },    }));
    expect(result).toBe("code review fix implement output");
  });

  it("should return rendered coding standards when template exists", () => {
    const render = vi.fn().mockReturnValue("coding standards output");
    const templateLoader = { render } as TemplateLoader;
    const builder = new PromptBuilder({ templateLoader });

    const result = builder.buildCodingStandardsPrompt();

    expect(render).toHaveBeenCalledWith("coding-standards", {});
    expect(result).toBe("coding standards output");
  });

  it("should return null when coding-standards template does not exist", () => {
    const render = vi.fn().mockImplementation(() => {
      throw new Error('Template not found: "coding-standards"');
    });
    const templateLoader = { render } as TemplateLoader;
    const builder = new PromptBuilder({ templateLoader });

    const result = builder.buildCodingStandardsPrompt();

    expect(render).toHaveBeenCalledWith("coding-standards", {});
    expect(result).toBeNull();
  });
});