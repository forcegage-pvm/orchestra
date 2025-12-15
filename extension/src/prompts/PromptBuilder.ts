/**
 * PromptBuilder - Generates structured prompts for workflow stages
 *
 * Creates context-rich prompts for orchestrator and implementor agents,
 * guiding them through each workflow stage (PREPARE, IMPLEMENT, VERIFY, RETRY).
 */

/**
 * Task information for prompt context
 */
export interface Task {
  task_id: number;
  title: string;
  category?: string;
  phase_id?: string;
  description: string;
}

/**
 * Sprint information for prompt context
 */
export interface Sprint {
  sprint_id: string;
  title: string;
}

/**
 * Context for generating workflow stage prompts
 */
export interface PromptContext {
  /** The task being worked on */
  task: Task;
  
  /** The sprint the task belongs to */
  sprint: Sprint;
  
  /** Path to the task handover file (for IMPLEMENT/VERIFY stages) */
  handoverPath?: string;
  
  /** Path to feedback file (for RETRY stage) */
  feedbackPath?: string;
  
  /** Number of retry attempts made (for RETRY stage) */
  retryCount?: number;
}

/**
 * PromptBuilder generates structured prompts for each workflow stage
 */
export class PromptBuilder {
  /**
   * Build a PREPARE stage prompt for the orchestrator
   * 
   * Instructs the orchestrator to use MCP tools (get_task, prepare_task)
   * to prepare the task with handover and hidden verification criteria.
   * 
   * @param context - The prompt context containing task and sprint details
   * @returns A structured prompt string for the orchestrator
   */
  buildPreparePrompt(context: PromptContext): string {
    const { task, sprint } = context;
    
    return `As Orchestrator, prepare Task ${task.task_id}: "${task.title}".

## Your Task
Use your MCP tools to prepare this task for implementation:

1. \`get_task\` - Review the task specification and verification criteria
2. \`prepare_task\` - Create a comprehensive handover with:
   - Clear acceptance criteria
   - File operations (CREATE/UPDATE/DELETE)
   - Deliverables list
   - Context files to reference

## Task Details
- **ID**: ${task.task_id}
- **Title**: ${task.title}
${task.category ? `- **Category**: ${task.category}\n` : ''}${task.phase_id ? `- **Phase**: ${task.phase_id}\n` : ''}
## Sprint Context
- **Sprint ID**: ${sprint.sprint_id}
- **Sprint Title**: ${sprint.title}

## Description
${task.description}

## Remember
- Create verification criteria that the implementor CANNOT see
- Be specific about expected file changes
- Include test requirements
- Reference relevant context files from the codebase`;
  }
}
