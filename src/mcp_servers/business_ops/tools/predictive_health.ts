import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getLinearClient, createIssue } from "../linear_service.js";
import { getHubSpotClient, logNoteToHubSpot } from "../crm.js";
import { EpisodicMemory } from "../../../brain/episodic.js";

// Interfaces
interface HealthReport {
    clientId: string;
    linearMetrics: {
        openIssues: number;
        velocity: number; // Completed in last 14 days
        blockers: number;
        avgResolutionTimeDays: number;
    };
    crmSentiment: {
        lastContactDays: number;
        sentimentScore: number; // -1 to 1
        negativeKeywords: string[];
    };
    brainMemories: {
        recentIssuesCount: number;
        sentimentSummary: string;
    };
    timestamp: string;
}

interface RiskAssessment {
    clientId: string;
    riskScore: number; // 0-100
    riskLevel: "Low" | "Medium" | "High" | "Critical";
    factors: string[];
    recommendedIntervention?: string;
}

// Helpers
async function analyzeLinearMetrics(projectId?: string): Promise<HealthReport["linearMetrics"]> {
    if (!projectId) {
        return { openIssues: 0, velocity: 0, blockers: 0, avgResolutionTimeDays: 0 };
    }

    try {
        const client = getLinearClient();
        const project = await client.project(projectId);
        const issues = await project.issues();

        let open = 0;
        let completedRecent = 0;
        let blockers = 0;
        let totalResolutionTime = 0;
        let resolvedCount = 0;
        const now = new Date();
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        for (const issue of issues.nodes) {
            const state = await issue.state;
            if (state?.type !== "completed" && state?.type !== "canceled") {
                open++;
            }

            if (state?.type === "completed" && issue.completedAt && issue.completedAt > twoWeeksAgo) {
                completedRecent++;
            }

            if (issue.priority === 1 || (await issue.labels()).nodes.some(l => l.name.toLowerCase().includes("blocker"))) {
                blockers++;
            }

            if (issue.createdAt && issue.completedAt) {
                const diffTime = Math.abs(issue.completedAt.getTime() - issue.createdAt.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                totalResolutionTime += diffDays;
                resolvedCount++;
            }
        }

        return {
            openIssues: open,
            velocity: completedRecent,
            blockers,
            avgResolutionTimeDays: resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0
        };
    } catch (e) {
        console.error("Linear Analysis Failed:", e);
        return { openIssues: 0, velocity: 0, blockers: 0, avgResolutionTimeDays: 0 };
    }
}

async function analyzeCrmSentiment(email?: string): Promise<HealthReport["crmSentiment"]> {
    if (!email) {
        return { lastContactDays: 999, sentimentScore: 0, negativeKeywords: [] };
    }

    try {
        const hubspot = getHubSpotClient();
        // Search for contact to get ID
        const filter = { filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }] };
        // @ts-ignore
        const search = await hubspot.crm.contacts.searchApi.doSearch(filter);
        if (search.results.length === 0) return { lastContactDays: 999, sentimentScore: 0, negativeKeywords: [] };

        const contactId = search.results[0].id;

        // Fetch recent notes/emails (simplified simulation via mockable logic or basic association check)
        // For this MVP, we will simulate sentiment analysis based on recent 'notes' if retrievable,
        // or just return a default if the API is too complex for a single call without specialized search.
        // Real implementation would list associations. Here we'll return a placeholder or mockable structure.

        // In a real scenario, we'd fetch engagements.
        // For MVP, we'll assume neutral unless 'notes' are passed in context or checked via a different tool.
        // We will default to checking last modified date of the contact as a proxy for 'last contact'.

        const lastModified = new Date(search.results[0].updatedAt);
        const diffTime = Math.abs(new Date().getTime() - lastModified.getTime());
        const lastContactDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return {
            lastContactDays,
            sentimentScore: 0, // Neutral default
            negativeKeywords: []
        };
    } catch (e) {
        console.error("CRM Analysis Failed:", e);
        return { lastContactDays: 999, sentimentScore: 0, negativeKeywords: [] };
    }
}

async function analyzeBrainMemories(clientId: string): Promise<HealthReport["brainMemories"]> {
    try {
        const memory = new EpisodicMemory();
        await memory.init();

        const memories = await memory.recall(`issues feedback ${clientId}`, 5);
        const negativeKeywords = ["bad", "slow", "error", "fail", "angry", "upset"];
        let negativeCount = 0;

        for (const m of memories) {
            if (negativeKeywords.some(kw => m.userPrompt.toLowerCase().includes(kw) || m.agentResponse.toLowerCase().includes(kw))) {
                negativeCount++;
            }
        }

        return {
            recentIssuesCount: memories.length,
            sentimentSummary: negativeCount > 0 ? "Negative trends detected" : "Neutral/Positive"
        };
    } catch (e) {
         console.error("Brain Analysis Failed:", e);
         return { recentIssuesCount: 0, sentimentSummary: "No data" };
    }
}

// Tool Registration
export function registerPredictiveHealthTools(server: McpServer) {
    // 1. Analyze Client Health
    server.tool(
        "analyze_client_health",
        "Aggregates data from Linear, CRM, and Brain to generate a health report.",
        {
            clientId: z.string().describe("Client Identifier (Name or ID)."),
            linearProjectId: z.string().optional().describe("Linear Project ID."),
            contactEmail: z.string().optional().describe("Primary contact email for HubSpot.")
        },
        async ({ clientId, linearProjectId, contactEmail }) => {
            const [linear, crm, brain] = await Promise.all([
                analyzeLinearMetrics(linearProjectId),
                analyzeCrmSentiment(contactEmail),
                analyzeBrainMemories(clientId)
            ]);

            const report: HealthReport = {
                clientId,
                linearMetrics: linear,
                crmSentiment: crm,
                brainMemories: brain,
                timestamp: new Date().toISOString()
            };

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(report, null, 2)
                }]
            };
        }
    );

    // 2. Predict Retention Risk
    server.tool(
        "predict_retention_risk",
        "Calculates a risk score (0-100) based on health metrics.",
        {
            healthReport: z.string().describe("JSON string of HealthReport.")
        },
        async ({ healthReport }) => {
            const report: HealthReport = JSON.parse(healthReport);
            let score = 0;
            const factors: string[] = [];

            // 1. Velocity Check
            if (report.linearMetrics.velocity === 0 && report.linearMetrics.openIssues > 0) {
                score += 30;
                factors.push("Stalled Velocity");
            }

            // 2. Blocker Check
            if (report.linearMetrics.blockers > 2) {
                score += 25;
                factors.push("Multiple Blockers Detected");
            }

            // 3. Engagement Check
            if (report.crmSentiment.lastContactDays > 14) {
                score += 15;
                factors.push("Low Engagement (No contact > 14 days)");
            }

            // 4. Brain Sentiment
            if (report.brainMemories.sentimentSummary.includes("Negative")) {
                score += 20;
                factors.push("Negative Historical Sentiment");
            }

            // Cap score
            score = Math.min(score, 100);

            let riskLevel: RiskAssessment["riskLevel"] = "Low";
            if (score > 70) riskLevel = "Critical";
            else if (score > 50) riskLevel = "High";
            else if (score > 30) riskLevel = "Medium";

            const assessment: RiskAssessment = {
                clientId: report.clientId,
                riskScore: score,
                riskLevel,
                factors,
                recommendedIntervention: score > 50 ? "Schedule Check-in / Escalate" : "Monitor"
            };

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(assessment, null, 2)
                }]
            };
        }
    );

    // 3. Trigger Preemptive Intervention
    server.tool(
        "trigger_preemptive_intervention",
        "Executes intervention protocols for high-risk clients.",
        {
            clientId: z.string(),
            riskScore: z.number(),
            reason: z.string(),
            linearProjectId: z.string().optional(),
            contactEmail: z.string().optional()
        },
        async ({ clientId, riskScore, reason, linearProjectId, contactEmail }) => {
            const actions: string[] = [];

            if (riskScore > 70) {
                // 1. Linear Escalation
                if (linearProjectId) {
                    try {
                        await createIssue(
                            linearProjectId,
                            `RISK INTERVENTION: ${clientId}`,
                            `Automated escalation due to risk score ${riskScore}.\nReasons: ${reason}`,
                            1 // Urgent
                        );
                        actions.push("Created High-Priority Linear Issue");
                    } catch (e) {
                        actions.push(`Failed to create Linear issue: ${e}`);
                    }
                }

                // 2. HubSpot Task
                if (contactEmail) {
                    try {
                        const hubspot = getHubSpotClient();
                        // Find contact ID again
                        const filter = { filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: contactEmail }] }] };
                        // @ts-ignore
                        const search = await hubspot.crm.contacts.searchApi.doSearch(filter);
                        if (search.results.length > 0) {
                            const contactId = search.results[0].id;
                            // Log Note/Task
                            await logNoteToHubSpot(contactId, `URGENT: Client Risk Intervention Triggered. Score: ${riskScore}. Reason: ${reason}`);
                            actions.push("Logged Intervention Note in HubSpot");
                        }
                    } catch (e) {
                        actions.push(`Failed to log to HubSpot: ${e}`);
                    }
                }
            } else {
                actions.push("Risk score below threshold. No active intervention required. Logged for monitoring.");
            }

            // 3. Store in Brain
            try {
                const memory = new EpisodicMemory();
                await memory.init();
                await memory.store(
                    "intervention_log",
                    `Trigger intervention for ${clientId}`,
                    JSON.stringify({ riskScore, reason, actions }),
                    [],
                    undefined,
                    undefined,
                    false,
                    undefined,
                    undefined,
                    0,
                    0,
                    "intervention"
                );
            } catch (e) {
                console.error("Failed to store intervention in Brain:", e);
            }

            return {
                content: [{
                    type: "text",
                    text: `Intervention Complete. Actions: ${actions.join(", ")}`
                }]
            };
        }
    );
}
