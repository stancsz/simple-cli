import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { CorporatePolicy } from "../../../brain/schemas.js";
import { randomUUID } from "crypto";
import { dirname } from "path";

// Initialize Episodic Memory (singleton-ish for this module)
// In a real server, this would be passed in or resolved via DI.
const baseDir = process.env.JULES_AGENT_DIR ? dirname(process.env.JULES_AGENT_DIR) : process.cwd();
const episodicInstance = new EpisodicMemory(baseDir);

// Helper to get the latest active policy
export async function getLatestPolicy(episodic: EpisodicMemory, company: string = "default"): Promise<CorporatePolicy | null> {
    const memories = await episodic.recall("corporate_policy", 10, company, "corporate_policy");
    if (!memories || memories.length === 0) return null;

    // Parse and sort
    const policies = memories
        .map(m => {
            try {
                return JSON.parse(m.agentResponse) as CorporatePolicy;
            } catch {
                return null;
            }
        })
        .filter((p): p is CorporatePolicy => p !== null && p.isActive)
        .sort((a, b) => b.version - a.version); // Descending version

    return policies.length > 0 ? policies[0] : null;
}

export async function updateOperatingPolicyLogic(
    episodic: EpisodicMemory,
    name: string,
    description: string,
    min_margin: number,
    risk_tolerance: "low" | "medium" | "high",
    max_agents_per_swarm: number,
    company?: string
) {
    const companyId = company || "default";
    const currentPolicy = await getLatestPolicy(episodic, companyId);

    const newVersion = currentPolicy ? currentPolicy.version + 1 : 1;
    const previousId = currentPolicy ? currentPolicy.id : undefined;

    const newPolicy: CorporatePolicy = {
        id: randomUUID(),
        version: newVersion,
        name,
        description,
        parameters: {
            min_margin,
            risk_tolerance,
            max_agents_per_swarm
        },
        isActive: true,
        timestamp: Date.now(),
        author: "C-Suite Agent", // In a real system, this would come from the session
        previous_version_id: previousId
    };

    // Store in Brain
    // We store the policy object as the "solution" (agentResponse) so it can be parsed back.
    // The "request" (userPrompt) is the intent.
    await episodic.store(
        `policy_update_v${newVersion}`,
        `Update operating policy to version ${newVersion}: ${description}`,
        JSON.stringify(newPolicy),
        [],
        companyId,
        undefined,
        undefined,
        undefined,
        newPolicy.id,
        0,
        0,
        "corporate_policy"
    );

    return newPolicy;
}

export function registerPolicyEngineTools(server: McpServer) {
    server.tool(
        "update_operating_policy",
        "Updates the operating policy for swarms (e.g., min_margin, risk_tolerance). Creates a new version.",
        {
            name: z.string().default("Global Operating Policy").describe("Name of the policy."),
            description: z.string().default("Standard operating parameters for all swarms.").describe("Description of the policy."),
            min_margin: z.number().min(0).max(1).default(0.2).describe("Minimum profit margin (0.0 - 1.0)."),
            risk_tolerance: z.enum(["low", "medium", "high"]).default("medium").describe("Risk tolerance level."),
            max_agents_per_swarm: z.number().min(1).default(5).describe("Maximum number of agents per swarm."),
            company: z.string().optional().describe("The company/client identifier for namespacing.")
        },
        async ({ name, description, min_margin, risk_tolerance, max_agents_per_swarm, company }) => {
            const newPolicy = await updateOperatingPolicyLogic(
                episodicInstance,
                name,
                description,
                min_margin,
                risk_tolerance,
                max_agents_per_swarm,
                company
            );

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        status: "success",
                        message: `Policy updated to version ${newPolicy.version}`,
                        policy: newPolicy
                    }, null, 2)
                }]
            };
        }
    );

    server.tool(
        "get_active_policy",
        "Retrieves the currently active operating policy.",
        {
            company: z.string().optional().describe("The company/client identifier for namespacing.")
        },
        async ({ company }) => {
            const policy = await getLatestPolicy(episodicInstance, company || "default");
            if (!policy) {
                return {
                    content: [{ type: "text", text: "No active policy found." }]
                };
            }
            return {
                content: [{ type: "text", text: JSON.stringify(policy, null, 2) }]
            };
        }
    );

    server.tool(
        "rollback_operating_policy",
        "Rolls back the operating policy to the previous version.",
        {
            company: z.string().optional().describe("The company/client identifier for namespacing.")
        },
        async ({ company }) => {
            const companyId = company || "default";
            const currentPolicy = await getLatestPolicy(episodicInstance, companyId);

            if (!currentPolicy) {
                return {
                    content: [{ type: "text", text: "No active policy found to rollback." }],
                    isError: true
                };
            }

            if (!currentPolicy.previous_version_id) {
                 return {
                    content: [{ type: "text", text: "Current policy is the first version. Cannot rollback." }],
                    isError: true
                };
            }

            // Find the previous policy
            // We search by ID directly? episodic.recall is semantic search.
            // But we can search by "type: corporate_policy" and filter in memory since volume is low.
            // Or use getRecentEpisodes if available.
            // Let's use recall with type and filter.
            const memories = await episodicInstance.recall("corporate_policy", 50, companyId, "corporate_policy");
             const previousPolicyMem = memories.find(m => m.id === currentPolicy.previous_version_id);

             if (!previousPolicyMem) {
                 return {
                     content: [{ type: "text", text: `Previous policy version (ID: ${currentPolicy.previous_version_id}) not found in memory.` }],
                     isError: true
                 };
             }

             const previousPolicy = JSON.parse(previousPolicyMem.agentResponse) as CorporatePolicy;

             // Create a NEW policy entry that is a copy of the old one, but with a new version number
             // This preserves the history (rollback is a forward action).
             const newVersion = currentPolicy.version + 1;

             const newPolicy: CorporatePolicy = {
                 ...previousPolicy,
                 id: randomUUID(),
                 version: newVersion,
                 timestamp: Date.now(),
                 previous_version_id: currentPolicy.id,
                 isActive: true,
                 description: `Rollback to version ${previousPolicy.version}: ${previousPolicy.description}`
             };

            await episodicInstance.store(
                `policy_rollback_v${newVersion}`,
                `Rollback policy to version ${previousPolicy.version}`,
                JSON.stringify(newPolicy),
                [],
                companyId,
                undefined,
                undefined,
                undefined,
                newPolicy.id,
                0,
                0,
                "corporate_policy"
            );

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        status: "success",
                        message: `Policy rolled back to version ${previousPolicy.version} (new version ${newVersion})`,
                        policy: newPolicy
                    }, null, 2)
                }]
            };
        }
    );
}
