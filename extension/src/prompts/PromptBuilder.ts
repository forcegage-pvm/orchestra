/**
 * PromptBuilder - Generates structured prompts for workflow stages.
 */

import { TemplateLoader } from "./TemplateLoader.js";
import type {
  CodeReviewContext,
  PromptContext,
  SprintReviewContext,
  SystemPromptContext,
} from "./promptTypes.js";
export type {
  CodeReviewContext,
  PromptContext,
  Sprint,
  SprintReviewContext,
  SystemPromptContext,
  Task,
} from "./promptTypes.js";

export interface PromptBuilderOptions {
  /** Absolute path to workspace root for template loading */
  workspaceRoot?: string;
  /** Optional template loader override (useful for tests) */
  templateLoader?: TemplateLoader;
  /** If true, bypass template cache for development */
  devMode?: boolean;
}

/**
 * PromptBuilder generates structured prompts for each workflow stage
 */
export class PromptBuilder {
  private readonly templateLoader: TemplateLoader;

  constructor(options: PromptBuilderOptions = {}) {
    const workspaceRoot = options.workspaceRoot ?? process.cwd();
    this.templateLoader =
      options.templateLoader ??
      new TemplateLoader(
        options.devMode !== undefined
          ? { workspaceRoot, devMode: options.devMode }
          : { workspaceRoot },
      );
  }

  /**
   * Build a PREPARE stage prompt for the orchestrator
   */
  buildPreparePrompt(context: PromptContext): string {
    return this.templateLoader.render("prepare", context);
  }

  /**
   * Build an IMPLEMENT stage prompt for the implementor
   */
  buildImplementPrompt(context: PromptContext): string {
    return this.templateLoader.render("implement", context);
  }

  /**
   * Build a VERIFY stage prompt for the orchestrator
   */
  buildVerifyPrompt(context: PromptContext): string {
    return this.templateLoader.render("verify", context);
  }

  /**
   * Build a RETRY stage prompt for the implementor
   */
  buildRetryPrompt(context: PromptContext): string {
    return this.templateLoader.render("retry", context);
  }

  /**
   * Build a SPRINT_REVIEW prompt for the controller
   */
  buildSprintReviewPrompt(context: SprintReviewContext): string {
    return this.templateLoader.render("sprint-review", context);
  }
  /**
   * Build a HANDOVER_REVIEW prompt for the controller
   */
  buildHandoverReviewPrompt(context: PromptContext): string {
    return this.templateLoader.render("handover-review", context);
  }
  /**
   * Build a HANDOVER_FIX prompt for the orchestrator
   */
  buildHandoverFixPrompt(
    context: PromptContext & {
      rejection?: {
        issues: unknown;
        recommendations: unknown;
        revision_count: number;
      };
    },
  ): string {
    return this.templateLoader.render("handover-fix", context);
  }

  /**
   * Build a CODE_REVIEW prompt for the controller
   */
  buildCodeReviewPrompt(
    pendingCount: number,
    sprintId: string,
    sprintTitle: string,
    taskInfo?: { taskId: number; title: string; dbId: number },
  ): string {
    if (taskInfo !== undefined) {
      // Single task code review
      const context = {
        sprint: { sprint_id: sprintId, title: sprintTitle },
        task: { task_id: taskInfo.taskId, title: taskInfo.title },
      };
      return this.templateLoader.render("code-review", context);
    }

    // Bulk code review
    const context = {
      pendingCount,
      sprint: { sprint_id: sprintId, title: sprintTitle },
    };
    return this.templateLoader.render("code-review-bulk", context);
  }
  /**
   * Build a CODE_REVIEW_RE_REVIEW prompt for the controller
   */
  buildCodeReviewReReviewPrompt(
    sprintId: string,
    sprintTitle: string,
    taskInfo: { taskId: number; title: string; dbId: number },
    reviewId: number,
  ): string {
    const context = {
      sprint: { sprint_id: sprintId, title: sprintTitle },
      task: { task_id: taskInfo.taskId, title: taskInfo.title },
      codeReview: { reviewId },
    };

    return this.templateLoader.render("code-review-re-review", context);
  }
  /**
   * Build a CODE_REVIEW_FIX prompt for the implementor
   */
  buildCodeReviewFixPrompt(
    openIssueCount: number,
    sprintId: string,
    sprintTitle: string,
  ): string {
    const context = {
      openIssueCount,
      sprint: { sprint_id: sprintId, title: sprintTitle },
    };
    return this.templateLoader.render("code-review-fix", context);
  }

  /**
   * Build a CODE_REVIEW_FIX_PREPARE prompt for the orchestrator
   */
  buildCodeReviewFixPreparePrompt(
    context: PromptContext,
    review: CodeReviewContext,
  ): string {
    const formattedStatus = (() => {
      const withSpaces = review.status.replace(/_/g, " ").toLowerCase();
      return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
    })();
    const codeReview = {
      status: formattedStatus,
      ...(review.summary ? { summary: review.summary } : {}),
    };
    const renderContext = {
      ...context,
      codeReview,
    };
    return this.templateLoader.render("code-review-fix-prepare", renderContext);
  }

  /**
   * Build system prompt for agent from role-specific template
   *
   * Renders system-{role}.hbs template with context about available tools,
   * workspace, and platform information. Provides focused, attention-optimized
   * system prompts instead of raw .agent.md files.
   *
   * @param context - System prompt context with role, tools, and environment info
   * @returns Rendered system prompt or null if template doesn't exist
   */
  renderSystemPrompt(context: SystemPromptContext): string | null {
    const templateName = `system-${context.role}`;

    try {
      return this.templateLoader.render(templateName, context);
    } catch {
      // Template not found - fall back to .agent.md file
      return null;
    }
  }

  /**
   * Build coding standards prompt for injection into all agents.
   * Returns null if no coding-standards template exists (graceful degradation).
   *
   * This prompt provides project-specific coding conventions and architecture
   * standards. It is injected as a hidden system message into every agent session.
   */
  buildCodingStandardsPrompt(): string | null {
    try {
      return this.templateLoader.render("coding-standards", {});
    } catch {
      // Template not found - coding standards not configured for this project
      return null;
    }
  }

  /**
   * Build a CODE_REVIEW_FIX_IMPLEMENT prompt for the implementor
   */
  buildCodeReviewFixImplementPrompt(
    context: PromptContext,
    review: CodeReviewContext,
  ): string {
    const formattedStatus = (() => {
      const withSpaces = review.status.replace(/_/g, " ").toLowerCase();
      return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
    })();
    const codeReview = {
      status: formattedStatus,
      ...(review.summary ? { summary: review.summary } : {}),
    };
    const renderContext = {
      ...context,
      codeReview,
    };
    return this.templateLoader.render(
      "code-review-fix-implement",
      renderContext,
    );
  }
}
