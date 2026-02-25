import { LinearClient } from "@linear/sdk";

export function getLinearClient() {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
        throw new Error("LINEAR_API_KEY environment variable is not set.");
    }
    return new LinearClient({ apiKey });
}

export async function createProject(
    dealId: string,
    projectName: string,
    description: string,
    teamId?: string
) {
    const client = getLinearClient();

    // 1. Resolve Team ID
    let tid = teamId;
    if (!tid) {
        tid = process.env.LINEAR_TEAM_ID;
    }

    if (!tid) {
        // Fallback: Fetch the first team
        const teams = await client.teams();
        if (teams.nodes.length > 0) {
            tid = teams.nodes[0].id;
        } else {
            throw new Error("No Linear teams found and LINEAR_TEAM_ID not set.");
        }
    }

    // 2. Check for existing project (Idempotency)
    // We search by name. Ideally we'd use a custom field for Deal ID, but name is a good proxy for now.
    const projects = await client.projects({
        filter: {
            name: { eq: projectName }
        }
    });

    if (projects.nodes.length > 0) {
        const existing = projects.nodes[0];
        return {
            id: existing.id,
            url: existing.url,
            name: existing.name,
            action: "found"
        };
    }

    // 3. Create Project
    const projectPayload = await client.createProject({
        name: projectName,
        teamIds: [tid],
        description: `${description}\n\nLinked HubSpot Deal: ${dealId}`
    });

    if (!projectPayload.success) {
        throw new Error("Failed to create Linear project.");
    }

    const newProject = await projectPayload.project;
    if (!newProject) {
        throw new Error("Failed to retrieve created project.");
    }

    return {
        id: newProject.id,
        url: newProject.url,
        name: newProject.name,
        action: "created"
    };
}

export async function createIssue(
    projectId: string,
    title: string,
    description?: string,
    priority?: number
) {
    const client = getLinearClient();

    // We need the team ID from the project to create an issue.
    const project = await client.project(projectId);
    const teams = await project.teams();

    if (teams.nodes.length === 0) {
         throw new Error(`Project ${projectId} has no associated teams.`);
    }
    const teamId = teams.nodes[0].id;

    const issuePayload: any = {
        teamId,
        projectId,
        title,
        description
    };

    if (priority !== undefined) {
        issuePayload.priority = priority;
    }

    const issueCreate = await client.createIssue(issuePayload);

    if (!issueCreate.success) {
        throw new Error("Failed to create Linear issue.");
    }

    const issue = await issueCreate.issue;
    if (!issue) {
         throw new Error("Failed to retrieve created issue.");
    }

    return {
        id: issue.id,
        url: issue.url,
        identifier: issue.identifier,
        title: issue.title
    };
}

export async function syncDeal(
    dealId: string,
    dealName: string,
    amount?: number,
    stage?: string
) {
    // 1. Create Project
    const projectName = `Client Project: ${dealName}`;
    const description = `Project managed for HubSpot Deal: ${dealId}\nAmount: ${amount || 'N/A'}\nStage: ${stage || 'N/A'}`;

    const projectResult = await createProject(dealId, projectName, description);

    const logs: string[] = [];
    logs.push(`Project '${projectName}' ${projectResult.action} (ID: ${projectResult.id})`);

    // 2. Create Initial Tasks if project was newly created
    if (projectResult.action === "created") {
        const milestones = ["Discovery Phase", "Sprint 1", "Sprint 2", "Review & Handover"];

        for (const ms of milestones) {
            try {
                const issue = await createIssue(projectResult.id, ms, "Automated milestone task", 2); // Priority 2 = High
                logs.push(`Created task: ${ms} (${issue.identifier})`);
            } catch (e: any) {
                logs.push(`Failed to create task '${ms}': ${e.message}`);
            }
        }
    } else {
        logs.push("Project already exists, skipping initial task creation.");
    }

    return {
        project: projectResult,
        logs
    };
}
