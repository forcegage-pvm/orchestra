/**
 * PlayTaskHandler - Context-aware Play Button handler
 *
 * Routes task execution based on task status. When user clicks Play on a task,
 * this handler determines what action to take: prepare, implement, retry, show escalation,
 * or inform that task is already complete.
 */

import * as path from "path";
import * as vscode from "vscode";
import {
  getEscalation,
  getFeedback,
  getLatestHandoverReview,
  getSprintById,
  getTaskById,
} from "../database/queries.js";
import { getAgentRunner, getContextFileResolver } from "../extension.js";
import { PromptBuilder } from "../prompts/PromptBuilder.js";
import { OrchestraLogger } from "../utils/logger.js";

/**
 * Show the new Agent Panel webview (Sprint 011)
 * Opens the orchestra.agentPanel view in the sidebar
 */
async function showAgentPanel(): Promise<void> {
  // First, ensure the Orchestra sidebar is visible
  await vscode.commands.executeCommand(
    "workbench.view.extension.orchestra-explorer",
  );

  // Then focus the Agent Panel view specifically
  await vscode.commands.executeCommand("orchestra.agentPanel.focus");
}

/**
 * Handle Play button click for a task
 *
 * Routes to appropriate action based on task status:
 * - PENDING → invokePrepare (orchestrator prepares the task)
 * - IMPLEMENT → invokeImplement (implementor works on the task)
 * - VERIFY_FAILED → invokeRetry (implementor retries with feedback)
 * - VERIFY/GATE_CHECK → invokeVerify (orchestrator runs verification)
 * - ESCALATED → invokeEscalationReview (orchestrator reviews escalation)
 * - COMPLETE → showInfoMessage (task already done)
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 */
export async function handlePlayTask(
  workspaceRoot: string,
  taskId: number,
): Promise<void> {
  const task = getTaskById(workspaceRoot, taskId);

  if (!task) {
    vscode.window.showErrorMessage(`Task ${taskId} not found`);
    return;
  }

  switch (task.status) {
    case "PENDING":
      await invokePrepare(workspaceRoot, taskId);
      break;

    case "PENDING_HANDOVER_REVIEW":
      await invokeHandoverReview(workspaceRoot, taskId);
      break;

    case "HANDOVER_REVIEW_FAILED":
      await invokeHandoverFix(workspaceRoot, taskId);
      break;

    case "IMPLEMENT":
      await invokeImplement(workspaceRoot, taskId);
      break;

    case "VERIFY_FAILED":
      await invokeRetry(workspaceRoot, taskId);
      break;

    case "VERIFY":
    case "GATE_CHECK":
      await invokeVerify(workspaceRoot, taskId);
      break;

    case "ESCALATED":
      await invokeEscalationReview(workspaceRoot, taskId);
      break;

    case "COMPLETE":
      vscode.window.showInformationMessage(
        `Task ${taskId}: ${task.title} is already complete`,
      );
      break;

    default:
      vscode.window.showWarningMessage(
        `Task ${taskId} has unexpected status: ${task.status}`,
      );
  }
}

/**
 * Invoke orchestrator to prepare a PENDING task
 *
 * Builds a PREPARE prompt with task context and opens chat with orchestrator agent.
 * Uses PromptBuilder to generate structured prompt and ChatInvoker to open chat.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 */
async function invokePrepare(
  workspaceRoot: string,
  taskId: number,
): Promise<void> {
  try {
    // Get task and sprint data from database
    const task = getTaskById(workspaceRoot, taskId);

    if (!task) {
      vscode.window.showErrorMessage(`Task ${taskId} not found`);
      return;
    }

    const sprint = getSprintById(workspaceRoot, task.sprint_id);

    if (!sprint) {
      vscode.window.showErrorMessage(
        `Sprint ${task.sprint_id} not found for task ${taskId}`,
      );
      return;
    }

    // Build prompt context
    const context = {
      task: {
        task_id: task.task_id,
        title: task.title,
        description: task.description,
        category: task.category,
        phase_id: `phase-${task.phase_id}`,
      },
      sprint: {
        sprint_id: sprint.id,
        title: sprint.name,
      },
    };

    // Create instances
    const logger = new OrchestraLogger();
    const promptBuilder = new PromptBuilder();
    const agentRunner = getAgentRunner();

    if (agentRunner.getSession()?.status === "running") {
      vscode.window.showErrorMessage(
        "Orchestra: Agent is already running. Stop or pause the current agent first.",
      );
      return;
    }

    // Build the prepare prompt
    const prompt = promptBuilder.buildPreparePrompt(context);

    // Show Agent Panel before starting
    await showAgentPanel();

    // Get agent instruction path
    const agentInstructionPath = path.join(
      workspaceRoot,
      ".github",
      "agents",
      "orchestra.orchestrator.agent.md",
    );

    // Start orchestrator agent for task preparation
    const startOptions = {
      prompt,
      taskId,
      sprintId: sprint.id,
    } as const;

    await agentRunner.start("orchestrator", {
      ...startOptions,
      attachments: [{ path: agentInstructionPath }],
    });

    logger.info(`Started orchestrator agent to prepare task ${taskId}`, {
      taskId,
      taskTitle: task.title,
      sprintId: sprint.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to prepare task ${taskId} - ${message}`,
    );
  }
}

/**
 * Invoke implementor to work on an IMPLEMENT task
 *
 * Builds an IMPLEMENT prompt with task context and handover path, resolves context files,
 * and starts the implementor agent via AgentRunner.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 */
async function invokeImplement(
  workspaceRoot: string,
  taskId: number,
): Promise<void> {
  try {
    // Get task from database
    const task = getTaskById(workspaceRoot, taskId);

    if (!task) {
      vscode.window.showErrorMessage(`Task ${taskId} not found`);
      return;
    }

    // Build prompt context (no handoverPath field in database)
    const context = {
      task: {
        task_id: task.task_id,
        title: task.title,
        description: task.description,
        category: task.category,
        phase_id: `phase-${task.phase_id}`,
      },
      sprint: {
        sprint_id: task.sprint_id,
        title: "Current Sprint",
      },
    };

    // Create instances
    const logger = new OrchestraLogger();
    const promptBuilder = new PromptBuilder();
    const agentRunner = getAgentRunner();

    if (agentRunner.getSession()?.status === "running") {
      vscode.window.showErrorMessage(
        "Orchestra: Agent is already running. Stop or pause the current agent first.",
      );
      return;
    }

    // Get context file resolver from extension
    const contextFileResolver = getContextFileResolver();

    // Resolve context files from handover
    const contextFiles = contextFileResolver.getContextFiles(taskId);

    // Build the implement prompt
    const prompt = promptBuilder.buildImplementPrompt(context);

    // Show Agent Panel before starting
    await showAgentPanel();

    // Get agent instruction path
    const agentInstructionPath = path.join(
      workspaceRoot,
      ".github",
      "agents",
      "orchestra.implementor.agent.md",
    );

    // Invoke implementor agent for autonomous execution
    const startOptions = {
      prompt,
      taskId,
      sprintId: task.sprint_id,
    } as const;

    await agentRunner.start("implementor", {
      ...startOptions,
      attachments: [{ path: agentInstructionPath }],
    });

    logger.info(`Started implementor agent for task ${taskId}`, {
      taskId,
      taskTitle: task.title,
      contextFileCount: contextFiles.length,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Agent is already running")
    ) {
      vscode.window.showErrorMessage(
        "Orchestra: Agent is already running. Stop or pause the current agent first.",
      );
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to start implementor agent for task ${taskId} - ${message}`,
    );
  }
}

/**
 * Invoke implementor to retry a VERIFY_FAILED task with feedback
 *
 * Builds a RETRY prompt with task context and feedback path, resolves context files,
 * and opens chat with implementor agent. Uses getFeedback to retrieve the latest
 * verification failure feedback.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 */
async function invokeRetry(
  workspaceRoot: string,
  taskId: number,
): Promise<void> {
  try {
    // Get task from database
    const task = getTaskById(workspaceRoot, taskId);

    if (!task) {
      vscode.window.showErrorMessage(`Task ${taskId} not found`);
      return;
    }

    // Get latest feedback from database
    const feedback = getFeedback(workspaceRoot, taskId);

    if (!feedback) {
      vscode.window.showErrorMessage(
        `Orchestra: No feedback found for task ${taskId}. Cannot retry.`,
      );
      return;
    }

    // Build prompt context with retry count from task
    const context = {
      task: {
        task_id: task.task_id,
        title: task.title,
        description: task.description,
        category: task.category,
        phase_id: `phase-${task.phase_id}`,
      },
      sprint: {
        sprint_id: task.sprint_id,
        title: "Current Sprint",
      },
      retryCount: task.retry_count,
      // feedbackPath is optional - implementor will use MCP tools to get feedback
    };

    // Create instances
    const logger = new OrchestraLogger();
    const promptBuilder = new PromptBuilder();
    const agentRunner = getAgentRunner();

    if (agentRunner.getSession()?.status === "running") {
      vscode.window.showErrorMessage(
        "Orchestra: Agent is already running. Stop or pause the current agent first.",
      );
      return;
    }

    // Get context file resolver from extension
    const contextFileResolver = getContextFileResolver();

    // Resolve context files from handover
    const contextFiles = contextFileResolver.getContextFiles(taskId);

    // Build the retry prompt
    const prompt = promptBuilder.buildRetryPrompt(context);

    // Show Agent Panel before starting
    await showAgentPanel();

    // Get agent instruction path
    const agentInstructionPath = path.join(
      workspaceRoot,
      ".github",
      "agents",
      "orchestra.implementor.agent.md",
    );

    // Start implementor agent for retry
    const startOptions = {
      prompt,
      taskId,
      sprintId: task.sprint_id,
    } as const;

    await agentRunner.start("implementor", {
      ...startOptions,
      attachments: [{ path: agentInstructionPath }],
    });

    logger.info(`Started implementor agent to retry task ${taskId}`, {
      taskId,
      taskTitle: task.title,
      retryCount: task.retry_count,
      feedbackAttempt: feedback.attempt,
      contextFileCount: contextFiles.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to retry task ${taskId} - ${message}`,
    );
  }
}

/**
 * Invoke orchestrator to verify a VERIFY or GATE_CHECK task
 *
 * Builds a VERIFY prompt with task context and opens chat with orchestrator agent.
 * The orchestrator will run verification checks and submit judgment.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 */
async function invokeVerify(
  workspaceRoot: string,
  taskId: number,
): Promise<void> {
  try {
    // Get task from database
    const task = getTaskById(workspaceRoot, taskId);

    if (!task) {
      vscode.window.showErrorMessage(`Task ${taskId} not found`);
      return;
    }

    // Build prompt context
    const context = {
      task: {
        task_id: task.task_id,
        title: task.title,
        description: task.description,
        category: task.category,
        phase_id: `phase-${task.phase_id}`,
      },
      sprint: {
        sprint_id: task.sprint_id,
        title: "Current Sprint",
      },
    };

    // Create instances
    const logger = new OrchestraLogger();
    const promptBuilder = new PromptBuilder();
    const agentRunner = getAgentRunner();

    if (agentRunner.getSession()?.status === "running") {
      vscode.window.showErrorMessage(
        "Orchestra: Agent is already running. Stop or pause the current agent first.",
      );
      return;
    }

    // Build the verify prompt
    const prompt = promptBuilder.buildVerifyPrompt(context);

    // Show Agent Panel before starting
    await showAgentPanel();

    // Get agent instruction path
    const agentInstructionPath = path.join(
      workspaceRoot,
      ".github",
      "agents",
      "orchestra.orchestrator.agent.md",
    );

    // Start orchestrator agent for verification
    const startOptions = {
      prompt,
      taskId,
      sprintId: task.sprint_id,
    } as const;

    await agentRunner.start("orchestrator", {
      ...startOptions,
      attachments: [{ path: agentInstructionPath }],
    });

    logger.info(`Started orchestrator agent to verify task ${taskId}`, {
      taskId,
      taskTitle: task.title,
      taskStatus: task.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to invoke verification for task ${taskId} - ${message}`,
    );
  }
}

/**
 * Invoke orchestrator to fix rejected handover
 *
 * Builds a prompt with rejection feedback and invokes orchestrator to address
 * Controller feedback and resubmit the handover.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 */
async function invokeHandoverFix(
  workspaceRoot: string,
  taskId: number,
): Promise<void> {
  try {
    const task = getTaskById(workspaceRoot, taskId);

    if (!task) {
      vscode.window.showErrorMessage(`Task ${taskId} not found`);
      return;
    }

    const sprint = getSprintById(workspaceRoot, task.sprint_id);

    if (!sprint) {
      vscode.window.showErrorMessage(
        `Sprint ${task.sprint_id} not found for task ${taskId}`,
      );
      return;
    }

    // Get rejection feedback
    const rejection = getLatestHandoverReview(workspaceRoot, taskId);
    if (!rejection) {
      vscode.window.showErrorMessage(
        `No rejection feedback found for task ${taskId}`,
      );
      return;
    }

    // Build prompt context
    const context = {
      task: {
        task_id: task.task_id,
        title: task.title,
        description: task.description,
        category: task.category,
        phase_id: `phase-${task.phase_id}`,
        status: task.status,
      },
      sprint: {
        sprint_id: sprint.id,
        title: sprint.name,
      },
      rejection: {
        issues: rejection.issues,
        recommendations: rejection.recommendations,
        revision_count: rejection.revision_count || 0,
      },
    };

    // Create instances
    const logger = new OrchestraLogger();
    const promptBuilder = new PromptBuilder();
    const agentRunner = getAgentRunner();

    if (agentRunner.getSession()?.status === "running") {
      vscode.window.showErrorMessage(
        "Orchestra: Agent is already running. Stop or pause the current agent first.",
      );
      return;
    }

    // Build the handover fix prompt
    const prompt = promptBuilder.buildHandoverFixPrompt(context);

    // Show Agent Panel before starting
    await showAgentPanel();

    // Get agent instruction path
    const agentInstructionPath = path.join(
      workspaceRoot,
      ".github",
      "agents",
      "orchestra.orchestrator.agent.md",
    );

    // Start orchestrator agent to fix handover
    const startOptions = {
      prompt,
      taskId,
      sprintId: sprint.id,
    } as const;

    await agentRunner.start("orchestrator", {
      ...startOptions,
      attachments: [{ path: agentInstructionPath }],
    });

    logger.info("Started orchestrator agent to fix handover", {
      taskId,
      taskTitle: task.title,
      revisionCount: rejection.revision_count || 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to invoke orchestrator for handover fix - ${message}`,
    );
  }
}

/** * Invoke controller to review a handover for a PENDING_HANDOVER_REVIEW task
 *
 * Builds a HANDOVER_REVIEW prompt with task and handover context,
 * and opens chat with controller agent in a new editor tab.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 */
async function invokeHandoverReview(
  workspaceRoot: string,
  taskId: number,
): Promise<void> {
  try {
    const task = getTaskById(workspaceRoot, taskId);

    if (!task) {
      vscode.window.showErrorMessage(`Task ${taskId} not found`);
      return;
    }

    const sprint = getSprintById(workspaceRoot, task.sprint_id);

    if (!sprint) {
      vscode.window.showErrorMessage(
        `Sprint ${task.sprint_id} not found for task ${taskId}`,
      );
      return;
    }

    // Get review attempt count from database
    let reviewAttempt = 1;
    if (task.status === "HANDOVER_REVIEW_FAILED") {
      const previousReview = getLatestHandoverReview(workspaceRoot, taskId);
      if (previousReview) {
        reviewAttempt = (previousReview.revision_count || 0) + 1;
      }
    }

    // Build prompt context
    const context = {
      task: {
        task_id: task.task_id,
        title: task.title,
        description: task.description,
        category: task.category,
        phase_id: `phase-${task.phase_id}`,
        status: task.status,
      },
      sprint: {
        sprint_id: sprint.id,
        title: sprint.name,
      },
      reviewAttempt,
    };

    // Create instances
    const logger = new OrchestraLogger();
    const promptBuilder = new PromptBuilder();
    const agentRunner = getAgentRunner();

    if (agentRunner.getSession()?.status === "running") {
      vscode.window.showErrorMessage(
        "Orchestra: Agent is already running. Stop or pause the current agent first.",
      );
      return;
    }

    // Build the handover review prompt
    const prompt = promptBuilder.buildHandoverReviewPrompt(context);

    // Show Agent Panel before starting
    await showAgentPanel();

    // Get agent instruction path
    const agentInstructionPath = path.join(
      workspaceRoot,
      ".github",
      "agents",
      "orchestra.controller.agent.md",
    );

    // Start controller agent for handover review
    const startOptions = {
      prompt,
      taskId,
      sprintId: sprint.id,
    } as const;

    await agentRunner.start("controller", {
      ...startOptions,
      attachments: [{ path: agentInstructionPath }],
    });

    logger.info("Started controller agent for handover review", {
      taskId,
      taskTitle: task.title,
      reviewAttempt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to invoke controller for handover review - ${message}`,
    );
  }
}

/** * Invoke orchestrator to review an ESCALATED task
 *
 * Builds a prompt with escalation context and opens chat with orchestrator agent.
 * The orchestrator can then decide to de-escalate, provide guidance, or escalate further.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 */
async function invokeEscalationReview(
  workspaceRoot: string,
  taskId: number,
): Promise<void> {
  try {
    // Get task from database
    const task = getTaskById(workspaceRoot, taskId);

    if (!task) {
      vscode.window.showErrorMessage(`Task ${taskId} not found`);
      return;
    }

    // Get escalation details
    const escalation = getEscalation(workspaceRoot, taskId);

    if (!escalation) {
      vscode.window.showErrorMessage(
        `Orchestra: No escalation found for task ${taskId}`,
      );
      return;
    }

    // Create instances
    const logger = new OrchestraLogger();
    const agentRunner = getAgentRunner();

    if (agentRunner.getSession()?.status === "running") {
      vscode.window.showErrorMessage(
        "Orchestra: Agent is already running. Stop or pause the current agent first.",
      );
      return;
    }

    // Build the escalation review prompt
    const prompt = `As Orchestrator, review the escalated Task ${
      task.task_id
    }: "${task.title}".

## Escalation Details
- **Reason**: ${escalation.reason}
- **Attempts Summary**: ${escalation.attempts_summary}
${
  escalation.recommended_action
    ? `- **Recommended Action**: ${escalation.recommended_action}`
    : ""
}

## Your Options
1. **De-escalate**: If you can resolve the blocker, use \`orchestra.moveToImplement\` to return to implementation
2. **Provide Guidance**: Add enhanced feedback to help the implementor
3. **Request Human Help**: If this requires human intervention, explain what is needed

Use your MCP tools to investigate and resolve this escalation.`;

    // Show Agent Panel before starting
    await showAgentPanel();

    // Get agent instruction path
    const agentInstructionPath = path.join(
      workspaceRoot,
      ".github",
      "agents",
      "orchestra.orchestrator.agent.md",
    );

    // Start orchestrator agent for escalation review
    const startOptions = {
      prompt,
      taskId,
      sprintId: task.sprint_id,
    } as const;

    await agentRunner.start("orchestrator", {
      ...startOptions,
      attachments: [{ path: agentInstructionPath }],
    });

    logger.info(
      `Started orchestrator agent to review escalated task ${taskId}`,
      {
        taskId,
        taskTitle: task.title,
        escalationReason: escalation.reason,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to invoke escalation review for task ${taskId} - ${message}`,
    );
  }
}
