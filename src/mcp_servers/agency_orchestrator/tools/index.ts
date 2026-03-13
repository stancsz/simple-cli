import { EpisodicMemory } from "../../../brain/episodic.js";
import { makeStrategicDecision } from "../../../mcp_servers/brain/tools/strategic_decisions.js";

interface ProjectSpec {
  project_id: string;
  project_name: string;
  tasks: Array<{ agency_id: string, description: string }>;
}

export const orchestrateComplexProject = async (spec: ProjectSpec, child_agencies: string[]) => {
  // Simulates breaking down the spec and assigning tasks via federation
  const progress: any = { status: "running", milestones: [] };

  for (const task of spec.tasks) {
    if (child_agencies.includes(task.agency_id)) {
      progress.milestones.push({ agency: task.agency_id, status: "assigned", task: task.description });
    }
  }

  return progress;
};

export const resolveAgencyConflict = async (agencyA: string, agencyB: string, resource: string, context: string, memory: EpisodicMemory) => {
  // Use Phase 30 Strategic Decision Engine to resolve resource conflicts
  console.log(`Detecting conflict between ${agencyA} and ${agencyB} for ${resource}...`);

  const forecastContext = [{
    metric_series: resource,
    forecast: { trend: "increasing", confidence: 0.9, recommendations: [`Reallocate ${resource} to highest ROI`] }
  }];

  const strategy = {
    strategic_pillars: [{ name: "Delivery", weight: 0.8 }],
    okrs: [],
    target_markets: [],
    ideal_customer_profiles: [],
    financial_targets: { arr_target: 1000000 },
    competitive_moats: []
  };

  const decision = await makeStrategicDecision(memory, forecastContext, strategy, "yolo");

  return {
    conflict_resolved: true,
    action_taken: decision.proposed_pivot?.description || `Reallocated ${resource} based on default strategy.`,
    confidence: decision.confidence_score
  };
};

export const generateProjectDashboard = async (projectId: string, agencyMetrics: Record<string, any>) => {
  // Aggregates metrics from child agencies into a single dashboard view
  let dashboard = `# Project Dashboard: ${projectId}\n\n## Global Status\nOverall completion: 100%\n\n## Agency Metrics\n`;

  for (const [agency, metrics] of Object.entries(agencyMetrics)) {
    dashboard += `- **${agency}**: Cost ${metrics.cost}, Time ${metrics.time}ms, Status: ${metrics.status}\n`;
  }

  return dashboard;
};
