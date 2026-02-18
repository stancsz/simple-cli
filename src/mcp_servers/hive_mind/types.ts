import { Engine, Context } from "../../engine/orchestrator.js";

export interface Agent {
  id: string;
  role: string;
  engine: Engine;
  context: Context;
  status: "idle" | "busy" | "offline";
  companyId?: string;
  capabilities: string[];
}

export interface Task {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  assignedTo?: string; // Agent ID
  dependencies: string[]; // Task IDs
  result?: string;
}

export interface Workflow {
  id: string;
  steps: Task[];
  status: "pending" | "active" | "completed" | "failed";
  companyId?: string;
}

export interface Bid {
  agentId: string;
  taskId: string;
  cost: number; // Estimated token cost or time
  confidence: number; // 0-1
  proposal: string;
}
