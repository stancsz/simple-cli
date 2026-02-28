import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { CorporatePolicy } from "../../../brain/schemas.js";
import { getLatestPolicy } from "./contract_negotiation.js"; // Reuse existing
import { dirname } from "path";

const baseDir = process.env.JULES_AGENT_DIR ? dirname(process.env.JULES_AGENT_DIR) : process.cwd();
const episodic = new EpisodicMemory(baseDir);

interface GrowthMetrics {
    totalLeadsGenerated: number;
    totalProposalsGenerated: number;
    totalContractsWon: number;
    totalRevenue: number;
    averageMargin: number;
    leadToProposalRate: number;
    proposalAcceptanceRate: number;
}

export class RevenueValidation {
    async calculateGrowthMetrics(campaignId: string = "default"): Promise<GrowthMetrics> {
        // Retrieve memory entries associated with the campaign
        const leadMemories = await episodic.recall("lead_generation", 100, campaignId);
        const proposalMemories = await episodic.recall("proposal_generation", 100, campaignId);
        const contractMemories = await episodic.recall("contract_negotiation", 100, campaignId);

        const totalLeadsGenerated = leadMemories ? leadMemories.length : 0;
        const totalProposalsGenerated = proposalMemories ? proposalMemories.length : 0;

        let totalContractsWon = 0;
        let totalRevenue = 0;
        let totalMargin = 0;

        if (contractMemories) {
            for (const memory of contractMemories) {
                try {
                    const result = JSON.parse(memory.agentResponse);
                    if (result.agreement_reached) {
                        totalContractsWon++;
                        totalRevenue += result.deal_value || 0;
                        totalMargin += result.final_margin || 0;
                    }
                } catch (e) {
                    // Ignore parsing errors for non-JSON memories
                }
            }
        }

        const averageMargin = totalContractsWon > 0 ? totalMargin / totalContractsWon : 0;
        const leadToProposalRate = totalLeadsGenerated > 0 ? (totalProposalsGenerated / totalLeadsGenerated) * 100 : 0;
        const proposalAcceptanceRate = totalProposalsGenerated > 0 ? (totalContractsWon / totalProposalsGenerated) * 100 : 0;

        return {
            totalLeadsGenerated,
            totalProposalsGenerated,
            totalContractsWon,
            totalRevenue,
            averageMargin,
            leadToProposalRate,
            proposalAcceptanceRate
        };
    }

    async validateAgainstPolicy(metrics: GrowthMetrics, company: string = "default"): Promise<{ passed: boolean, alerts: string[] }> {
        const policy = await getLatestPolicy(company);
        const alerts: string[] = [];

        // Defaults if policy is missing
        const targetMargin = policy?.financials?.target_margin || 0.35;
        const minConversionRate = 15; // 15%
        const minAcceptanceRate = 20; // 20%

        if (metrics.averageMargin > 0 && metrics.averageMargin < targetMargin) {
            alerts.push(`Average margin (${(metrics.averageMargin * 100).toFixed(1)}%) is below policy target (${(targetMargin * 100).toFixed(1)}%).`);
        }

        if (metrics.leadToProposalRate > 0 && metrics.leadToProposalRate < minConversionRate) {
            alerts.push(`Lead-to-Proposal rate (${metrics.leadToProposalRate.toFixed(1)}%) is critically low (<${minConversionRate}%).`);
        }

        if (metrics.proposalAcceptanceRate > 0 && metrics.proposalAcceptanceRate < minAcceptanceRate) {
            alerts.push(`Proposal Acceptance rate (${metrics.proposalAcceptanceRate.toFixed(1)}%) is critically low (<${minAcceptanceRate}%).`);
        }

        return {
            passed: alerts.length === 0,
            alerts
        };
    }
}

export function registerRevenueValidationTools(server: McpServer) {
    const validator = new RevenueValidation();

    server.tool(
        "track_growth_metrics",
        "Calculates and returns current growth metrics for an autonomous campaign (leads, proposals, contracts, revenue).",
        {
            campaign_id: z.string().optional().default("default").describe("The ID of the campaign to track.")
        },
        async ({ campaign_id }) => {
            const metrics = await validator.calculateGrowthMetrics(campaign_id);
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(metrics, null, 2)
                }]
            };
        }
    );

    server.tool(
        "generate_revenue_validation_report",
        "Generates a comprehensive report validating the current autonomous growth metrics against Corporate Policy thresholds.",
        {
            campaign_id: z.string().optional().default("default").describe("The ID of the campaign to validate."),
            company: z.string().optional().default("default").describe("The company context for retrieving policies.")
        },
        async ({ campaign_id, company }) => {
            const metrics = await validator.calculateGrowthMetrics(campaign_id);
            const validation = await validator.validateAgainstPolicy(metrics, company);

            const report = {
                campaign_id,
                status: validation.passed ? "HEALTHY" : "AT_RISK",
                metrics,
                alerts: validation.alerts,
                timestamp: new Date().toISOString()
            };

            // Store report in episodic memory for HR/Policy Loop
            await episodic.store(
                "revenue_validation",
                "Generate validation report",
                JSON.stringify(report),
                campaign_id,
                ["revenue", "validation", "metrics"]
            );

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(report, null, 2)
                }]
            };
        }
    );
}
