import { getLinearClient } from "../linear_service.js";
import { scale_agents_for_project } from "./self_scaling_swarms.js";

export async function monitor_projects() {
    const client = getLinearClient();
    // Fetch all projects
    // Ideally use pagination for large orgs, but simple fetch for now.
    const projects = await client.projects({
        filter: {
            state: { in: ["started", "planned"] }
        }
    });

    const results = [];

    for (const project of projects.nodes) {
        try {
            const result = await scale_agents_for_project(project.id);
            results.push({
                projectId: project.id,
                projectName: project.name,
                ...result
            });
        } catch (e: any) {
            results.push({
                projectId: project.id,
                projectName: project.name,
                error: e.message
            });
        }
    }

    return results;
}
