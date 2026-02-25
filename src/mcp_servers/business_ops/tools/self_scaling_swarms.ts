import { getLinearClient } from "../linear_service.js";
import { MCP } from "../../../mcp.js";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export interface WorkloadMetrics {
    openIssues: number;
    highPriorityIssues: number; // Priority 1 (Urgent) + 2 (High)
    urgentIssues: number; // Priority 1
    lastActivity?: Date;
}

export async function calculate_workload(projectId: string): Promise<WorkloadMetrics> {
    const client = getLinearClient();

    const issues = await client.issues({
        filter: {
            project: { id: { eq: projectId } },
            state: { type: { in: ["started", "unstarted"] } }
        }
    });

    let openIssues = 0;
    let highPriorityIssues = 0;
    let urgentIssues = 0;
    let lastUpdatedAt = new Date(0);

    for (const issue of issues.nodes) {
        openIssues++;
        if (issue.priority === 1) {
            urgentIssues++;
            highPriorityIssues++;
        } else if (issue.priority === 2) {
            highPriorityIssues++;
        }

        if (issue.updatedAt > lastUpdatedAt) {
            lastUpdatedAt = issue.updatedAt;
        }
    }

    return {
        openIssues,
        highPriorityIssues,
        urgentIssues,
        lastActivity: lastUpdatedAt
    };
}

interface ScalingRule {
    condition: string;
    action: string;
    count: number;
    role: string;
    priority: number;
}

interface ScalingConfig {
    rules: ScalingRule[];
    max_agents_per_project: number;
    min_agents_per_project: number;
    scale_down_inactive_hours: number;
}

export async function scale_agents_for_project(projectId: string, metrics?: WorkloadMetrics) {
    if (!metrics) {
        metrics = await calculate_workload(projectId);
    }

    const configPath = join(process.cwd(), ".agent", "scaling_rules.json");
    let config: ScalingConfig;
    if (existsSync(configPath)) {
        config = JSON.parse(await readFile(configPath, "utf-8"));
    } else {
        config = {
            rules: [],
            max_agents_per_project: 5,
            min_agents_per_project: 0,
            scale_down_inactive_hours: 48
        };
    }

    const logs: string[] = [];
    logs.push(`Analyzing workload for project ${projectId}: ${JSON.stringify(metrics)}`);

    const mcp = new MCP();
    await mcp.init();

    const brainClient = mcp.getClient("brain");
    const swarmClient = mcp.getClient("swarm");

    if (!brainClient) {
        throw new Error("Brain MCP client not available.");
    }

    // --- RECONCILIATION LOGIC ---
    // 1. Get Assigned Agents from Brain
    const queryResult = await brainClient.callTool({
        name: "brain_query",
        arguments: {
            query: `Active Agent spawned for Project: ${projectId}`
        }
    });

    const recordedAgentIds = new Set<string>();
    if (queryResult.content && Array.isArray(queryResult.content)) {
        for (const item of queryResult.content) {
            if (item.type === 'text') {
                const match = item.text.match(/Active Agent: ([^\s]+) for Project: ([^\s]+)/);
                if (match && match[2] === projectId) {
                    recordedAgentIds.add(match[1]);
                }
            }
        }
    }
    logs.push(`Brain records agents: ${Array.from(recordedAgentIds).join(", ")}`);

    // 2. Get Running Agents from Swarm
    const runningAgentIds = new Set<string>();
    if (swarmClient) {
        try {
            const listResult = await swarmClient.callTool({ name: "list_agents", arguments: {} });
            const agents = JSON.parse(((listResult as any).content[0] as any).text);
            agents.forEach((a: any) => runningAgentIds.add(a.id));
        } catch (e) {
            logs.push("Could not list Swarm agents.");
        }
    }
    logs.push(`Swarm running agents: ${Array.from(runningAgentIds).join(", ")}`);

    // 3. Determine Actual Active Agents (Intersection)
    const activeAgentsForProject: string[] = [];
    for (const id of recordedAgentIds) {
        if (runningAgentIds.has(id)) {
            activeAgentsForProject.push(id);
        } else {
            // Stale record in Brain (Agent died/terminated externally)
            // We should ideally clean this up from Brain, but brain_maintenance handles that or we ignore.
            logs.push(`Agent ${id} is in Brain but not in Swarm (stale). Ignoring.`);
        }
    }
    const currentCount = activeAgentsForProject.length;
    logs.push(`Verified active agents: ${currentCount}`);

    // --- DECISION LOGIC ---
    let desiredAgents = config.min_agents_per_project;
    const context = {
        open_high_priority_issues: metrics.highPriorityIssues,
        open_urgent_issues: metrics.urgentIssues,
        open_issues: metrics.openIssues
    };

    for (const rule of config.rules) {
        try {
            const conditionMet = new Function(...Object.keys(context), `return ${rule.condition};`)(...Object.values(context));
            if (conditionMet) {
                if (rule.action === "ensure_minimum_agents") {
                    desiredAgents = Math.max(desiredAgents, rule.count);
                } else if (rule.action === "add_agents") {
                    desiredAgents += rule.count;
                }
            }
        } catch (e) {
            logs.push(`Failed to evaluate rule: ${rule.condition}`);
        }
    }

    desiredAgents = Math.min(desiredAgents, config.max_agents_per_project);

    if (metrics.lastActivity) {
        const hoursInactive = (Date.now() - metrics.lastActivity.getTime()) / (1000 * 60 * 60);
        if (hoursInactive > config.scale_down_inactive_hours) {
            desiredAgents = Math.max(0, desiredAgents - 1);
            logs.push(`Project inactive for ${hoursInactive.toFixed(1)}h. Reducing desired agents.`);
        }
    }

    logs.push(`Desired agents: ${desiredAgents}. Diff: ${desiredAgents - currentCount}`);

    // --- ACTION LOGIC ---
    const diff = desiredAgents - currentCount;

    if (diff > 0) {
        for (let i = 0; i < diff; i++) {
            logs.push("Spawning new agent...");
            if (swarmClient) {
                try {
                     const role = config.rules.find(r => r.role)?.role || "Developer";
                     // We pass projectId as company_id
                     const spawnResult = await swarmClient.callTool({
                         name: "spawn_subagent",
                         arguments: {
                             role: role,
                             task: `Assist with high priority issues on project ${projectId}`,
                             parent_agent_id: "business_ops_scaler",
                             company_id: projectId
                         }
                     });

                     // Parse Agent ID from spawn result
                     const spawnData = JSON.parse(((spawnResult as any).content[0] as any).text);
                     const newAgentId = spawnData.agent_id;

                     if (newAgentId) {
                        await brainClient.callTool({
                            name: "brain_store",
                            arguments: {
                                memory: `Active Agent: ${newAgentId} for Project: ${projectId}`,
                                type: "agent_assignment",
                                tags: ["project_agent", projectId, newAgentId]
                            }
                        });
                        logs.push(`Agent ${newAgentId} spawned and recorded.`);
                     }
                } catch (e: any) {
                    logs.push(`Failed to spawn agent: ${e.message}`);
                }
            } else {
                logs.push("Swarm client not available. Cannot spawn.");
            }
        }
    } else if (diff < 0) {
        const toTerminate = Math.abs(diff);
        logs.push(`Terminating ${toTerminate} agents...`);
        for (let i = 0; i < toTerminate; i++) {
            const agentId = activeAgentsForProject.pop();
            if (agentId && swarmClient) {
                try {
                    await swarmClient.callTool({
                        name: "terminate_agent",
                        arguments: { agent_id: agentId }
                    });
                    logs.push(`Terminated agent ${agentId}.`);
                    // We don't delete from Brain explicitly here, next reconciliation will see it as stale.
                    // Or we could store a "termination" memory to negate it.
                } catch (e: any) {
                    logs.push(`Failed to terminate agent ${agentId}: ${e.message}`);
                }
            }
        }
    }

    return {
        metrics,
        desiredAgents,
        activeAgents: currentCount,
        logs
    };
}
