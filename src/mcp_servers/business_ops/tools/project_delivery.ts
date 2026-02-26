import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getLinearClient } from "../linear_service.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { promises as fs } from "fs";
import { join } from "path";
import { existsSync } from "fs";
import { LinearClient } from "@linear/sdk";
import simpleGit from "simple-git";

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
        const memories = await memory.recall(`project ${project.name} delivery update`, 5);
        keyEvents = memories.map(m => `- ${m.userPrompt}: ${m.agentResponse}`);
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
        "Calculates milestone completion percentage and logs progress to the Brain.",
        {
            project_id: z.string().describe("Linear Project ID"),
            milestone_name: z.string().optional().describe("Name of the milestone (issue title or cycle) to filter by. If omitted, tracks entire project.")
        },
        async ({ project_id, milestone_name }) => {
            const client = getLinearClient();

            // Find issues
            const filter: any = { project: { id: { eq: project_id } } };
            const issues = await client.issues({ filter });

            let total = 0;
            let completed = 0;

            for (const issue of issues.nodes) {
                // If milestone_name is provided, filter by title match or cycle name match
                // Note: This is an in-memory filter as Linear API filtering is limited for complex text matches or cross-relations.
                let matches = true;
                if (milestone_name) {
                    matches = false;
                    // Check Issue Title
                    if (issue.title.toLowerCase().includes(milestone_name.toLowerCase())) matches = true;

                    // Check Cycle (if any)
                    if (!matches) {
                        const cycle = await issue.cycle;
                        if (cycle && cycle.name.toLowerCase().includes(milestone_name.toLowerCase())) matches = true;
                    }

                    // Check Labels
                    if (!matches) {
                        const labels = await issue.labels();
                        if (labels.nodes.some(l => l.name.toLowerCase() === milestone_name.toLowerCase())) matches = true;
                    }
                }

                if (matches) {
                    total++;
                    const state = await issue.state;
                    if (state && state.type === "completed") {
                        completed++;
                    }
                }
            }

            const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
            const scope = milestone_name ? `Milestone '${milestone_name}'` : 'Project';
            const statusMessage = `Progress Update: ${scope} is ${percentage}% complete (${completed}/${total}).`;

            // Brain Storage
            try {
                const memory = new EpisodicMemory();
                await memory.init();
                await memory.store(
                    "track_milestone",
                    statusMessage,
                    JSON.stringify({ project_id, milestone_name, completion_percentage: percentage, total_issues: total, completed_issues: completed }),
                    [],
                    undefined, undefined, false, undefined, undefined, 0, 0,
                    "project_delivery"
                );
            } catch (e: any) {
                console.error("Failed to store in Brain:", e);
            }

            return {
                content: [{ type: "text", text: JSON.stringify({ status: "success", data: { completion_percentage: percentage, total_issues: total, completed_issues: completed, scope } }) }]
            };
        }
    );

    // 2. generate_client_report
    server.tool(
        "generate_client_report",
        "Aggregates activity from Linear, Git, and Brain to generate a report, commits it, and notifies Slack.",
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

                // Commit to Git (Using simple-git)
                let gitStatus = "Git commit skipped (not a repo)";
                const git = simpleGit(process.cwd());
                try {
                    const isRepo = await git.checkIsRepo();
                    if (isRepo) {
                        await git.add(filepath);
                        await git.commit(`docs: client report for ${projectName} (${period_start} - ${period_end})`);
                        // Try push if configured
                        try { await git.push(); } catch(e) {}
                        gitStatus = "Committed to Git";
                    }
                } catch (e: any) {
                    gitStatus = `Git operation failed: ${e.message}`;
                }

                // Notify Slack
                let slackStatus = "Slack notification skipped";
                if (process.env.SLACK_WEBHOOK_URL) {
                    try {
                        await fetch(process.env.SLACK_WEBHOOK_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: `📊 *Client Report Generated*: ${projectName}\nfile: ${filepath}\n${gitStatus}` })
                        });
                        slackStatus = "Slack notified";
                    } catch (e: any) {
                        slackStatus = `Slack notification failed: ${e.message}`;
                    }
                }

                return {
                    content: [{ type: "text", text: JSON.stringify({ status: "success", data: { report_path: filepath, git_status: gitStatus, slack_status: slackStatus } }) }]
                };
            } catch (e: any) {
                return { content: [{ type: "text", text: JSON.stringify({ status: "error", error: e.message }) }], isError: true };
            }
        }
    );

    // 3. escalate_blockers
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
            const memory = new EpisodicMemory();
            await memory.init();

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
                            teamId: team.id,
                            title: `Escalation: ${issue.title}`,
                            description: `Blocking issue detected: ${issue.url}\n\nPlease resolve immediately.`,
                            priority: 1 // Urgent
                        });

                        // Brain Log
                        await memory.store(
                            "escalation_event",
                            `Escalated issue ${issue.identifier}`,
                            JSON.stringify({ issueId: issue.id, title: issue.title, reason: "Blocked" }),
                            [], undefined, undefined, false, undefined, undefined, 0, 0, "project_delivery"
                        );

                        // Slack Notification
                        if (process.env.SLACK_WEBHOOK_URL) {
                             try {
                                await fetch(process.env.SLACK_WEBHOOK_URL, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ text: `🚨 *Escalation*: Issue ${issue.identifier} (${issue.title}) is BLOCKED. Escalation task created.` })
                                });
                            } catch (e) {}
                        }

                        escalatedIssues.push(`${issue.title} (${issue.identifier})`);
                    }
                }
            }

            if (escalatedIssues.length === 0) {
                return {
                    content: [{ type: "text", text: JSON.stringify({ status: "success", data: { escalated_issues: [] } }) }]
                };
            }

            return {
                content: [{ type: "text", text: JSON.stringify({ status: "success", data: { escalated_issues: escalatedIssues } }) }]
            };
        }
    );
}
