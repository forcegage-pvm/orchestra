/**
 * Orchestra Chat Participant
 *
 * Registers the @orchestra chat participant for agent invocation.
 * Allows users to interact with Orchestra via Copilot Chat.
 *
 * Commands:
 * - @orchestra status - Show current sprint and task progress
 * - @orchestra start task <id> - Begin work on a specific task
 */

import * as vscode from "vscode";
import {
  getCurrentSprint,
  getCurrentTask,
  getPhases,
  getTasksForSprint,
} from "../database/queries.js";
import { OrchestraLogger } from "../utils/logger.js";
import { getSprintContext } from "./context.js";

/**
 * Register the Orchestra chat participant
 *
 * @param context Extension context for disposables
 * @param orchestraRoot Path to Orchestra workspace root
 * @param logger Logger instance
 * @returns Disposable for the chat participant
 */
export function registerChatParticipant(
  context: vscode.ExtensionContext,
  orchestraRoot: string,
  logger: OrchestraLogger
): vscode.Disposable {
  // Create chat participant with Orchestra logo icon
  const iconPath = vscode.Uri.joinPath(
    context.extensionUri,
    "resources",
    "orchestra-icon.svg"
  );

  const participant = vscode.chat.createChatParticipant(
    "orchestra",
    handleChatRequest(orchestraRoot, logger)
  );

  participant.iconPath = iconPath;

  logger.info("Chat participant registered: @orchestra");
  return participant;
}

/**
 * Create the chat request handler
 *
 * @param orchestraRoot Path to Orchestra workspace root
 * @param logger Logger instance
 * @returns Chat request handler function
 */
function handleChatRequest(
  orchestraRoot: string,
  logger: OrchestraLogger
): vscode.ChatRequestHandler {
  return async (
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken
  ): Promise<void> => {
    try {
      // Context provider integration: Sprint, task, and handover context
      // is fetched via getSprintContext(), getTaskContext(), and getHandoverContext()
      // from context.ts. These functions format Orchestra data as Markdown
      // for enriched chat responses and agent prompts.

      // Get command from the request
      const command = request.command?.toLowerCase() || "";
      const prompt = request.prompt.toLowerCase();

      logger.debug(
        `Chat request: command=${command || "none"}, prompt="${request.prompt}"`
      );

      // Handle 'status' command
      if (command === "status" || prompt.includes("status")) {
        await handleStatusCommand(orchestraRoot, stream, logger);
        return;
      }

      // Handle 'start task' command
      if (
        command === "start" ||
        prompt.includes("start") ||
        prompt.includes("task")
      ) {
        await handleStartTaskCommand(
          request.prompt,
          orchestraRoot,
          stream,
          logger
        );
        return;
      }

      // Handle 'context' command - provide sprint/task context for agents
      if (command === "context" || prompt.includes("context")) {
        await handleContextCommand(orchestraRoot, stream, logger);
        return;
      }

      // Default help message
      stream.markdown("## Orchestra Commands\n\n");
      stream.markdown("I can help you with:\n\n");
      stream.markdown(
        "- **@orchestra status** - Show current sprint and task progress\n"
      );
      stream.markdown(
        "- **@orchestra start task &lt;id&gt;** - Begin work on a specific task\n"
      );
      stream.markdown(
        "- **@orchestra context** - Get context for the current task or sprint\n"
      );
      stream.markdown("\n");
      stream.markdown(
        "Use the [Dashboard](command:orchestra.openDashboard) for a full overview.\n"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Chat request failed", error);
      stream.markdown(`**Error**: ${message}\n`);
    }
  };
}

/**
 * Handle the 'status' command
 * Shows current sprint and task progress
 */
async function handleStatusCommand(
  orchestraRoot: string,
  stream: vscode.ChatResponseStream,
  logger: OrchestraLogger
): Promise<void> {
  logger.info("Handling status command");

  // Get sprint context using context provider
  const sprintContext = getSprintContext(orchestraRoot);
  if (!sprintContext) {
    stream.markdown("**No active sprint found**\n\n");
    stream.markdown(
      "Use the MCP Orchestrator agent to configure a sprint first.\n"
    );
    return;
  }

  const { sprint, totalTasks, completedTasks, progressPercent } = sprintContext;

  // Get current task
  const currentTask = getCurrentTask(orchestraRoot);

  // Get all tasks for phase breakdown
  const tasks = getTasksForSprint(orchestraRoot, sprint.id);
  const phases = getPhases(orchestraRoot, sprint.id);

  // Format response
  stream.markdown(`# Sprint Status\n\n`);
  stream.markdown(`**Sprint**: ${sprint.name}\n\n`);
  stream.markdown(`**Workflow Step**: ${sprint.workflow_step}\n\n`);
  stream.markdown(
    `**Progress**: ${completedTasks}/${totalTasks} tasks (${progressPercent}%)\n\n`
  );

  if (currentTask) {
    stream.markdown(`## Current Task\n\n`);
    stream.markdown(
      `**Task ${currentTask.task_id}**: ${currentTask.title}\n\n`
    );
    stream.markdown(`**Status**: ${currentTask.status}\n\n`);
    stream.markdown(`**Category**: ${currentTask.category}\n\n`);

    // Add link to task detail
    stream.markdown(
      `[View Task Details](command:orchestra.openTaskDetail?${encodeURIComponent(
        JSON.stringify([currentTask.id])
      )})\n\n`
    );
  } else {
    stream.markdown(`## Current Task\n\n`);
    stream.markdown(`*No task currently in progress*\n\n`);
  }

  // Show phase breakdown
  if (phases.length > 0) {
    stream.markdown(`## Phases\n\n`);
    for (const phase of phases) {
      const phaseTasks = tasks.filter((t) => t.phase_id === phase.id);
      const phaseComplete = phaseTasks.filter(
        (t) => t.status === "COMPLETE"
      ).length;
      stream.markdown(
        `- **${phase.phase_name}**: ${phaseComplete}/${phaseTasks.length} complete\n`
      );
    }
    stream.markdown("\n");
  }

  // Add link to dashboard
  stream.markdown(
    `[Open Dashboard](command:orchestra.openDashboard) for full details\n`
  );

  logger.info("Status command completed");
}

/**
 * Handle the 'start task' command
 * Allows starting a specific task by ID
 */
async function handleStartTaskCommand(
  prompt: string,
  orchestraRoot: string,
  stream: vscode.ChatResponseStream,
  logger: OrchestraLogger
): Promise<void> {
  logger.info("Handling start task command");

  // Extract task ID from prompt
  const match = prompt.match(/\b(\d+)\b/);
  if (!match) {
    stream.markdown("**Please specify a task ID**\n\n");
    stream.markdown("Example: `@orchestra start task 5`\n");
    return;
  }

  const taskId = parseInt(match[1] ?? "0", 10);

  // Get current sprint
  const sprint = getCurrentSprint(orchestraRoot);
  if (!sprint) {
    stream.markdown("**No active sprint found**\n\n");
    return;
  }

  // Find the task
  const tasks = getTasksForSprint(orchestraRoot, sprint.id);
  const task = tasks.find((t) => t.task_id === taskId);

  if (!task) {
    stream.markdown(`**Task ${taskId} not found in current sprint**\n\n`);
    stream.markdown(
      `Available tasks: ${tasks.map((t) => t.task_id).join(", ")}\n`
    );
    return;
  }

  // Show task details
  stream.markdown(`# Task ${task.task_id}: ${task.title}\n\n`);
  stream.markdown(`**Status**: ${task.status}\n\n`);
  stream.markdown(`**Category**: ${task.category}\n\n`);
  stream.markdown(`**Description**: ${task.description}\n\n`);

  if (task.dependencies && task.dependencies !== "[]") {
    stream.markdown(`**Dependencies**: ${task.dependencies}\n\n`);
  }

  // Provide guidance based on status
  if (task.status === "PENDING") {
    stream.markdown(`## Next Steps\n\n`);
    stream.markdown(
      `This task is in PENDING status. To start working on it:\n\n`
    );
    stream.markdown(
      `1. Use the MCP Orchestrator to prepare the task (creates handover)\n`
    );
    stream.markdown(`2. Invoke the Implementor agent to work on the task\n\n`);
    stream.markdown(
      `[View Task Details](command:orchestra.openTaskDetail?${encodeURIComponent(
        JSON.stringify([task.id])
      )})\n`
    );
  } else if (task.status === "IMPLEMENT") {
    stream.markdown(`## Task In Progress\n\n`);
    stream.markdown(
      `This task is ready for implementation. The handover has been prepared.\n\n`
    );
    stream.markdown(
      `Invoke the [Implementor Agent](command:orchestra.invokeImplementor) to work on this task.\n\n`
    );
    stream.markdown(
      `[View Task Details](command:orchestra.openTaskDetail?${encodeURIComponent(
        JSON.stringify([task.id])
      )})\n`
    );
  } else if (task.status === "COMPLETE") {
    stream.markdown(`## Task Complete\n\n`);
    stream.markdown(`This task has been completed.\n\n`);
    stream.markdown(
      `[View Task Details](command:orchestra.openTaskDetail?${encodeURIComponent(
        JSON.stringify([task.id])
      )})\n`
    );
  } else {
    stream.markdown(`## Task Status: ${task.status}\n\n`);
    stream.markdown(
      `[View Task Details](command:orchestra.openTaskDetail?${encodeURIComponent(
        JSON.stringify([task.id])
      )})\n`
    );
  }

  logger.info(`Start task command completed for task ${taskId}`);
}

/**
 * Handle the 'context' command
 * Provides rich context for agents about current sprint/task
 */
async function handleContextCommand(
  orchestraRoot: string,
  stream: vscode.ChatResponseStream,
  logger: OrchestraLogger
): Promise<void> {
  logger.info("Handling context command");

  // Get sprint context
  const sprintContext = getSprintContext(orchestraRoot);
  if (!sprintContext) {
    stream.markdown("**No active sprint found**\n\n");
    stream.markdown(
      "Configure a sprint using the MCP Orchestrator agent first.\n"
    );
    return;
  }

  const { sprint, totalTasks, completedTasks, progressPercent } = sprintContext;

  // Get current task
  const currentTask = getCurrentTask(orchestraRoot);

  // Get all tasks for full context
  const tasks = getTasksForSprint(orchestraRoot, sprint.id);
  const phases = getPhases(orchestraRoot, sprint.id);

  stream.markdown(`# Orchestra Context\n\n`);
  stream.markdown(`## Sprint: ${sprint.name}\n\n`);
  stream.markdown(`- **ID**: \`${sprint.id}\`\n`);
  stream.markdown(`- **Workflow Step**: ${sprint.workflow_step}\n`);
  stream.markdown(
    `- **Progress**: ${completedTasks}/${totalTasks} tasks (${progressPercent}%)\n\n`
  );

  if (currentTask) {
    stream.markdown(`## Current Task\n\n`);
    stream.markdown(`- **Task ID**: ${currentTask.task_id}\n`);
    stream.markdown(`- **Title**: ${currentTask.title}\n`);
    stream.markdown(`- **Status**: ${currentTask.status}\n`);
    stream.markdown(`- **Category**: ${currentTask.category}\n`);
    stream.markdown(`- **Phase**: ${currentTask.phase_id}\n\n`);
    stream.markdown(`### Description\n\n${currentTask.description}\n\n`);

    if (currentTask.dependencies && currentTask.dependencies !== "[]") {
      stream.markdown(`### Dependencies\n\n${currentTask.dependencies}\n\n`);
    }
  } else {
    stream.markdown(`## Current Task\n\n*No task currently in progress*\n\n`);

    // Show next available tasks
    const pendingTasks = tasks.filter(
      (t) => t.status === "PENDING" || t.status === "IMPLEMENT"
    );
    if (pendingTasks.length > 0) {
      stream.markdown(`### Available Tasks\n\n`);
      for (const task of pendingTasks.slice(0, 5)) {
        stream.markdown(
          `- **Task ${task.task_id}**: ${task.title} (${task.status})\n`
        );
      }
      stream.markdown("\n");
    }
  }

  // Phase overview
  if (phases.length > 0) {
    stream.markdown(`## Phases\n\n`);
    for (const phase of phases) {
      const phaseTasks = tasks.filter((t) => t.phase_id === phase.id);
      const phaseComplete = phaseTasks.filter(
        (t) => t.status === "COMPLETE"
      ).length;
      const phaseStatus =
        phaseComplete === phaseTasks.length
          ? "[Complete]"
          : phaseComplete > 0
          ? "[In Progress]"
          : "[Pending]";
      stream.markdown(
        `- ${phaseStatus} **${phase.phase_name}**: ${phaseComplete}/${phaseTasks.length}\n`
      );
    }
    stream.markdown("\n");
  }

  logger.info("Context command completed");
}
