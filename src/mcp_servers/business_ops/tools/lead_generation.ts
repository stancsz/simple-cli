import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { syncContactToHubSpot, logNoteToHubSpot } from "../crm.js";

interface LeadProfile {
    url: string;
    email?: string;
    score: number;
    qualified: boolean;
    details: any;
    timestamp: string;
}

export function registerLeadGenerationTools(server: McpServer) {
    // Tool: Discover Leads
    server.tool(
        "discover_leads",
        "Discovers potential leads from public sources (e.g., GitHub).",
        {
            target_audience: z.string().describe("Description of the target audience."),
            criteria: z.object({
                source: z.enum(["github", "generic"]).default("github"),
                keywords: z.array(z.string()).describe("Keywords to search for."),
                location: z.string().optional(),
                min_followers: z.number().optional()
            }).describe("Search criteria.")
        },
        async ({ target_audience, criteria }) => {
            const leads: any[] = [];

            if (criteria.source === "github") {
                const token = process.env.GITHUB_TOKEN;
                if (!token) {
                    return {
                        content: [{ type: "text", text: "Error: GITHUB_TOKEN not set." }],
                        isError: true
                    };
                }

                const queryParts = [...criteria.keywords];
                if (criteria.location) queryParts.push(`location:${criteria.location}`);
                if (criteria.min_followers) queryParts.push(`followers:>=${criteria.min_followers}`);

                const query = queryParts.join(" ");
                const url = `https://api.github.com/search/users?q=${encodeURIComponent(query)}&per_page=5`;

                try {
                    const response = await fetch(url, {
                        headers: {
                            "Authorization": `token ${token}`,
                            "Accept": "application/vnd.github.v3+json",
                            "User-Agent": "LeadGen-Agent"
                        }
                    });

                    if (!response.ok) {
                        throw new Error(`GitHub API Error: ${response.statusText}`);
                    }

                    const data: any = await response.json();

                    for (const item of data.items || []) {
                        // Fetch user details for email/blog
                        const userRes = await fetch(item.url, {
                             headers: {
                                "Authorization": `token ${token}`,
                                "Accept": "application/vnd.github.v3+json",
                                "User-Agent": "LeadGen-Agent"
                            }
                        });
                        if (userRes.ok) {
                            const user = await userRes.json();
                             leads.push({
                                name: user.name || user.login,
                                email: user.email, // Often null if private
                                company: user.company,
                                url: user.html_url,
                                blog: user.blog,
                                source: "github"
                            });
                        }
                    }

                } catch (e: any) {
                    return {
                        content: [{ type: "text", text: `Discovery failed: ${e.message}` }],
                        isError: true
                    };
                }
            } else {
                 // Mock for generic
                 leads.push({
                     name: "Mock Lead",
                     email: "mock@example.com",
                     company: "Mock Co",
                     url: "https://example.com",
                     source: "generic"
                 });
            }

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(leads, null, 2)
                }]
            };
        }
    );

    // Tool: Qualify Lead
    server.tool(
        "qualify_lead",
        "Qualifies a lead based on available data and stores the profile in Brain.",
        {
            company_url: z.string().describe("URL of the company or profile."),
            contact_email: z.string().optional().describe("Email of the contact.")
        },
        async ({ company_url, contact_email }) => {
            // Heuristic Scoring
            let score = 0;
            const details: any = {};

            // 1. Domain Check
            if (company_url.includes("github.com")) {
                score += 30;
                details.platform = "GitHub";
            } else if (company_url.endsWith(".edu")) {
                score += 10;
            } else {
                score += 20; // Standard domain
            }

            // 2. Email Check
            if (contact_email) {
                score += 20;
                if (!contact_email.endsWith("@gmail.com") && !contact_email.endsWith("@yahoo.com")) {
                    score += 20; // Corporate email
                }
            }

            // 3. Random Factor (Simulation of "Analysis")
            const analysisScore = Math.floor(Math.random() * 30);
            score += analysisScore;
            details.analysis_score = analysisScore;

            const qualified = score >= 50;

            const profile: LeadProfile = {
                url: company_url,
                email: contact_email,
                score,
                qualified,
                details,
                timestamp: new Date().toISOString()
            };

            // Store in Brain
            try {
                const memory = new EpisodicMemory();
                await memory.init();

                await memory.store(
                    "lead_qualification", // taskId
                    `qualify_lead: ${company_url}`, // request
                    JSON.stringify(profile), // solution
                    [], // artifacts
                    undefined, // company (default)
                    undefined, // attempts
                    false, // dreaming
                    undefined, // outcomes
                    undefined, // id
                    0, // tokens
                    0, // duration
                    "lead_profile" // type
                );
            } catch (e: any) {
                 console.error("Failed to store lead in Brain:", e);
                 // We don't fail the tool, just log warning
            }

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(profile, null, 2)
                }]
            };
        }
    );

    // Tool: Initiate Outreach
    server.tool(
        "initiate_outreach",
        "Sends an outreach email (via HubSpot log) and syncs the contact.",
        {
            lead_id: z.string().describe("Email or ID of the lead."),
            template_name: z.string().describe("Name of the template to use."),
            custom_message: z.string().optional().describe("Custom message to append.")
        },
        async ({ lead_id, template_name, custom_message }) => {
            // Assume lead_id is email for simplicity in this workflow, or handle both.
            const isEmail = lead_id.includes("@");
            let email = isEmail ? lead_id : undefined;

            if (!email) {
                return {
                    content: [{ type: "text", text: "Error: lead_id must be an email address for initial outreach." }],
                    isError: true
                };
            }

            let contactId: string;
            try {
                const syncResult = await syncContactToHubSpot({ email });
                contactId = syncResult.id;
            } catch (e: any) {
                 return {
                    content: [{ type: "text", text: `Failed to sync contact: ${e.message}` }],
                    isError: true
                };
            }

            // 2. Generate Message
            const message = `[Template: ${template_name}]\n\nHello,\n\nI noticed your work and wanted to reach out.\n\n${custom_message || ""}\n\nBest,\nJules`;

            // 3. Log Outreach
            try {
                await logNoteToHubSpot(contactId, `Outreach Initiated: ${message}`);
            } catch (e: any) {
                 return {
                    content: [{ type: "text", text: `Failed to log outreach: ${e.message}` }],
                    isError: true
                };
            }

            return {
                content: [{
                    type: "text",
                    text: `Outreach initiated successfully for ${email}. Contact ID: ${contactId}. Logged to HubSpot.`
                }]
            };
        }
    );
}
