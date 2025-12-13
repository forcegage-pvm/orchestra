/**
 * TreeView node type hierarchy for the Orchestra extension.
 * 
 * This module defines the node types used by OrchestraTreeProvider to render
 * phases and tasks in the VS Code sidebar TreeView.
 */

/**
 * Status values for phases and tasks in the Orchestra workflow.
 * Compatible with statusTranslation.ts status values.
 */
export type NodeStatus = 
  | 'PENDING'
  | 'IMPLEMENT'
  | 'VERIFY'
  | 'VERIFY_FAILED'
  | 'GATE_CHECK'
  | 'ESCALATED'
  | 'COMPLETE';

/**
 * Represents a sprint phase container in the TreeView.
 * A phase contains multiple tasks and shows aggregated progress.
 */
export interface PhaseNode {
  /** Unique identifier for the phase */
  id: string;
  
  /** Display name of the phase */
  name: string;
  
  /** Current status of the phase (derived from task statuses) */
  status: NodeStatus;
  
  /** Total number of tasks in this phase */
  taskCount: number;
  
  /** Number of completed tasks in this phase */
  completedCount: number;
}

/**
 * Represents an individual task in the TreeView.
 * Tasks are displayed under their parent phase.
 */
export interface TaskNode {
  /** Unique task ID (numeric) */
  id: number;
  
  /** Task title/name */
  title: string;
  
  /** Current status of the task */
  status: NodeStatus;
  
  /** Task description/context */
  description: string;
  
  /** Array of task IDs this task depends on */
  dependencies: number[];
  
  /** Name of the phase this task belongs to */
  phase: string;
}

/**
 * Union type of all node types that can appear in the TreeView.
 * Used for type-safe rendering in OrchestraTreeProvider.
 */
export type TreeNode = PhaseNode | TaskNode;

/**
 * Type guard to check if a node is a PhaseNode.
 * 
 * @param node - The node to check
 * @returns true if the node is a PhaseNode, false otherwise
 */
export function isPhaseNode(node: unknown): node is PhaseNode {
  if (!node || typeof node !== 'object') {
    return false;
  }
  
  const obj = node as Record<string, unknown>;
  
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.status === 'string' &&
    typeof obj.taskCount === 'number' &&
    typeof obj.completedCount === 'number'
  );
}

/**
 * Type guard to check if a node is a TaskNode.
 * 
 * @param node - The node to check
 * @returns true if the node is a TaskNode, false otherwise
 */
export function isTaskNode(node: unknown): node is TaskNode {
  if (!node || typeof node !== 'object') {
    return false;
  }
  
  const obj = node as Record<string, unknown>;
  
  return (
    typeof obj.id === 'number' &&
    typeof obj.title === 'string' &&
    typeof obj.status === 'string' &&
    typeof obj.description === 'string' &&
    Array.isArray(obj.dependencies) &&
    typeof obj.phase === 'string'
  );
}
