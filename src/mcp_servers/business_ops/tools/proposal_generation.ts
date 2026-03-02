import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm/index.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { readStrategy } from "../../brain/tools/strategy.js";
import { CorporatePolicy } from "../../../brain/schemas.js";
import { syncDealToHubSpot } from "../crm.js";
import * as fs from "fs";
import * as path from "path";
import { simulateContractNegotiationLogic } from "./contract_negotiation.js";

export function registerProposalGenerationTools(server: McpServer) {
    server.tool(
        "generate_client_proposal",
        "Generates a tailored client proposal synthesizing corporate strategy, past projects, and pricing models.",
        {
            company_name: z.string().describe("The name of the prospective client company."),
            project_scope: z.string().describe("Details of the requested project scope."),
            estimated_hours: z.number().describe("Estimated hours required for the project.")
        },
        async ({ company_name, project_scope, estimated_hours }) => {
            try {
                const episodic = new EpisodicMemory();
                await episodic.init();
                const llm = createLLM();

                // 1. Fetch Corporate Strategy
                const strategy = await readStrategy(episodic);

                // 2. Fetch Relevant Past Proposals
                const pastProposals = await episodic.recall(
                    project_scope,
                    3,
                    undefined,
                    "proposal"
                );

                // 3. Fetch Active Policy
                // Replicate the logic from policy_engine.ts to get the latest policy
                const policyMemories = await episodic.recall("corporate_policy", 10, "default", "corporate_policy");
                let activePolicy: CorporatePolicy | null = null;
                if (policyMemories && policyMemories.length > 0) {
                    const policies = policyMemories
                        .map(m => {
                            try { return JSON.parse(m.agentResponse) as CorporatePolicy; } catch { return null; }
                        })
                        .filter((p): p is CorporatePolicy => p !== null && p.isActive)
                        .sort((a, b) => b.version - a.version);
                    if (policies.length > 0) activePolicy = policies[0];
                }

                // 4. Read Template
                const templatePath = path.join(process.cwd(), "sops/proposal_template.md");
                let template = "";
                if (fs.existsSync(templatePath)) {
                    template = fs.readFileSync(templatePath, "utf-8");
                } else {
                    return {
                        content: [{ type: "text", text: "Error: sops/proposal_template.md not found." }],
                        isError: true
                    };
                }

                // 5. Generate Proposal via LLM
                const generationPrompt = `You are an expert Proposal Writer for an autonomous AI agency.
Generate the content for a client proposal based on the following context.
Return ONLY a JSON object containing the values to fill into the template.

TEMPLATE SECTIONS TO FILL:
- EXECUTIVE_SUMMARY: Overview of the client's needs and how our strategy aligns.
- PROPOSED_SOLUTION: Detailed breakdown of the project scope.
- TIMELINE: Estimated timeline based on hours.
- PRICING_TERMS: Cost breakdown and terms based on policy.

CONTEXT:
Client: ${company_name}
Scope: ${project_scope}
Estimated Hours: ${estimated_hours}

CORPORATE STRATEGY:
${strategy ? JSON.stringify(strategy, null, 2) : "None available."}

ACTIVE POLICY:
${activePolicy ? JSON.stringify(activePolicy, null, 2) : "None available."}

PAST SIMILAR PROPOSALS (For reference style/approach):
${pastProposals.map(p => p.agentResponse).join("\n---\n")}

OUTPUT FORMAT:
Return a valid JSON object:
{
  "EXECUTIVE_SUMMARY": "...",
  "PROPOSED_SOLUTION": "...",
  "TIMELINE": "...",
  "PRICING_TERMS": "..."
}`;

                const genResponse = await llm.generate(generationPrompt, []);
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
                    throw new Error(`Failed to parse generated proposal JSON: ${e.message}`);
                }

                // Assemble Initial Proposal
                let draftProposal = template
                    .replace("{{COMPANY_NAME}}", company_name)
                    .replace("{{DATE}}", new Date().toISOString().split("T")[0])
                    .replace("{{EXECUTIVE_SUMMARY}}", genData.EXECUTIVE_SUMMARY || "")
                    .replace("{{PROPOSED_SOLUTION}}", genData.PROPOSED_SOLUTION || "")
                    .replace("{{TIMELINE}}", genData.TIMELINE || "")
                    .replace("{{PRICING_TERMS}}", genData.PRICING_TERMS || "");

                // 6. Supervisor Agent Review
                const reviewPrompt = `You are a Supervisor Agent. Review the following draft proposal for tone, accuracy, and compliance with our Active Policy.

ACTIVE POLICY:
${activePolicy ? JSON.stringify(activePolicy, null, 2) : "None"}

DRAFT PROPOSAL:
${draftProposal}

TASK:
Identify any policy violations or unprofessional tone. If issues exist, correct the text and output the ENTIRE revised proposal markdown.
If it is perfect, output the original draft exactly as it is.
Return ONLY the raw markdown text of the (revised or original) proposal. Do not wrap in backticks or add introductory text.`;

                const reviewResponse = await llm.generate(reviewPrompt, []);
                let finalProposal = reviewResponse.message || reviewResponse.thought || draftProposal;

                // Cleanup any markdown codeblock wrapping the LLM might have added despite instructions
                finalProposal = finalProposal.replace(/^```markdown\n/, "").replace(/\n```$/, "").trim();

                // 7. Store in Brain
                await episodic.store(
                    `proposal_${company_name.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`,
                    `Proposal generation for ${company_name}, Scope: ${project_scope}`,
                    finalProposal, // Store the raw markdown text
                    ["proposal", "client_acquisition", "phase_26"],
                    company_name,
                    undefined,
                    false,
                    undefined,
                    undefined,
                    0,
                    0,
                    "proposal"
                );

                // 8. Sync Deal to HubSpot
                let syncStatus = "Not attempted";
                let dealAmountNum = estimated_hours * 150;
                try {
                    // Derive an amount or use a dummy for the deal
                    if (activePolicy?.parameters?.min_margin) {
                        dealAmountNum = estimated_hours * 150 * (1 + activePolicy.parameters.min_margin);
                    }
                    const amount = dealAmountNum.toString();

                    const dealResult = await syncDealToHubSpot({
                        dealname: `Proposal: ${company_name} - ${project_scope.substring(0, 30)}`,
                        amount,
                        dealstage: "presentationscheduled" // Standard HubSpot stage for proposal sent
                    });
                    syncStatus = `Synced (${dealResult.id})`;
                } catch (e: any) {
                    syncStatus = `Sync Failed: ${e.message}`;
                    console.error("HubSpot sync failed:", e);
                }

                // 9. Optional High-Value Contract Negotiation Simulation
                let negotiationResult = "Skipped (Deal value below threshold)";
                if (dealAmountNum > 10000) { // Threshold for high value
                    try {
                        const simResult = await simulateContractNegotiationLogic({
                            client_context: company_name,
                            proposal_summary: `Proposal for ${project_scope}. Estimated hours: ${estimated_hours}.`,
                            deal_value: dealAmountNum
                        });
                        negotiationResult = `Simulated successfully: ${simResult.status}`;
                    } catch (e: any) {
                        console.error("Simulation failed:", e);
                        negotiationResult = `Simulation Error: ${e.message}`;
                    }
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: "Proposal generated successfully",
                            company: company_name,
                            hubspot_sync: syncStatus,
                            negotiation_simulation: negotiationResult,
                            proposal_preview: finalProposal.substring(0, 500) + "..."
                        }, null, 2)
                    }]
                };

            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error generating proposal: ${error.message}` }],
                    isError: true
                };
            }
        }
    );
}
