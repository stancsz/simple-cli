import { AgencyDescriptor, CrossAgencyTask } from "../types.js";
import { discoverAgencies, delegateTask } from "../../federation/tools.js";
import { AgencyProfile, TaskDelegationRequest } from "../../federation/protocol.js";

// Mock storage for task monitoring
const taskStorage: Record<string, CrossAgencyTask> = {};

// We use the Brain and PolicyEngine via simple abstractions or direct MCP client calls
// For this server, we will simulate the connection to the Brain/Policy Engine if they aren't directly imported.
import { EpisodicMemory } from "../../../brain/episodic.js";
import { CorporatePolicy } from "../../../brain/schemas.js";

// Utility to get episodic memory
const getEpisodicMemory = () => {
  return new EpisodicMemory();
};

export const discoverPartnerAgencies = async (capability_required?: string): Promise<AgencyDescriptor[]> => {
  try {
    const profiles: AgencyProfile[] = await discoverAgencies(capability_required);
    return profiles.map(p => ({
      agency_id: p.agency_id,
      endpoint: p.endpoint,
      capabilities: p.capabilities,
      status: p.status
    }));
  } catch (error: any) {
    console.error("Error discovering partner agencies:", error);
    return [];
  }
};

export interface DelegateTaskArgs {
  task_id: string;
  agency_id: string;
  task_description: string;
  capability_required?: string;
}

export const delegateCrossAgencyTask = async (args: DelegateTaskArgs): Promise<CrossAgencyTask> => {
  const { task_id, agency_id, task_description, capability_required } = args;
  const now = Date.now();

  const task: CrossAgencyTask = {
    task_id,
    target_agency: agency_id,
    description: task_description,
    status: "pending",
    created_at: now,
    updated_at: now
  };

  taskStorage[task_id] = task;

  try {
    // 1. Policy Constraint Check
    // In a full implementation, we would query the Policy Engine for data sharing rules / budget.
    // Here we simulate checking a budget limit from CorporatePolicy (if available in brain)
    const episodic = getEpisodicMemory();
    const strategyContext = await episodic.recall("CorporatePolicy metadata constraints", 1);

    // Simulate a policy constraint check
    const isBudgetExceeded = false; // Mocking policy check
    if (isBudgetExceeded) {
      task.status = "rejected";
      task.error = "Policy violation: budget exceeded.";
      task.updated_at = Date.now();
      return task;
    }

    // 2. Delegate using Federation Protocol
    const request: TaskDelegationRequest = {
      task_id,
      agency_id,
      task_description,
      capability_required
    };

    const response = await delegateTask(request, process.env.FEDERATION_SECRET || "default-secret");

    if (response.status === "completed" || response.status === "accepted") {
       task.status = response.status === "completed" ? "completed" : "in_progress";
       task.result = response.result;
    } else {
       task.status = response.status as any;
       task.error = response.error;
    }
    task.updated_at = Date.now();

    // 3. Log Coordination Pattern to Brain
    try {
      await episodic.store(
        `meta_orchestrator_${task_id}`,
        `Cross-Agency Delegation: ${task_description}\nTarget: ${agency_id}\nCapability: ${capability_required || 'None'}`,
        `Status: ${task.status}\nResult: ${JSON.stringify(task.result)}\nError: ${task.error || 'None'}`,
        [agency_id],
        "meta_orchestrator"
      );
    } catch (e) {
      console.error("Failed to log coordination pattern to Brain", e);
    }

    return task;
  } catch (error: any) {
    task.status = "failed";
    task.error = error.message;
    task.updated_at = Date.now();
    return task;
  }
};

export const monitorCrossAgencyProgress = async (task_ids: string[]): Promise<CrossAgencyTask[]> => {
  return task_ids.map(id => {
    if (taskStorage[id]) {
      return taskStorage[id];
    }
    return {
      task_id: id,
      target_agency: "unknown",
      description: "Task not found in local monitoring storage",
      status: "failed",
      error: "Not found",
      created_at: 0,
      updated_at: 0
    };
  });
};
