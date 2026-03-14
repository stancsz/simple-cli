import { EpisodicMemory } from "../src/brain/episodic.js";
import { applyEcosystemInsights } from "../src/mcp_servers/agency_orchestrator/tools/apply_ecosystem_insights.js";
import { update_company_with_ecosystem_insights } from "../src/mcp_servers/company_context/tools/meta_learning_integration.js";
import { assignTaskPredictively } from "../src/mcp_servers/scheduler/tools/task_assignment.js";
import { proposeEcosystemPolicyUpdate } from "../src/mcp_servers/brain/tools/strategy.js";
import { createLLM } from "../src/llm.js";
import * as llmMod from "../src/llm.js";

// A minimal mock of the spawning protocol for the simulation
async function spawnAgency(memory: EpisodicMemory, agencyId: string, profile: any) {
    await memory.store(
        `spawn_${agencyId}`,
        "agency_spawning", // use topic
        JSON.stringify(profile),
        [agencyId, "agency_spawning"],
        "default",
        undefined,
        undefined,
        undefined,
        `spawn_${agencyId}`,
        undefined,
        undefined,
        "autonomous_decision"
    );

    // Initial config
    const config = { max_agents: 3, strategy: "safe", routing_latency_ms: 200, compute_cost: 0.05 };
    await memory.store(
        `swarm_config:${agencyId}`,
        "config",
        JSON.stringify(config),
        [agencyId, "swarm_config"],
        "default",
        undefined,
        undefined,
        undefined,
        `swarm_config:${agencyId}`,
        undefined,
        undefined,
        "swarm_configuration"
    );
}

interface MetricResult {
    task: string;
    agencyId: string;
    durationMs: number;
    tokenUsage: number;
    cost: number;
}

// Function to simulate running a task
async function simulateTaskExecution(memory: EpisodicMemory, task: string, optimized: boolean): Promise<MetricResult> {
    // Determine the optimal agency using predictive assignment
    const assignment = await assignTaskPredictively(task, "high");
    const assignedAgency = assignment.recommended_agency_id;

    // Fetch the agency's current swarm configuration
    const configResults = await memory.recall(`swarm_config:${assignedAgency}`, 1, "default");
    let currentConfig: any = { max_agents: 3, routing_latency_ms: 200, compute_cost: 0.05 };
    if (configResults && configResults.length > 0) {
        const foundMem = configResults.find((m: any) => m.id === `swarm_config:${assignedAgency}`);
        if (foundMem) {
            try {
                currentConfig = JSON.parse((foundMem as any).solution || foundMem.agentResponse || "{}");
            } catch (e) {}
        }
    }

    // Determine simulation metrics based on config parameters
    // Optimization typically reduces routing latency and compute cost, while increasing max agents to handle load faster.
    const latencyBase = currentConfig.routing_latency_ms || 200;
    const maxAgents = currentConfig.max_agents || 3;
    const costFactor = currentConfig.compute_cost || 0.05;

    // A simulated "workload" size
    const taskComplexity = task.length * 10;

    // Duration decreases if we have more agents to parallelize, plus routing latency
    const durationMs = latencyBase + (taskComplexity / Math.max(1, maxAgents));

    // Tokens reflect work done
    const tokenUsage = taskComplexity * 2;

    // Cost reflects efficiency. Optimization might drop the compute_cost factor.
    const cost = tokenUsage * costFactor;

    return {
        task,
        agencyId: assignedAgency,
        durationMs,
        tokenUsage,
        cost
    };
}

export async function runSimulation(mockMemoryInstance?: EpisodicMemory, mockLLMInstance?: any) {
    console.log("=== Phase 35 Ecosystem Optimization Simulation ===");

    const memory = mockMemoryInstance || new EpisodicMemory(process.cwd());

    if (mockLLMInstance) {
        // Assume LLM is properly mocked externally if provided
    }

    const agencies = [
        { id: "agency_alpha", role: "frontend" },
        { id: "agency_beta", role: "backend" },
        { id: "agency_gamma", role: "data" }
    ];

    console.log("1. Spawning child agencies...");
    for (const agency of agencies) {
        await spawnAgency(memory, agency.id, agency);
    }

    const projectTasks = [
        "Develop responsive React landing page",
        "Implement Node.js REST API with authentication",
        "Set up PostgreSQL schema and data migration scripts",
        "Create interactive D3.js dashboard for analytics",
        "Optimize API query performance and caching"
    ];

    console.log("\n2. Running Baseline Project Execution...");
    const baselineMetrics: MetricResult[] = [];
    for (const task of projectTasks) {
        const metric = await simulateTaskExecution(memory, task, false);
        baselineMetrics.push(metric);
    }

    console.log("\n3. Applying Ecosystem Optimizations...");

    // 3a. Brain meta-learning update
    // Note: The LLM should be mocked to return a valid policy update string here.
    const policyResult = await proposeEcosystemPolicyUpdate(memory, mockLLMInstance || createLLM(), { insights: "High routing latency and low agent parallelism causing bottlenecks." });
    console.log("   - Brain proposed new ecosystem policy.");

    // 3b. Company context update
    await update_company_with_ecosystem_insights("company_demo", memory);
    console.log("   - Company context updated with ecosystem insights.");

    // 3c. Agency Orchestrator applies insights to swarms
    const orchResult = await applyEcosystemInsights(memory);
    console.log(`   - Agency Orchestrator applied insights to ${orchResult.changes.length} child agencies.`);


    console.log("\n4. Running Optimized Project Execution...");
    const optimizedMetrics: MetricResult[] = [];
    for (const task of projectTasks) {
        const metric = await simulateTaskExecution(memory, task, true);
        optimizedMetrics.push(metric);
    }

    console.log("\n5. Analysis and Results");

    let totalBaseDuration = 0;
    let totalBaseCost = 0;
    for (const m of baselineMetrics) {
        totalBaseDuration += m.durationMs;
        totalBaseCost += m.cost;
    }

    let totalOptDuration = 0;
    let totalOptCost = 0;
    for (const m of optimizedMetrics) {
        totalOptDuration += m.durationMs;
        totalOptCost += m.cost;
    }

    const durationImprovement = ((totalBaseDuration - totalOptDuration) / totalBaseDuration) * 100;
    const costImprovement = ((totalBaseCost - totalOptCost) / totalBaseCost) * 100;

    console.log(`\nMetrics Comparison:`);
    console.log(`Total Duration: ${totalBaseDuration.toFixed(2)}ms (Base) -> ${totalOptDuration.toFixed(2)}ms (Optimized) | Improvement: ${durationImprovement.toFixed(2)}%`);
    console.log(`Total Cost: $${totalBaseCost.toFixed(4)} (Base) -> $${totalOptCost.toFixed(4)} (Optimized) | Improvement: ${costImprovement.toFixed(2)}%`);

    return {
        baselineMetrics,
        optimizedMetrics,
        durationImprovement,
        costImprovement
    };
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runSimulation().catch(console.error);
}
