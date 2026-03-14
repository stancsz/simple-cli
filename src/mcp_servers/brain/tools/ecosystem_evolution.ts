import { EpisodicMemory } from "../../../brain/episodic.js";
import { z } from "zod";
import { createLLM } from "../../../llm.js";
import { analyzeEcosystemPatterns } from "./pattern_analysis.js";

export const adjustEcosystemMorphologySchema = z.object({
  agency_statuses: z.array(z.object({
    agency_id: z.string(),
    role: z.string(),
    tasks_assigned: z.number(),
    tasks_failed: z.number(),
    utilization_rate: z.number().describe("0.0 to 1.0"),
    token_efficiency: z.number().describe("0.0 to 1.0, higher is better"),
  })).describe("Current metrics and statuses of child agencies from the Orchestrator.")
});

export type AdjustEcosystemMorphologyInput = z.infer<typeof adjustEcosystemMorphologySchema>;

export interface StructuralDecision {
  action: "spawn" | "merge" | "retire" | "maintain";
  target_agencies: string[]; // empty for spawn
  reasoning: string;
  config?: {
    role?: string;
    resource_limit?: number;
    merge_into?: string; // Target agency id if merging
  };
}

export async function adjustEcosystemMorphology(
  input: AdjustEcosystemMorphologyInput,
  memory: EpisodicMemory
): Promise<StructuralDecision[]> {
  const { agency_statuses } = input;
  const decisions: StructuralDecision[] = [];

  // Query meta-learning insights (from Phase 34 pattern analysis)
  const llm = createLLM();
  let ecosystemInsights;
  try {
    ecosystemInsights = await analyzeEcosystemPatterns(memory, llm);
  } catch (e) {
    console.warn("Could not retrieve ecosystem patterns, falling back to rule-based only.", e);
  }

  // Rule-based algorithm
  const highWorkloadThreshold = 0.85;
  const lowUtilizationThreshold = 0.20;
  const highFailureThreshold = 0.40;
  const lowEfficiencyThreshold = 0.30;

  const roleWorkloads: Record<string, number> = {};
  const activeAgencies: Set<string> = new Set();

  for (const status of agency_statuses) {
    activeAgencies.add(status.agency_id);

    // Track total tasks assigned per role to spot bottlenecks
    if (!roleWorkloads[status.role]) {
      roleWorkloads[status.role] = 0;
    }
    roleWorkloads[status.role] += status.tasks_assigned;

    const failureRate = status.tasks_assigned > 0 ? status.tasks_failed / status.tasks_assigned : 0;

    // Retire conditions: low utilization AND high failure, OR very low efficiency
    if ((status.utilization_rate < lowUtilizationThreshold && failureRate > highFailureThreshold) ||
        status.token_efficiency < lowEfficiencyThreshold) {
      decisions.push({
        action: "retire",
        target_agencies: [status.agency_id],
        reasoning: `Agency ${status.agency_id} (${status.role}) is underperforming (Utilization: ${status.utilization_rate}, Failure Rate: ${failureRate}, Token Efficiency: ${status.token_efficiency}). Retiring.`
      });
      activeAgencies.delete(status.agency_id);
    }
  }

  // Merge conditions: Multiple underutilized agencies of the same role
  const roleGroups: Record<string, string[]> = {};
  for (const status of agency_statuses) {
      if (!activeAgencies.has(status.agency_id)) continue;
      if (!roleGroups[status.role]) roleGroups[status.role] = [];
      roleGroups[status.role].push(status.agency_id);
  }

  for (const [role, agencyIds] of Object.entries(roleGroups)) {
      if (agencyIds.length > 1) {
          const statuses = agency_statuses.filter(s => agencyIds.includes(s.agency_id));
          const allUnderutilized = statuses.every(s => s.utilization_rate < 0.4);
          if (allUnderutilized) {
              const mergeTarget = statuses[0].agency_id;
              const toMerge = statuses.slice(1).map(s => s.agency_id);

              for (const id of toMerge) {
                  decisions.push({
                      action: "merge",
                      target_agencies: [id, mergeTarget],
                      reasoning: `Agencies ${id} and ${mergeTarget} (${role}) are underutilized. Merging into ${mergeTarget}.`,
                      config: { merge_into: mergeTarget }
                  });
                  activeAgencies.delete(id);
              }
          }
      }
  }

  // Spawn conditions: High workload bottleneck
  for (const status of agency_statuses) {
      if (!activeAgencies.has(status.agency_id)) continue;

      if (status.utilization_rate > highWorkloadThreshold && status.tasks_assigned > 5) {
          decisions.push({
              action: "spawn",
              target_agencies: [],
              reasoning: `Agency ${status.agency_id} (${status.role}) is overloaded (Utilization: ${status.utilization_rate}). Spawning a new agency for role ${status.role} to distribute load.`,
              config: { role: status.role, resource_limit: 50000 }
          });
      }
  }

  // If no changes needed
  if (decisions.length === 0) {
      decisions.push({
          action: "maintain",
          target_agencies: [],
          reasoning: "Ecosystem morphology is optimal. No structural changes required."
      });
  }

  // Log to EpisodicMemory
  await memory.store(
    `ecosystem_evolution_${Date.now()}`,
    "Adjust ecosystem morphology based on metrics",
    JSON.stringify(decisions),
    ["brain", "ecosystem_evolution", "morphology"],
    "ecosystem_morphology_decision"
  );

  return decisions;
}
