import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { CorporatePolicy } from "../../../brain/schemas.js";
import { createLLM } from "../../../llm.js";
import { dirname } from "path";
import { MCP } from "../../../mcp.js";
import * as crypto from "crypto";

// Initialize Episodic Memory (singleton-ish for this module)
const baseDir = process.env.JULES_AGENT_DIR ? dirname(process.env.JULES_AGENT_DIR) : process.cwd();
const episodic = new EpisodicMemory(baseDir);

export function registerContractNegotiationTools(server: McpServer) {
    server.tool(
        "contract_negotiation_simulation",
        "Simulate a contract negotiation using a multi-agent swarm.",
        {
            proposal_summary: z.string().describe("The draft proposal to negotiate."),
            client_context: z.object({
                budget: z.number().optional().describe("Client's budget."),
                industry: z.string().optional().describe("Client's industry."),
                priorities: z.array(z.string()).optional().describe("Client's priorities.")
            }).describe("Context about the client including budget, industry, and priorities.")
        },
        async ({ proposal_summary, client_context }) => {
            try {
                await episodic.init();

                const mcp = new MCP();
                await mcp.init();

                // Fetch active corporate policy via the get_active_policy tool from the Brain MCP (or business_ops if that's where it runs, but instruction says brain, though it's registered in business_ops. Actually the server doesn't matter much if we have the client. We'll try brain first, fallback to business_ops)
                let policyStr = "None";
                try {
                    const brainClient = mcp.getClient("brain");
                    if (brainClient) {
                        const policyRes = await brainClient.callTool({ name: "get_active_policy", arguments: {} });
                        if (policyRes && policyRes.content && policyRes.content[0].text) {
                            const parsedPolicy = JSON.parse(policyRes.content[0].text);
                            policyStr = JSON.stringify(parsedPolicy.parameters || parsedPolicy);
                        }
                    }
                } catch (e) {
                    // Fallback to business_ops if brain doesn't have it
                    try {
                        const opsClient = mcp.getClient("business_ops");
                        if (opsClient) {
                            const policyRes = await opsClient.callTool({ name: "get_active_policy", arguments: {} });
                            if (policyRes && policyRes.content && policyRes.content[0].text) {
                                const parsedPolicy = JSON.parse(policyRes.content[0].text);
                                policyStr = JSON.stringify(parsedPolicy.parameters || parsedPolicy);
                            }
                        }
                    } catch (e2) {
                        console.warn("Failed to fetch active policy:", e2);
                    }
                }

                const clientContextStr = JSON.stringify(client_context);

                // Query Brain for past negotiation patterns
                const pastPatterns = await episodic.recall("swarm_negotiation_pattern", 3, "default", "negotiation_pattern");
                let pastPatternsStr = "None";
                if (pastPatterns && pastPatterns.length > 0) {
                    pastPatternsStr = pastPatterns.map((p: any) => p.agentResponse).join("\n\n");
                }

                // Prepare negotiation task description for Swarm orchestrator
                const taskDescription = `
                    Simulate a 3-round contract negotiation using specialized sub-agents.
                    Agents involved:
                    1. Sales Agent: Maximize Total Contract Value (TCV). Use past patterns for strategy: ${pastPatternsStr}.
                    2. Client Proxy Agent: Advocate for lower costs based on profile: ${clientContextStr}.
                    3. Legal/Finance Agent: Enforce policy constraints: ${policyStr}.

                    Current Draft:
                    ${proposal_summary}

                    Execute a multi-turn dialogue where Sales pitches, Client Proxy counters, and Legal/Finance reviews.
                    Return the full transcript and the final terms.
                `;

                // Use the existing swarm.negotiate_task interface
                const swarmClient = mcp.getClient("swarm");
                if (!swarmClient) {
                    throw new Error("Swarm MCP client not found.");
                }

                const negotiateRes = await swarmClient.callTool({
                    name: "negotiate_task",
                    arguments: {
                        task_description: taskDescription,
                        simulation_mode: true
                    }
                });

                let negotiation_history = "Negotiation History:\n\n";
                if (negotiateRes && negotiateRes.content && negotiateRes.content[0].text) {
                    negotiation_history += negotiateRes.content[0].text;
                }

                // Synthesis Step
                const llm = createLLM();
                const synthesisPrompt = `You are an expert contract synthesizer. Review the following negotiation simulation history and extract the finalized terms.

                NEGOTIATION HISTORY:
                ${negotiation_history}

                PROPOSAL SUMMARY (Original):
                ${proposal_summary}

                Synthesize the final negotiated outcome. If consensus was not reached, output the best final position of the agency.
                Return ONLY a JSON object with the exact following structure:
                {
                    "optimized_terms": {
                        "pricing": "...",
                        "scope": "...",
                        "timeline": "...",
                        "liability": "..."
                    },
                    "simulation_transcript": "...",
                    "confidence_score": 0.0 to 1.0,
                    "policy_compliance_check": "..."
                }`;

                const genResponse = await llm.generate(synthesisPrompt, []);
                let genData;
                try {
                    let jsonStr = genResponse.message || genResponse.thought || "";
                    jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
                    const firstBrace = jsonStr.indexOf("{");
                    const lastBrace = jsonStr.lastIndexOf("}");
                    if (firstBrace !== -1 && lastBrace !== -1) {
                        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
                    }
                    genData = JSON.parse(jsonStr);
                } catch (e: any) {
                    throw new Error(`Failed to parse negotiated terms JSON: ${e.message}`);
                }

                const final_output = {
                    optimized_terms: genData.optimized_terms || {},
                    simulation_transcript: negotiation_history,
                    confidence_score: genData.confidence_score || 0,
                    policy_compliance_check: genData.policy_compliance_check || "Failed"
                };

                // Idempotency: deterministic hash for storage key
                const hashInput = proposal_summary + JSON.stringify(client_context);
                const deterministicId = crypto.createHash("sha256").update(hashInput).digest("hex");

                // Store in Brain
                await episodic.store(
                    `negotiation_${deterministicId}`,
                    `Negotiated contract terms for client profile: ${clientContextStr}`,
                    JSON.stringify(final_output),
                    ["negotiation_pattern", "contract", "phase_26", "swarm_negotiation_pattern"],
                    "default",
                    undefined,
                    false,
                    undefined,
                    undefined,
                    0,
                    0,
                    "negotiation_pattern"
                );

                return {
                    content: [{ type: "text", text: JSON.stringify(final_output, null, 2) }]
                };

            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error during negotiation simulation: ${error.message}` }],
                    isError: true
                };
            }
        }
    );
}
