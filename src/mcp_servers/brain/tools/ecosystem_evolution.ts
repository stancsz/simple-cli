import { EpisodicMemory } from "../../../brain/episodic.js";
import { z } from "zod";
import { createLLM } from "../../../llm.js";
import { analyzeEcosystemPatterns } from "./pattern_analysis.js";
import { monitorMarketSignals } from "./market_shock.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "path";

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
  rationale: string;
  expected_impact?: string;
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
  const llm = createLLM();

  // 1. Query meta-learning insights (from Phase 34 pattern analysis)
  let ecosystemInsights;
  try {
    ecosystemInsights = await analyzeEcosystemPatterns(memory, llm);
  } catch (e) {
    console.warn("Could not retrieve ecosystem patterns.", e);
    ecosystemInsights = { analysis: "No recent ecosystem patterns found." };
  }

  // 2. Monitor market signals
  let marketSignals;
  try {
    marketSignals = await monitorMarketSignals();
  } catch (e) {
    console.warn("Could not retrieve market signals.", e);
    marketSignals = { status: "unknown" };
  }

  // 3. Query Health Monitor MCP for performance KPIs
  let healthMetrics: any = { status: "unknown" };
  try {
    const healthMonitorPath = join(process.cwd(), "dist/mcp_servers/health_monitor/index.js");
    const transport = new StdioClientTransport({
      command: "node",
      args: [healthMonitorPath],
    });
    const mcpClient = new Client({ name: "brain-morphology-client", version: "1.0.0" }, { capabilities: {} });
    await mcpClient.connect(transport);

    const healthResult = await mcpClient.callTool({
      name: "get_ecosystem_health",
      arguments: {}
    });

    if (healthResult && Array.isArray(healthResult.content) && healthResult.content.length > 0 && typeof healthResult.content[0] === 'object' && healthResult.content[0] !== null && 'text' in healthResult.content[0]) {
      try {
        healthMetrics = JSON.parse((healthResult.content[0] as any).text);
      } catch (err) {
        healthMetrics = { raw: (healthResult.content[0] as any).text };
      }
    }
    await mcpClient.close();
  } catch (e) {
    console.warn("Could not retrieve health metrics from Health Monitor MCP.", e);
  }

  // 4. Construct prompt for LLM analysis
  const prompt = `
You are the Brain of an autonomous multi-agency ecosystem.
Your task is to analyze the following data and propose structural changes (spawn, merge, retire, maintain) to the ecosystem.

### Current Agency Statuses:
${JSON.stringify(agency_statuses, null, 2)}

### Ecosystem Meta-Learning Patterns:
${JSON.stringify(ecosystemInsights, null, 2)}

### Market Signals:
${JSON.stringify(marketSignals, null, 2)}

### Ecosystem Health Metrics:
${JSON.stringify(healthMetrics, null, 2)}

Evaluate the metrics and signals to decide if agencies should be spawned (for overload/bottlenecks), merged (underutilized of same role), retired (failing/inefficient), or maintained (if healthy).

Output a valid JSON array of objects representing your decisions. Each object MUST conform exactly to the following structure:
{
  "action": "spawn" | "merge" | "retire" | "maintain",
  "target_agencies": ["agency_id_1", "agency_id_2"], // Empty array for spawn
  "rationale": "Detailed explanation of why this action is taken.",
  "expected_impact": "What this change is expected to achieve.",
  "config": { // Optional, required for spawn or merge
    "role": "role_name", // For spawn
    "resource_limit": 50000, // For spawn
    "merge_into": "target_agency_id" // For merge
  }
}

Return ONLY the JSON array, with no markdown formatting or extra text.
`;

  let decisions: StructuralDecision[] = [];
  try {
    const response = await llm.generate(
      "You are the structural orchestrator. Always output valid JSON representing the decisions.",
      [{ role: "user", content: prompt }]
    );

    let rawOutput = response.raw.trim();
    if (rawOutput.startsWith("```json")) rawOutput = rawOutput.substring(7);
    if (rawOutput.endsWith("```")) rawOutput = rawOutput.substring(0, rawOutput.length - 3);

    decisions = JSON.parse(rawOutput.trim());

    // Fallback if empty
    if (!Array.isArray(decisions) || decisions.length === 0) {
      decisions = [{
        action: "maintain",
        target_agencies: [],
        rationale: "LLM provided no decisions, defaulting to maintain.",
        expected_impact: "System remains in current state."
      }];
    }
  } catch (e) {
    console.error("Failed to parse LLM decisions, falling back to maintain.", e);
    decisions = [{
      action: "maintain",
      target_agencies: [],
      rationale: "Error analyzing data, defaulting to maintain.",
      expected_impact: "System remains in current state."
    }];
  }

  // 5. Execute structural decisions via Agency Orchestrator MCP
  const orchestratorPath = join(process.cwd(), "dist/mcp_servers/agency_orchestrator/index.js");
  const executionResults: any[] = [];

  try {
    const orchestratorTransport = new StdioClientTransport({
      command: "node",
      args: [orchestratorPath],
    });
    const orchestratorClient = new Client({ name: "brain-orchestrator-client", version: "1.0.0" }, { capabilities: {} });
    await orchestratorClient.connect(orchestratorTransport);

    for (const decision of decisions) {
      if (decision.action === "maintain") continue;

      try {
        let result;
        if (decision.action === "spawn" && decision.config?.role && decision.config?.resource_limit) {
          result = await orchestratorClient.callTool({
            name: "spawn_child_agency",
            arguments: {
              role: decision.config.role,
              initial_context: `Spawned based on ecosystem evolution: ${decision.rationale}`,
              resource_limit: decision.config.resource_limit,
              swarm_config: (decision.config as any).swarm_config || {} // Ensure valid type casting if defined
            }
          });
        } else if (decision.action === "merge" && decision.target_agencies.length >= 1 && decision.config?.merge_into) {
          const sourceAgencyId = decision.target_agencies.find(id => id !== decision.config?.merge_into) || decision.target_agencies[0];
          result = await orchestratorClient.callTool({
            name: "merge_child_agencies",
            arguments: {
              source_agency_id: sourceAgencyId,
              target_agency_id: decision.config.merge_into
            }
          });
        } else if (decision.action === "retire" && decision.target_agencies.length > 0) {
          for (const target of decision.target_agencies) {
            const retireResult = await orchestratorClient.callTool({
              name: "retire_child_agency",
              arguments: { agency_id: target }
            });
            executionResults.push({ action: "retire", target, result: retireResult });
          }
          continue; // Handled all targets, skip generic push
        }

        if (result) {
          executionResults.push({ action: decision.action, result });
        }
      } catch (err: any) {
        console.warn(`Failed to execute structural decision ${decision.action}:`, err.message);
        executionResults.push({ action: decision.action, error: err.message });
      }
    }

    await orchestratorClient.close();
  } catch (err: any) {
    console.warn("Could not connect to Agency Orchestrator MCP to execute structural decisions.", err.message);
  }

  // 6. Log to EpisodicMemory
  await memory.store(
    `ecosystem_evolution_${Date.now()}`,
    "Adjust ecosystem morphology based on metrics, market signals, and meta-learning",
    JSON.stringify({ decisions, execution_results: executionResults }),
    ["brain", "ecosystem_evolution", "morphology"],
    "ecosystem_morphology_proposal"
  );

  return decisions;
}
