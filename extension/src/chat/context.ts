/**
 * Orchestra Context Provider
 *
 * Provides context data for agent prompts and chat responses.
 * This module fetches sprint, task, and handover information from the database
 * and formats it as Markdown for inclusion in LLM prompts and chat displays.
 */

import {
  getCurrentSprint,
  getCurrentTask,
  getHandover,
  getPhases,
  getTasksForSprint,
  type Handover,
  type Phase,
  type Sprint,
  type Task,
} from "../database/queries.js";

/**
 * Sprint context including progress summary
 */
export interface SprintContext {
  sprint: Sprint;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  progressPercent: number;
  phases: Phase[];
  markdown: string;
}

/**
 * Task context including handover data
 */
export interface TaskContext {
  task: Task;
  handover: Handover | null;
  markdown: string;
}

/**
 * Handover context formatted for agent consumption
 */
export interface HandoverContext {
  handover: Handover;
  task: Task;
  markdown: string;
}

/**
 * Get current sprint context
 *
 * Returns sprint information with progress statistics and formatted Markdown.
 * Returns null if no active sprint exists.
 *
 * @param workspaceRoot Absolute path to Orchestra workspace root
 * @returns Sprint context or null if no active sprint
 */
export function getSprintContext(workspaceRoot: string): SprintContext | null {
  const sprint = getCurrentSprint(workspaceRoot);
  if (!sprint) {
    return null;
  }

  const tasks = getTasksForSprint(workspaceRoot, sprint.id);
  const phases = getPhases(workspaceRoot, sprint.id);

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "COMPLETE").length;
  const pendingTasks = tasks.filter((t) => t.status === "PENDING").length;
  const inProgressTasks = tasks.filter(
    (t) =>
      t.status === "IMPLEMENT" ||
      t.status === "GATE_CHECK" ||
      t.status === "VERIFY"
  ).length;
  const progressPercent =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Format as Markdown
  const markdown = formatSprintMarkdown(
    sprint,
    {
      totalTasks,
      completedTasks,
      pendingTasks,
      inProgressTasks,
      progressPercent,
    },
    phases,
    tasks
  );

  return {
    sprint,
    totalTasks,
    completedTasks,
    pendingTasks,
    inProgressTasks,
    progressPercent,
    phases,
    markdown,
  };
}

/**
 * Get current task context
 *
 * Returns the currently active task (in IMPLEMENT/GATE_CHECK/VERIFY status)
 * with its handover data and formatted Markdown.
 * Returns null if no task is currently in progress.
 *
 * @param workspaceRoot Absolute path to Orchestra workspace root
 * @returns Task context or null if no current task
 */
export function getTaskContext(workspaceRoot: string): TaskContext | null {
  const currentTask = getCurrentTask(workspaceRoot);
  if (!currentTask) {
    return null;
  }

  const { handover, ...task } = currentTask;

  // Format as Markdown
  const markdown = formatTaskMarkdown(task, handover);

  return {
    task,
    handover,
    markdown,
  };
}

/**
 * Get handover context for a specific task
 *
 * Returns handover data with full acceptance criteria, deliverables,
 * and constraints formatted for agent consumption.
 * Returns null if task has no handover (hasn't been prepared).
 *
 * @param workspaceRoot Absolute path to Orchestra workspace root
 * @param taskId Task ID (numeric primary key)
 * @returns Handover context or null if no handover exists
 */
export function getHandoverContext(
  workspaceRoot: string,
  taskId: number
): HandoverContext | null {
  const handover = getHandover(workspaceRoot, taskId);
  if (!handover) {
    return null;
  }

  // Get the task details
  const sprint = getCurrentSprint(workspaceRoot);
  if (!sprint) {
    return null;
  }

  const tasks = getTasksForSprint(workspaceRoot, sprint.id);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) {
    return null;
  }

  // Format as Markdown
  const markdown = formatHandoverMarkdown(handover, task);

  return {
    handover,
    task,
    markdown,
  };
}

/**
 * Format sprint data as Markdown
 */
function formatSprintMarkdown(
  sprint: Sprint,
  progress: {
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
    inProgressTasks: number;
    progressPercent: number;
  },
  phases: Phase[],
  tasks: Task[]
): string {
  let md = `# Sprint: ${sprint.name}\n\n`;
  md += `**Workflow Step**: ${sprint.workflow_step}\n\n`;
  md += `## Progress Summary\n\n`;
  md += `- **Total Tasks**: ${progress.totalTasks}\n`;
  md += `- **Completed**: ${progress.completedTasks} (${progress.progressPercent}%)\n`;
  md += `- **In Progress**: ${progress.inProgressTasks}\n`;
  md += `- **Pending**: ${progress.pendingTasks}\n\n`;

  if (phases.length > 0) {
    md += `## Phases\n\n`;
    for (const phase of phases) {
      const phaseTasks = tasks.filter((t) => t.phase_id === phase.id);
      const phaseComplete = phaseTasks.filter(
        (t) => t.status === "COMPLETE"
      ).length;
      md += `### ${phase.phase_name}\n`;
      md += `- Progress: ${phaseComplete}/${phaseTasks.length} tasks complete\n`;
      md += `- Tasks: ${phaseTasks.map((t) => `#${t.task_id}`).join(", ")}\n\n`;
    }
  }

  return md;
}

/**
 * Format task data as Markdown
 */
function formatTaskMarkdown(task: Task, handover: Handover | null): string {
  let md = `# Task ${task.task_id}: ${task.title}\n\n`;
  md += `**Status**: ${task.status}\n`;
  md += `**Category**: ${task.category}\n`;
  md += `**Priority**: ${handover?.priority ?? "N/A"}\n\n`;

  md += `## Description\n\n${task.description}\n\n`;

  if (task.dependencies && task.dependencies !== "[]") {
    try {
      const deps = JSON.parse(task.dependencies) as number[];
      if (deps.length > 0) {
        md += `## Dependencies\n\n`;
        md += `- Tasks: ${deps.map((d) => `#${d}`).join(", ")}\n\n`;
      }
    } catch {
      md += `## Dependencies\n\n${task.dependencies}\n\n`;
    }
  }

  if (handover) {
    md += `## Retry Info\n\n`;
    md += `- **Attempt**: ${task.retry_count + 1}/${task.max_retries}\n`;
    md += `- **Remaining Attempts**: ${
      task.max_retries - task.retry_count
    }\n\n`;
  }

  return md;
}

/**
 * Format handover data as Markdown
 */
function formatHandoverMarkdown(handover: Handover, task: Task): string {
  let md = `# Handover: Task ${task.task_id}\n\n`;
  md += `**Title**: ${task.title}\n`;
  md += `**Priority**: ${handover.priority}\n\n`;

  // Context
  if (handover.context) {
    md += `## Context\n\n${handover.context}\n\n`;
  }

  // Context files
  if (handover.context_files) {
    try {
      const files = JSON.parse(handover.context_files) as string[];
      if (files.length > 0) {
        md += `## Context Files\n\n`;
        files.forEach((file) => {
          md += `- \`${file}\`\n`;
        });
        md += `\n`;
      }
    } catch {
      md += `## Context Files\n\n${handover.context_files}\n\n`;
    }
  }

  // Acceptance criteria
  try {
    const criteria = JSON.parse(handover.acceptance_criteria) as Array<{
      criterion: string;
      verification: string;
    }>;
    md += `## Acceptance Criteria\n\n`;
    criteria.forEach((c, i) => {
      md += `${i + 1}. **${c.criterion}**\n`;
      md += `   - Verification: ${c.verification}\n`;
    });
    md += `\n`;
  } catch {
    md += `## Acceptance Criteria\n\n${handover.acceptance_criteria}\n\n`;
  }

  // File operations
  try {
    const operations = JSON.parse(handover.file_operations) as Array<{
      operation: string;
      path: string;
      description: string;
    }>;
    md += `## File Operations\n\n`;
    operations.forEach((op) => {
      md += `- **${op.operation}** \`${op.path}\`\n`;
      md += `  - ${op.description}\n`;
    });
    md += `\n`;
  } catch {
    md += `## File Operations\n\n${handover.file_operations}\n\n`;
  }

  // Deliverables
  try {
    const deliverables = JSON.parse(handover.deliverables) as string[];
    md += `## Deliverables\n\n`;
    deliverables.forEach((d) => {
      md += `- ${d}\n`;
    });
    md += `\n`;
  } catch {
    md += `## Deliverables\n\n${handover.deliverables}\n\n`;
  }

  // Test requirements
  if (handover.test_requirements) {
    try {
      const testReqs = JSON.parse(handover.test_requirements) as string[];
      md += `## Test Requirements\n\n`;
      testReqs.forEach((req) => {
        md += `- ${req}\n`;
      });
      md += `\n`;
    } catch {
      md += `## Test Requirements\n\n${handover.test_requirements}\n\n`;
    }
  }

  // Constraints
  if (handover.constraints) {
    try {
      const constraints = JSON.parse(handover.constraints) as string[];
      md += `## Constraints\n\n`;
      constraints.forEach((c) => {
        md += `- ${c}\n`;
      });
      md += `\n`;
    } catch {
      md += `## Constraints\n\n${handover.constraints}\n\n`;
    }
  }

  // Reference links
  if (handover.reference_links) {
    try {
      const links = JSON.parse(handover.reference_links) as string[];
      md += `## Reference Links\n\n`;
      links.forEach((link) => {
        md += `- ${link}\n`;
      });
      md += `\n`;
    } catch {
      md += `## Reference Links\n\n${handover.reference_links}\n\n`;
    }
  }

  return md;
}
