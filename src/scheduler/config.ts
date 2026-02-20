import { TaskDefinition } from '../interfaces/daemon.js';

export const DEFAULT_TASKS: TaskDefinition[] = [
  {
    id: "weekly_hr_review",
    name: "Weekly HR Review",
    trigger: "cron",
    schedule: "0 12 * * 0", // Every Sunday at 12:00 PM
    action: "mcp.call_tool",
    args: {
        server: "hr",
        tool: "perform_weekly_review",
        arguments: {}
    },
    company: undefined,
    prompt: undefined, // Optional
    description: "Performs a deep analysis of logs and experiences from the past week."
  } as TaskDefinition
];
