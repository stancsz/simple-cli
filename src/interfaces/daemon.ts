export type TriggerType = 'cron' | 'webhook' | 'file-watch';

export interface TaskDefinition {
  id: string;
  name: string;
  trigger: TriggerType;
  schedule?: string; // Cron expression
  path?: string; // File path for file-watch trigger
  prompt?: string; // The task to execute (optional if action is provided)
  action?: string; // Direct action to execute (e.g., 'mcp.call_tool')
  args?: Record<string, any>; // Arguments for the action
  company?: string; // Company context isolation
  yoloMode?: boolean; // Whether to run without confirmation (defaults to true for daemon)
  autoDecisionTimeout?: number; // Timeout in milliseconds for auto-decision
  batchingGroup?: string; // Optional group ID for prompt batching
}

export interface ScheduleConfig {
  tasks: TaskDefinition[];
}
