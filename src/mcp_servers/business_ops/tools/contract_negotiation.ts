import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { CorporatePolicy } from "../../../brain/schemas.js";
import { OpenCoworkServer } from "../../opencowork/index.js";
import { createLLM } from "../../../llm.js";
import { dirname } from "path";

// Initialize Episodic Memory (singleton-ish for this module)
const baseDir = process.env.JULES_AGENT_DIR ? dirname(process.env.JULES_AGENT_DIR) : process.cwd();
const episodic = new EpisodicMemory(baseDir);

async function getLatestPolicy(company: string = "default"): Promise<CorporatePolicy | null> {
    const memories = await episodic.recall("corporate_policy", 10, company, "corporate_policy");
    if (!memories || memories.length === 0) return null;

    const policies = memories
        .map(m => {
            try { return JSON.parse(m.agentResponse) as CorporatePolicy; } catch { return null; }
        })
        .filter((p): p is CorporatePolicy => p !== null && p.isActive)
        .sort((a, b) => b.version - a.version);

    return policies.length > 0 ? policies[0] : null;
}

export function registerContractNegotiationTools(server: McpServer) {
    server.tool(
        "simulate_contract_negotiation",
        "Simulate a contract negotiation using a multi-agent swarm.",
        {
            proposal_draft: z.string().describe("The draft proposal to negotiate."),
            client_profile: z.string().describe("The profile of the client, e.g., 'budget-conscious startup' or 'enterprise'."),
            negotiation_parameters: z.object({
                max_rounds: z.number().describe("The maximum number of negotiation rounds."),
                temperature: z.number().describe("The temperature parameter for LLM generations.")
            }).describe("Parameters governing the simulation.")
        },
        async ({ proposal_draft, client_profile, negotiation_parameters }) => {
            try {
                await episodic.init();
                const activePolicy = await getLatestPolicy();
                const policyStr = activePolicy ? JSON.stringify(activePolicy.parameters) : "None";

                const orchestrator = new OpenCoworkServer();

                // Hire the swarm
                await orchestrator.hireWorker(
                    "Sales Agent: Maximize Total Contract Value (TCV) and long-term client value. Propose terms that benefit the agency.",
                    "sales_agent"
                );
                await orchestrator.hireWorker(
                    `Client Proxy Agent: Simulate the client's interests based on this profile: ${client_profile}. Advocate for lower costs, expanded scope, and favorable timelines.`,
                    "client_proxy_agent"
                );
                await orchestrator.hireWorker(
                    `Legal/Finance Agent: Enforce corporate policy constraints. Current policy parameters: ${policyStr}. Reject terms that drop below minimum margin or violate risk tolerance.`,
                    "legal_finance_agent"
                );

                let current_terms = proposal_draft;
                let negotiation_history = "Negotiation History:\n\n";
                let consensus = false;

                const rounds = Math.min(negotiation_parameters.max_rounds, 5); // Cap at 5 rounds

                for (let i = 1; i <= rounds; i++) {
                    negotiation_history += `--- ROUND ${i} ---\n`;

                    // 1. Sales Agent pitches/adjusts terms
                    const salesTask = `Review the current terms: \n${current_terms}\n\nPitch these to the client or adjust them to maximize TCV while remaining reasonable. Output your pitch and the proposed terms.`;
                    const salesRes = await orchestrator.delegateTask("sales_agent", salesTask);
                    const salesMsg = salesRes.content[0].text;
                    negotiation_history += `SALES: ${salesMsg}\n\n`;
                    current_terms = salesMsg;

                    // 2. Client Proxy responds
                    const clientTask = `The sales agent has proposed the following: \n${salesMsg}\n\nAs the client proxy (${client_profile}), evaluate this. If acceptable, say 'I ACCEPT'. If not, propose a counter-offer.`;
                    const clientRes = await orchestrator.delegateTask("client_proxy_agent", clientTask);
                    const clientMsg = clientRes.content[0].text;
                    negotiation_history += `CLIENT PROXY: ${clientMsg}\n\n`;

                    if (clientMsg.includes("I ACCEPT")) {
                        consensus = true;
                        break;
                    }
                    current_terms = clientMsg;

                    // 3. Legal/Finance reviews counter
                    const legalTask = `The client has countered with: \n${clientMsg}\n\nEvaluate this against policy (${policyStr}). If it violates policy, reject it and state the required correction. If it is acceptable, say 'APPROVED'.`;
                    const legalRes = await orchestrator.delegateTask("legal_finance_agent", legalTask);
                    const legalMsg = legalRes.content[0].text;
                    negotiation_history += `LEGAL/FINANCE: ${legalMsg}\n\n`;

                    if (legalMsg.includes("reject") || legalMsg.includes("violation") || !legalMsg.includes("APPROVED")) {
                        current_terms = legalMsg; // Sales must adjust based on this next round
                    }
                }

                // Synthesis Step
                const llm = createLLM();
                const synthesisPrompt = `You are an expert contract synthesizer. Review the following negotiation simulation history and extract the finalized terms.

                NEGOTIATION HISTORY:
                ${negotiation_history}

                PROPOSAL DRAFT (Original):
                ${proposal_draft}

                Synthesize the final negotiated outcome. If consensus was not reached, output the best final position of the agency.
                Return ONLY a JSON object with the following structure:
                {
                    "pricing_structure": "...",
                    "scope_adjustments": "...",
                    "timeline": "...",
                    "key_risks": "...",
                    "approval_confidence_score": 0.0 to 1.0 (number)
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
                    status: consensus ? "Consensus Reached" : "Max Rounds Exceeded",
                    negotiated_terms: genData,
                    history_preview: negotiation_history.substring(0, 500) + "..."
                };

                // Store in Brain
                await episodic.store(
                    `negotiation_${Date.now()}`,
                    `Negotiated contract terms for client profile: ${client_profile}`,
                    JSON.stringify(final_output),
                    ["negotiation_pattern", "contract", "phase_26"],
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
