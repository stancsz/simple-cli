import { randomUUID } from "crypto";
import * as yaml from "yaml";
import { EpisodicMemory } from "../../../brain/episodic.js";
import {
    ProjectSpec,
    AgencyConfig,
    Dependency,
    Task,
    ProjectStatus,
    Project,
    Assignment
} from "../types.js";
import * as fs from "fs/promises";
import * as path from "path";

// Helpers to read/write state to EpisodicMemory, removing local memory caching

async function getProjectState(projectId: string, memory: EpisodicMemory): Promise<Project> {
    const results = await memory.recall(`multi_agency_project_${projectId}`, 1, "project_management");
    if (!results || results.length === 0) {
        throw new Error(`Project ${projectId} not found.`);
    }

    const doc = results.find(r => r.id === `multi_agency_project_${projectId}` || r.id?.includes(projectId));
    if (!doc) {
        throw new Error(`Project ${projectId} not found in database.`);
    }

    // The solution field typically contains the JSON artifact from storing
    const jsonStr = (doc as any).solution || doc.agentResponse;
    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        throw new Error(`Failed to parse project state for ${projectId}`);
    }
}

async function saveProjectState(project: Project, memory: EpisodicMemory): Promise<void> {
    project.updated_at = Date.now();
    await memory.store(
        `multi_agency_project_${project.project_id}`,
        `Updated multi-agency project: ${project.name}`,
        JSON.stringify(project),
        ["agency_orchestrator", "multi_agency", project.project_id],
        "project_management"
    );
}

export async function createMultiAgencyProject(projectSpecYamlOrJson: string, memory: EpisodicMemory): Promise<string> {
    let spec: ProjectSpec;
    try {
        spec = JSON.parse(projectSpecYamlOrJson);
    } catch (e) {
        try {
            spec = yaml.parse(projectSpecYamlOrJson);
        } catch (yamlErr) {
            throw new Error("Invalid project specification format. Must be valid JSON or YAML.");
        }
    }

    if (!spec || !spec.name || !Array.isArray(spec.tasks)) {
        throw new Error("Invalid ProjectSpec: missing name or tasks array.");
    }

    const projectId = `proj_${randomUUID()}`;
    const now = Date.now();

    const dependencies: Dependency[] = [];
    spec.tasks.forEach(task => {
        if (task.dependencies) {
            task.dependencies.forEach(dep => {
                dependencies.push({
                    task_id: task.task_id,
                    depends_on_task_id: dep,
                    resolution_status: "unresolved"
                });
            });
        }
    });

    const project: Project = {
        project_id: projectId,
        name: spec.name,
        tasks: spec.tasks,
        assignments: [],
        dependencies,
        status: "planning",
        created_at: now,
        updated_at: now
    };

    await saveProjectState(project, memory);

    return projectId;
}

export async function assignAgencyToTask(projectId: string, taskId: string, agencyConfig: AgencyConfig, memory: EpisodicMemory): Promise<string> {
    const project = await getProjectState(projectId, memory);

    const task = project.tasks.find(t => t.task_id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found in project ${projectId}.`);

    // Check if the task already has an active assignment
    if (project.assignments.some(a => a.task_id === taskId && (a.status === "pending" || a.status === "in_progress" || a.status === "completed"))) {
        throw new Error(`Task ${taskId} is already assigned.`);
    }

    let assignedAgencyId = agencyConfig.agency_id;

    if (!assignedAgencyId) {
        // Spawn simulation (Phase 32 Agency Spawning Protocol logic via fs)
        assignedAgencyId = `agency_${randomUUID()}`;
        console.log(`[Agency Spawning] Spawning new child agency ${assignedAgencyId} with role ${agencyConfig.role}`);

        // Simulating the filesystem creation as described by phase32 memory rules
        const rootDir = process.cwd();
        const childDir = path.join(rootDir, '.agent', 'child_agencies', assignedAgencyId);
        await fs.mkdir(childDir, { recursive: true });

        const childMemoryDir = path.join(childDir, 'brain');
        await fs.mkdir(childMemoryDir, { recursive: true });

        // Seed initial context in child's isolated memory
        const childMemory = new EpisodicMemory(childMemoryDir);
        await childMemory.store(
            "CorporateStrategy",
            "Initial context injection",
            JSON.stringify({
                role: agencyConfig.role,
                context: agencyConfig.initial_context,
                constraints: { token_budget: agencyConfig.resource_limit }
            }),
            ["context_injection"],
            "strategy"
        );

        await memory.store(
            `spawn_agency_${assignedAgencyId}`,
            `Spawn child agency for role: ${agencyConfig.role}`,
            `Context: ${agencyConfig.initial_context}\nResource Limit: ${agencyConfig.resource_limit}`,
            [assignedAgencyId, "agency_spawning"],
            "autonomous_decision"
        );
    }

    const assignmentId = `assign_${randomUUID()}`;
    const assignment: Assignment = {
        task_id: taskId,
        agency_id: assignedAgencyId,
        assignment_id: assignmentId,
        status: "pending"
    };

    project.assignments.push(assignment);
    project.status = "in_progress";

    await saveProjectState(project, memory);

    await memory.store(
        `assignment_${assignmentId}`,
        `Assign task ${taskId} to ${assignedAgencyId}`,
        JSON.stringify(assignment),
        [projectId, assignedAgencyId, "agency_orchestrator"],
        "project_management"
    );

    return assignmentId;
}

export async function monitorProjectStatus(projectId: string, memory: EpisodicMemory): Promise<ProjectStatus> {
    const project = await getProjectState(projectId, memory);

    const totalTasks = project.tasks.length;
    let completedTasks = 0;
    const blockers: string[] = [];

    // Check for dependency deadlocks
    const inProgressTasks = project.assignments.filter(a => a.status === "in_progress").map(a => a.task_id);
    const hasDeadlock = project.dependencies.some(dep =>
        dep.resolution_status === "unresolved" &&
        inProgressTasks.includes(dep.task_id) &&
        project.assignments.find(a => a.task_id === dep.depends_on_task_id)?.status === "failed"
    );

    const tasksStatus = project.tasks.map(task => {
        const assignment = project.assignments.find(a => a.task_id === task.task_id);
        const deps = project.dependencies.filter(d => d.task_id === task.task_id);

        let isBlocked = false;
        deps.forEach(dep => {
            if (dep.resolution_status === "unresolved") {
                const blockingAssignment = project.assignments.find(a => a.task_id === dep.depends_on_task_id);
                if (!blockingAssignment || blockingAssignment.status !== "completed") {
                    isBlocked = true;
                    blockers.push(`Task ${task.task_id} is blocked by ${dep.depends_on_task_id}`);
                }
            }
        });

        const status = assignment ? assignment.status : "unassigned";
        if (status === "completed") completedTasks++;
        if (status === "failed") {
            blockers.push(`Task ${task.task_id} failed (${assignment?.agency_id})`);
        }

        return {
            task_id: task.task_id,
            agency_id: assignment ? assignment.agency_id : null,
            status: isBlocked && status !== "failed" ? "blocked" : status,
            is_blocked: isBlocked
        };
    });

    const progress = totalTasks > 0 ? completedTasks / totalTasks : 0;

    if (hasDeadlock) {
        project.status = "failed";
        blockers.push("DEADLOCK DETECTED: A dependency failed, blocking dependent tasks permanently.");
        await saveProjectState(project, memory);
    } else if (progress === 1.0) {
        project.status = "completed";
        await saveProjectState(project, memory);
    }

    const statusObj: ProjectStatus = {
        project_id: projectId,
        status: project.status,
        overall_progress: progress,
        tasks: tasksStatus,
        blockers
    };

    return statusObj;
}

export async function resolveInterAgencyDependency(projectId: string, dependency: Dependency, memory: EpisodicMemory): Promise<void> {
    const project = await getProjectState(projectId, memory);

    const existingDepIndex = project.dependencies.findIndex(d =>
        d.task_id === dependency.task_id && d.depends_on_task_id === dependency.depends_on_task_id
    );

    if (existingDepIndex === -1) {
        throw new Error(`Dependency between ${dependency.task_id} and ${dependency.depends_on_task_id} not found.`);
    }

    project.dependencies[existingDepIndex].resolution_status = "resolved";

    await saveProjectState(project, memory);

    await memory.store(
        `resolve_dependency_${projectId}_${dependency.task_id}_${dependency.depends_on_task_id}`,
        `Resolved dependency for ${dependency.task_id} on ${dependency.depends_on_task_id}`,
        `Status: resolved`,
        [projectId, "agency_orchestrator", "dependency_resolution"],
        "project_management"
    );
}

// System tool to update task status (e.g. from failed/completed signals)
export async function updateTaskStatus(projectId: string, taskId: string, status: "pending" | "in_progress" | "blocked" | "completed" | "failed", memory: EpisodicMemory): Promise<void> {
    const project = await getProjectState(projectId, memory);
    const assignment = project.assignments.find(a => a.task_id === taskId);
    if (!assignment) {
        throw new Error(`Assignment for task ${taskId} not found.`);
    }
    assignment.status = status;
    await saveProjectState(project, memory);
}

export async function spawnChildAgency(role: string, initialContext: string, resourceLimit: number, swarmConfig: any, memory: EpisodicMemory): Promise<{ agency_id: string; status: string; role: string }> {
    const assignedAgencyId = `agency_${randomUUID()}`;
    console.log(`[Agency Spawning] Spawning new child agency ${assignedAgencyId} with role ${role}`);

    const rootDir = process.cwd();
    const childDir = path.join(rootDir, '.agent', 'child_agencies', assignedAgencyId);
    await fs.mkdir(childDir, { recursive: true });

    const childMemoryDir = path.join(childDir, 'brain');
    await fs.mkdir(childMemoryDir, { recursive: true });

    // Seed initial context in child's isolated memory
    const childMemory = new EpisodicMemory(childMemoryDir);
    await childMemory.store(
        "CorporateStrategy",
        "Initial context injection",
        JSON.stringify({
            role: role,
            context: initialContext,
            constraints: { token_budget: resourceLimit },
            swarm_config: swarmConfig || {}
        }),
        ["context_injection"],
        "strategy"
    );

    // Record the spawn event in the parent orchestrator's memory
    await memory.store(
        `spawn_agency_${assignedAgencyId}`,
        `Spawned child agency for role: ${role}`,
        JSON.stringify({
            agency_id: assignedAgencyId,
            role,
            initial_context: initialContext,
            resource_limit: resourceLimit,
            swarm_config: swarmConfig
        }),
        [assignedAgencyId, "agency_spawning", "ecosystem_morphology"],
        "autonomous_decision"
    );

    return { agency_id: assignedAgencyId, status: "spawned", role };
}

export async function mergeChildAgencies(sourceAgencyId: string, targetAgencyId: string, memory: EpisodicMemory): Promise<{ status: string; merged_from: string; merged_into: string }> {
    console.log(`[Agency Merging] Merging ${sourceAgencyId} into ${targetAgencyId}`);

    const rootDir = process.cwd();
    const childAgenciesDir = path.join(rootDir, '.agent', 'child_agencies');
    const sourceDir = path.join(childAgenciesDir, sourceAgencyId);
    const targetDir = path.join(childAgenciesDir, targetAgencyId);

    // Ensure the source exists
    try {
        await fs.access(sourceDir);
    } catch {
        throw new Error(`Cannot merge: Source agency ${sourceAgencyId} not found.`);
    }

    // Ensure the target exists
    try {
        await fs.access(targetDir);
    } catch {
        throw new Error(`Cannot merge: Target agency ${targetAgencyId} not found.`);
    }

    // Open memories to extract/inject resources and contexts
    const sourceMemoryDir = path.join(sourceDir, 'brain');
    const targetMemoryDir = path.join(targetDir, 'brain');

    // Safety check - what if the child hasn't set up memory yet? Create it if needed.
    await fs.mkdir(sourceMemoryDir, { recursive: true });
    await fs.mkdir(targetMemoryDir, { recursive: true });

    const sourceMemory = new EpisodicMemory(sourceMemoryDir);
    const targetMemory = new EpisodicMemory(targetMemoryDir);

    // Attempt to pull the source's CorporateStrategy to merge resources
    let sourceStrategyObj: any = {};
    try {
        const sourceStrategyRes = await sourceMemory.recall("CorporateStrategy", 1, "strategy");
        if (sourceStrategyRes && sourceStrategyRes.length > 0) {
            const doc = sourceStrategyRes[0];
            const str = (doc as any).solution || doc.agentResponse;
            if (str) sourceStrategyObj = JSON.parse(str);
        }
    } catch (e) {
        console.warn(`Could not read source strategy during merge: ${e}`);
    }

    // Attempt to pull the target's CorporateStrategy
    let targetStrategyObj: any = {};
    let targetStrategyId = `merged_strategy_${Date.now()}`;
    try {
        const targetStrategyRes = await targetMemory.recall("CorporateStrategy", 1, "strategy");
        if (targetStrategyRes && targetStrategyRes.length > 0) {
            const doc = targetStrategyRes[0];
            targetStrategyId = doc.id || targetStrategyId;
            const str = (doc as any).solution || doc.agentResponse;
            if (str) targetStrategyObj = JSON.parse(str);
        }
    } catch (e) {
        console.warn(`Could not read target strategy during merge: ${e}`);
    }

    // Consolidate constraints/resources
    const sourceTokens = sourceStrategyObj?.constraints?.token_budget || 0;
    const targetTokens = targetStrategyObj?.constraints?.token_budget || 0;

    targetStrategyObj.constraints = targetStrategyObj.constraints || {};
    targetStrategyObj.constraints.token_budget = targetTokens + sourceTokens;

    // Consolidate context
    const sourceContext = sourceStrategyObj?.context || "";
    targetStrategyObj.context = `${targetStrategyObj.context || ""}\n[Merged Context from ${sourceAgencyId}]:\n${sourceContext}`;

    // Update target memory
    await targetMemory.store(
        targetStrategyId,
        "Consolidated Corporate Strategy via Merge",
        JSON.stringify(targetStrategyObj),
        ["strategy", "merge_consolidation"],
        "strategy"
    );

    // Archive the source directory instead of full deletion for safety
    const archiveDir = path.join(rootDir, '.agent', 'archive');
    await fs.mkdir(archiveDir, { recursive: true });

    const timestamp = Date.now();
    const archivedSourceDir = path.join(archiveDir, `${sourceAgencyId}_merged_${timestamp}`);

    await fs.rename(sourceDir, archivedSourceDir);

    // Update the orchestrator's memory
    await memory.store(
        `merge_agency_${sourceAgencyId}_into_${targetAgencyId}`,
        `Merged child agency ${sourceAgencyId} into ${targetAgencyId}`,
        JSON.stringify({
            source: sourceAgencyId,
            target: targetAgencyId,
            resources_transferred: sourceTokens,
            archive_path: archivedSourceDir
        }),
        [sourceAgencyId, targetAgencyId, "agency_merging", "ecosystem_morphology"],
        "autonomous_decision"
    );

    return { status: "merged", merged_from: sourceAgencyId, merged_into: targetAgencyId };
}

export async function retireChildAgency(agencyId: string, memory: EpisodicMemory): Promise<{ agency_id: string; status: string }> {
    console.log(`[Agency Retirement] Retiring child agency ${agencyId}`);

    const rootDir = process.cwd();
    const childAgenciesDir = path.join(rootDir, '.agent', 'child_agencies');
    const sourceDir = path.join(childAgenciesDir, agencyId);

    try {
        await fs.access(sourceDir);
    } catch {
        throw new Error(`Cannot retire: Agency ${agencyId} not found.`);
    }

    // Move to archive
    const archiveDir = path.join(rootDir, '.agent', 'archive');
    await fs.mkdir(archiveDir, { recursive: true });

    const timestamp = Date.now();
    const archivedSourceDir = path.join(archiveDir, `${agencyId}_retired_${timestamp}`);

    await fs.rename(sourceDir, archivedSourceDir);

    // Log the retirement
    await memory.store(
        `retire_agency_${agencyId}`,
        `Retired child agency ${agencyId}`,
        JSON.stringify({ agency_id: agencyId, archive_path: archivedSourceDir }),
        [agencyId, "agency_retirement", "ecosystem_morphology"],
        "autonomous_decision"
    );

    return { agency_id: agencyId, status: "retired" };
}

export { applyEcosystemInsights } from "./apply_ecosystem_insights.js";
