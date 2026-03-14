import { createLLM } from "../../../llm.js";
import { EpisodicMemory } from "../../../brain/episodic.js";

/**
 * Automatically adjusts swarm parameters for child agencies based on meta-learning findings.
 * Fetches the latest 'ecosystem_policy' from the Brain, interprets changes via LLM,
 * and updates swarm configurations for targeted agencies.
 */
export async function applyEcosystemInsights(memory: EpisodicMemory): Promise<{ status: string, changes: any[] }> {
    const changesApplied: any[] = [];

    // 1. Query for the latest ecosystem_policy
    // EpisodicMemory.recall(topic, limit, namespace, type)
    const policyResults = await memory.recall("ecosystem_policy", 1, "default", "ecosystem_policy");

    if (!policyResults || policyResults.length === 0) {
        return { status: "no_policy_found", changes: [] };
    }

    const latestPolicy = policyResults[0];
    const latestPolicyStr = (latestPolicy as any).solution || latestPolicy.agentResponse || JSON.stringify(latestPolicy);

    // 2. Parse the policy using an LLM to extract target agencies and parameters
    const llm = createLLM();
    const prompt = `
    You are the Ecosystem Optimization Engine.
    Review the following ecosystem policy update and extract the target agencies and the swarm parameter changes.

    POLICY UPDATE:
    ${latestPolicyStr}

    OUTPUT FORMAT:
    Return ONLY a JSON object with this schema:
    {
        "target_agencies": ["agency_id_1", "agency_id_2"] or "all",
        "parameters": {
            "scaling_threshold": 0.8,
            "max_agents": 5,
            // any other numerical/boolean config params mentioned
        }
    }
    If the policy targets all spawned child agencies, set "target_agencies" to "all".
    `;

    const llmResponse = await llm.generate(prompt, []);
    let parsedPolicy: any;
    try {
        let jsonStr = llmResponse.message || llmResponse.thought || "";
        jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
        const firstBrace = jsonStr.indexOf("{");
        const lastBrace = jsonStr.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) {
            jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }
        parsedPolicy = JSON.parse(jsonStr);
    } catch (e: any) {
        throw new Error(`Failed to parse LLM interpretation of policy: ${e.message}`);
    }

    if (!parsedPolicy.target_agencies || !parsedPolicy.parameters || Object.keys(parsedPolicy.parameters).length === 0) {
        return { status: "no_actionable_parameters", changes: [] };
    }

    let agenciesToUpdate: string[] = [];

    if (parsedPolicy.target_agencies === "all" || (Array.isArray(parsedPolicy.target_agencies) && parsedPolicy.target_agencies.includes("all"))) {
        // If "all", we discover all spawned child agencies.
        const spawnResults = await memory.recall("agency_spawning", 50, "default", "autonomous_decision");

        if (spawnResults && spawnResults.length > 0) {
            spawnResults.forEach((mem: any) => {
                if (mem.tags && Array.isArray(mem.tags)) {
                    const idTag = mem.tags.find((t: string) => t.startsWith("agency_"));
                    if (idTag && !agenciesToUpdate.includes(idTag)) {
                        agenciesToUpdate.push(idTag);
                    }
                }
            });
        }
    } else if (Array.isArray(parsedPolicy.target_agencies)) {
        agenciesToUpdate = parsedPolicy.target_agencies;
    }

    // 3. For each target agency, fetch, merge, and store config
    for (const agencyId of agenciesToUpdate) {
        const configId = `swarm_config:${agencyId}`;
        let currentConfig = {};

        const configResults = await memory.recall(configId, 1, "default");

        if (configResults && configResults.length > 0) {
            const foundMem = configResults.find((m: any) => m.id === configId);
            if (foundMem) {
                try {
                    currentConfig = JSON.parse((foundMem as any).solution || foundMem.agentResponse || "{}");
                } catch (e) {
                    // Ignore parsing errors, assume empty config
                }
            }
        }

        // Merge parameters
        const mergedConfig = { ...currentConfig, ...parsedPolicy.parameters };

        // Store back to Brain using EpisodicMemory.store
        // store(id, request, solution, tags, namespace, ... type)
        await memory.store(
            configId,
            "swarm_configuration",
            JSON.stringify(mergedConfig),
            [agencyId, "swarm_config", "ecosystem_insights"],
            "default",
            undefined,
            undefined,
            undefined,
            configId,
            undefined,
            undefined,
            "swarm_configuration"
        );

        changesApplied.push({
            agency_id: agencyId,
            previous_config: currentConfig,
            new_config: mergedConfig
        });
    }

    return {
        status: "success",
        changes: changesApplied
    };
}
