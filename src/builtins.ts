import { z } from "zod";
import { ContextServer } from "./mcp_servers/context_server.js";

export const change_dir = {
  name: "change_dir",
  description: "Change the current working directory",
  inputSchema: z.object({ path: z.string() }),
  execute: async ({ path }: { path: string }) => {
    try {
      process.chdir(path);
      return `Changed directory to ${process.cwd()}`;
    } catch (e: any) {
      return `Error changing directory: ${e.message}`;
    }
  },
};

export const update_context = {
  name: "update_context",
  description:
    "Update the shared context (goals, constraints, recent changes) for all agents.",
  inputSchema: z.object({
    goal: z.string().optional().describe("Add a new high-level goal."),
    constraint: z.string().optional().describe("Add a new global constraint."),
    change: z
      .string()
      .optional()
      .describe("Log a recent architectural change or decision."),
  }),
  execute: async ({
    goal,
    constraint,
    change,
  }: {
    goal?: string;
    constraint?: string;
    change?: string;
  }) => {
    const cm = new ContextServer();
    const current = await cm.readContext();
    const updates: any = {};
    const logUpdates = [];

    if (goal) {
      if (!current.goals.includes(goal)) {
        updates.goals = [...current.goals, goal];
        logUpdates.push(`Added goal: ${goal}`);
      }
    }
    if (constraint) {
        if (!current.constraints.includes(constraint)) {
            updates.constraints = [...current.constraints, constraint];
            logUpdates.push(`Added constraint: ${constraint}`);
        }
    }
    if (change) {
        updates.recent_changes = [...current.recent_changes, change].slice(-10);
        logUpdates.push(`Logged change: ${change}`);
    }

    if (Object.keys(updates).length > 0) {
        await cm.updateContext(updates);
    }

    return logUpdates.length > 0 ? logUpdates.join("\n") : "No updates made.";
  },
};

export const allBuiltins = [change_dir, update_context];
