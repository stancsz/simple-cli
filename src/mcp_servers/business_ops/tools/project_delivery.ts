import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getLinearClient } from "../linear_service.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { promises as fs } from "fs";
import { join } from "path";
import { existsSync } from "fs";
import { LinearClient } from "@linear/sdk";

// Helper to ensure directory exists
async function ensureDir(dir: string) {
    if (!existsSync(dir)) {
        await fs.mkdir(dir, { recursive: true });
    }
}

async function getOrCreateLabel(client: LinearClient, teamId: string, labelName: string): Promise<string> {
    const labels = await client.issueLabels({
        filter: {
            name: { eq: labelName },
            team: { id: { eq: teamId } }
        }
    });
    if (labels.nodes.length > 0) return labels.nodes[0].id;

    const newLabel = await client.createIssueLabel({ name: labelName, teamId, color: "#FF0000" });
    const label = await newLabel.issueLabel;
    if (!label) throw new Error("Failed to create label");
    return label.id;
}

async function fetchGithubActivity(repoUrl: string, since: Date): Promise<string[]> {
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) return [];
    const owner = match[1];
    const repo = match[2].replace(".git", "");

    const token = process.env.GITHUB_TOKEN;
    if (!token) return ["(GitHub Token missing)"];

    const url = `https://api.github.com/repos/${owner}/${repo}/commits?since=${since.toISOString()}`;
    try {
        const res = await fetch(url, {
            headers: {
                "Authorization": `token ${token}`,
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "ProjectDeliveryAgent"
            }
        });
        if (!res.ok) return [`Error fetching commits: ${res.statusText}`];
        const data: any[] = await res.json();
        return data.slice(0, 10).map((c: any) => `- [${c.sha.substring(0, 7)}] ${c.commit.message} (${c.commit.author.name})`);
    } catch (e: any) {
        return [`Error fetching GitHub activity: ${e.message}`];
    }
}

async function generateReportLogic(project_id: string, period_start: string, period_end: string, github_repo_url?: string) {
    const client = getLinearClient();
    const project = await client.project(project_id);
    const startDate = new Date(period_start);

    // Gather Linear Issues Updated in Period
    const issues = await project.issues({
            filter: {
            updatedAt: { gte: startDate }
            }
    });

    let completedItems: string[] = [];
    let inProgressItems: string[] = [];
    let blockedItems: string[] = [];

    for (const issue of issues.nodes) {
        const state = await issue.state;
        if (state) {
            if (state.type === "completed") {
                completedItems.push(`- [x] ${issue.title} (${issue.identifier})`);
            } else if (state.name.toLowerCase().includes("block") || state.type === "canceled") {
                blockedItems.push(`- [!] ${issue.title} (${issue.identifier})`);
            } else {
                inProgressItems.push(`- [ ] ${issue.title} (${issue.identifier}) - ${state.name}`);
            }
        }
    }

    // Brain Memories
    let keyEvents: string[] = [];
    try {
        const memory = new EpisodicMemory();
        await memory.init();
        const memories = await memory.retrieve(`project ${project.name} delivery update`, 5);
        keyEvents = memories.map(m => `- ${m}`);
    } catch (e) {
        keyEvents.push("- (Brain memory retrieval unavailable)");
    }

    // GitHub Activity
    let gitActivity: string[] = [];
    if (github_repo_url) {
        gitActivity = await fetchGithubActivity(github_repo_url, startDate);
    } else {
        // Try to find repo in project description
        const desc = project.description || "";
        const match = desc.match(/https:\/\/github\.com\/[^\s]+/);
        if (match) {
             gitActivity = await fetchGithubActivity(match[0], startDate);
        }
    }

    // Generate Markdown
    let report = `# Client Report: ${project.name}\n`;
    report += `**Period:** ${period_start} to ${period_end}\n\n`;

    report += `## 🚀 Completed Items\n`;
    report += completedItems.length > 0 ? completedItems.join("\n") : "_No items completed this period._";
    report += `\n\n`;

    report += `## 🚧 In Progress\n`;
    report += inProgressItems.length > 0 ? inProgressItems.join("\n") : "_No items in progress._";
    report += `\n\n`;

    if (blockedItems.length > 0) {
        report += `## ⚠️ Blockers\n`;
        report += blockedItems.join("\n");
        report += `\n\n`;
    }

    if (gitActivity.length > 0) {
        report += `## 💻 Recent Commits\n`;
        report += gitActivity.join("\n");
        report += `\n\n`;
    }

    report += `## 🧠 Key Events & Notes\n`;
    report += keyEvents.length > 0 ? keyEvents.join("\n") : "_No additional notes._";
    report += `\n\n`;

    report += `---\n*Generated by Automated Project Delivery Agent*`;

    return { report, projectName: project.name };
}


export function registerProjectDeliveryTools(server: McpServer) {
    // 1. track_milestone_progress
    server.tool(
        "track_milestone_progress",
        "Updates milestone status in Linear and logs to Brain",
        {
            project_id: z.string().describe("Linear Project ID"),
            milestone_name: z.string().describe("Name of the milestone (issue title)"),
            status: z.string().describe("New status (e.g., In Progress, Done, Canceled)"),
            notes: z.string().optional().describe("Progress notes")
        },
        async ({ project_id, milestone_name, status, notes }) => {
            const client = getLinearClient();

            // Find the issue
            const issues = await client.issues({
                filter: {
                    project: { id: { eq: project_id } },
                    title: { eq: milestone_name }
                }
            });

            if (issues.nodes.length === 0) {
                return {
                    content: [{ type: "text", text: `Error: Milestone '${milestone_name}' not found in project ${project_id}.` }],
                    isError: true
                };
            }

            const issue = issues.nodes[0];

            // Find status ID based on name
            let statusId: string | undefined;
            const team = await issue.team;
            if (team) {
                const states = await team.states();
                const targetState = states.nodes.find(s => s.name.toLowerCase() === status.toLowerCase());
                if (targetState) {
                    statusId = targetState.id;
                }
            }

            if (statusId) {
                await client.updateIssue(issue.id, { stateId: statusId });
            } else {
                 await client.createComment({ issueId: issue.id, body: `Status update requested: ${status}. (State not found in workflow)` });
            }

            if (notes) {
                await client.createComment({ issueId: issue.id, body: `Progress Update: ${notes}` });
            }

            // Brain Storage
            try {
                const memory = new EpisodicMemory();
                await memory.init();
                await memory.store(
                    "track_milestone",
                    `Update ${milestone_name} to ${status}`,
                    JSON.stringify({ project_id, milestone_name, status, notes, issueId: issue.id }),
                    [],
                    undefined, undefined, false, undefined, undefined, 0, 0,
                    "project_delivery"
                );
            } catch (e: any) {
                console.error("Failed to store in Brain:", e);
            }

            return {
                content: [{ type: "text", text: `Updated milestone '${milestone_name}' to '${status}'. Logged to Brain.` }]
            };
        }
    );

    // 2. generate_client_report
    server.tool(
        "generate_client_report",
        "Aggregates activity from Linear, Git, and Brain to generate a professional client report.",
        {
            project_id: z.string().describe("Linear Project ID"),
            period_start: z.string().describe("ISO date string (YYYY-MM-DD)"),
            period_end: z.string().describe("ISO date string (YYYY-MM-DD)"),
            github_repo_url: z.string().optional().describe("GitHub Repo URL to fetch commits from.")
        },
        async ({ project_id, period_start, period_end, github_repo_url }) => {
            try {
                const { report, projectName } = await generateReportLogic(project_id, period_start, period_end, github_repo_url);

                const reportDir = join(process.cwd(), "reports", project_id);
                await ensureDir(reportDir);
                const filename = `report_${period_start}_${period_end}.md`;
                const filepath = join(reportDir, filename);

                await fs.writeFile(filepath, report);

                return {
                    content: [{ type: "text", text: `Report generated successfully at ${filepath}` }]
                };
            } catch (e: any) {
                return { content: [{ type: "text", text: `Error generating report: ${e.message}` }], isError: true };
            }
        }
    );

    // 3. automate_status_update
    server.tool(
        "automate_status_update",
        "Automated weekly status reporting that pulls from Linear issues and activity logs.",
        {
            project_id: z.string().describe("Linear Project ID")
        },
        async ({ project_id }) => {
            // Calculate last week period
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - 7);

            const period_start = start.toISOString().split('T')[0];
            const period_end = end.toISOString().split('T')[0];

            try {
                const { report, projectName } = await generateReportLogic(project_id, period_start, period_end);

                const reportDir = join(process.cwd(), "reports", project_id);
                await ensureDir(reportDir);
                const filename = `weekly_status_${period_end}.md`;
                const filepath = join(reportDir, filename);

                await fs.writeFile(filepath, report);

                // Notify (Slack/Email)
                let notificationStatus = "Notification skipped (No webhook)";
                if (process.env.SLACK_WEBHOOK_URL) {
                    try {
                        await fetch(process.env.SLACK_WEBHOOK_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: `Weekly Status Report for ${projectName} is ready: ${filepath}` })
                        });
                        notificationStatus = "Notification sent to Slack";
                    } catch (e: any) {
                        notificationStatus = `Notification failed: ${e.message}`;
                    }
                }

                return {
                    content: [{ type: "text", text: `Weekly status update completed. Report saved to ${filepath}. ${notificationStatus}` }]
                };
            } catch (e: any) {
                 return { content: [{ type: "text", text: `Error generating weekly status: ${e.message}` }], isError: true };
            }
        }
    );

    // 4. escalate_blockers
    server.tool(
        "escalate_blockers",
        "Identifies blocked milestones and creates escalation tasks.",
        {
            project_id: z.string().describe("Linear Project ID")
        },
        async ({ project_id }) => {
            const client = getLinearClient();
            const project = await client.project(project_id);
            const issues = await project.issues();

            const escalatedIssues: string[] = [];

            for (const issue of issues.nodes) {
                const state = await issue.state;
                const isBlocked = state && (
                    state.name.toLowerCase() === "blocked" ||
                    state.type === "canceled"
                );

                if (isBlocked) {
                    const labels = await issue.labels();
                    const hasEscalatedLabel = labels.nodes.some(l => l.name === "Escalated");

                    if (!hasEscalatedLabel) {
                        const team = await issue.team;
                        if (!team) continue;

                        const labelId = await getOrCreateLabel(client, team.id, "Escalated");

                        // Apply Label
                        await client.updateIssue(issue.id, {
                             labelIds: [...labels.nodes.map(l => l.id), labelId]
                        });

                        // Create Task
                        await client.createIssue({
                            teamId: issue.teamId,
                            title: `Escalation: ${issue.title}`,
                            description: `Blocking issue detected: ${issue.url}\n\nPlease resolve immediately.`,
                            priority: 1 // Urgent
                        });

                        // Add comment to original
                        await client.createComment({
                            issueId: issue.id,
                            body: "Issue escalated due to blocker status."
                        });

                        escalatedIssues.push(`${issue.title} (${issue.identifier})`);
                    }
                }
            }

            if (escalatedIssues.length === 0) {
                return {
                    content: [{ type: "text", text: "No new blockers found to escalate." }]
                };
            }

            return {
                content: [{ type: "text", text: `Escalated the following blocked issues: ${escalatedIssues.join(", ")}` }]
            };
        }
    );
}
