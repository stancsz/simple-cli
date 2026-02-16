import { z } from "zod";
import { ContextManager } from "./mcp_servers/context/index.js";

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
    const cm = new ContextManager();
    const updates = [];
    if (goal) {
      await cm.addGoal(goal);
      updates.push(`Added goal: ${goal}`);
    }
    if (constraint) {
      await cm.addConstraint(constraint);
      updates.push(`Added constraint: ${constraint}`);
    }
    if (change) {
      await cm.logChange(change);
      updates.push(`Logged change: ${change}`);
    }
    return updates.length > 0 ? updates.join("\n") : "No updates made.";
  },
};

export const delegate_cli = {
  name: "delegate_cli",
  description: "DEPRECATED: Use specific MCP tools (e.g., aider_chat, aider_edit) instead. Run a CLI command.",
  inputSchema: z.object({
    command: z.string().describe("The CLI command to run."),
    args: z.array(z.string()).optional().describe("Arguments for the command.")
  }),
  execute: async ({ command, args }: { command: string; args?: string[] }) => {
    if (command === "aider") {
      return "Error: delegate_cli for 'aider' is deprecated. Please use 'aider_chat' or 'aider_edit' tools directly.";
    }
    return `Warning: delegate_cli is deprecated. Please use MCP tools if available. Command '${command}' was requested but not executed by this shim.`;
  },
};

export const allBuiltins = [change_dir, update_context, delegate_cli];
