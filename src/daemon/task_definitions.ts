export type TriggerType = 'cron' | 'webhook' | 'file-watch';

export interface TaskDefinition {
  id: string;
  name: string;
  trigger: TriggerType;
  schedule?: string; // Cron expression
  path?: string; // File path for file-watch trigger
  prompt: string; // The task to execute
  company?: string; // Company context isolation
  yoloMode?: boolean; // Whether to run without confirmation (defaults to true for daemon)
  autoDecisionTimeout?: number; // Timeout in milliseconds for auto-decision
  is_routine?: boolean; // Flag to indicate if the task is a routine strategic task
  frequency?: "hourly" | "daily"; // Routine frequency
}

export interface ScheduleConfig {
  tasks: TaskDefinition[];
}
