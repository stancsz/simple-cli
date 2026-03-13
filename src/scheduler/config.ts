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
  } as TaskDefinition,
  {
    id: "weekly_ecosystem_analysis",
    name: "Weekly Ecosystem Analysis",
    trigger: "cron",
    schedule: "0 13 * * 0", // Every Sunday at 1:00 PM
    action: "mcp.call_tool",
    args: {
        server: "brain",
        tool: "analyze_ecosystem_patterns",
        arguments: {}
    },
    company: undefined,
    description: "Periodically analyzes ecosystem patterns for global meta-learning and policy optimization."
  } as TaskDefinition
];
