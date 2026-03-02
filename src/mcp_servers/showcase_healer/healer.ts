import { createLLM } from "../../llm/index.js";
import { EpisodicMemory } from "../../brain/episodic.js";

export interface HealDeps {
    mcp: {
        callTool(server: string, tool: string, args: any): Promise<any>;
    };
    llm: ReturnType<typeof createLLM>;
    episodic: EpisodicMemory;
}

export async function healShowcase(deps: HealDeps) {
    const { mcp, llm, episodic } = deps;

    // 1. Fetch latest run
    let latestRun: any;
    try {
        const result = await mcp.callTool("health_monitor", "get_latest_showcase_run", {});
        const text = result.content[0].text;
        if (text === "No showcase runs found.") {
            return "No healing needed: No showcase runs found.";
        }
        latestRun = JSON.parse(text);
    } catch (e: any) {
        return `Failed to fetch showcase run: ${e.message}`;
    }

    if (!latestRun) {
        return "Failed to parse showcase run.";
    }

    // 2. Check if healing is needed
    // If success, or older than 24 hours, skip.
    if (latestRun.success) {
        return "No healing needed: Latest run was successful.";
    }

    const runTime = new Date(latestRun.timestamp).getTime();
    if (Date.now() - runTime > 24 * 60 * 60 * 1000) {
        return "No healing needed: Latest failure is stale (>24h).";
    }

    // --- Circuit Breaker & Idempotency ---
    // Query episodes related to this run_id
    // We assume related_episode_id stores the run_id
    // We fetch related episodes to check history
    let relatedHistory: any[] = [];
    try {
        // We use recall with the run ID as query to find relevant memories
        // But better to use a specific filter if possible. Episodic.recall supports type.
        // But type is fixed to showcase_healing_episode.
        // We rely on vector search + post-filter for related_episode_id
        const history = await episodic.recall(latestRun.id, 20, undefined, "showcase_healing_episode");
        relatedHistory = history.filter(ep => ep.related_episode_id === latestRun.id);
    } catch (e) {
        console.warn("Failed to fetch history:", e);
    }

    if (relatedHistory.length >= 3) {
        return `Escalated: Too many healing attempts (${relatedHistory.length}) for run ${latestRun.id}.`;
    }

    // 3. Analyze failure with LLM
    const prompt = `
    Analyze this showcase failure and suggest a healing action.
    Error: ${latestRun.error}
    Steps: ${JSON.stringify(latestRun.steps)}
    Previous Attempts: ${relatedHistory.length}

    Available actions:
    1. retry_sop (if transient/network error)
    2. rebuild_brain (if memory/vector DB corruption)
    3. restart_agent (if process stuck)
    4. escalate (if critical/unknown)

    Return JSON: { "action": "...", "reason": "...", "sop_name": "showcase_sop" }
    `;

    // Note: createLLM returns a class instance which has generate method
    const response = await llm.generate(prompt, []);
    let decision: any;
    try {
        // Parse JSON from response
        const content = response.message || response.raw || "";
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
            decision = JSON.parse(match[0]);
        } else {
             // Fallback
             decision = { action: "escalate", reason: "Could not parse LLM decision" };
        }
    } catch {
        decision = { action: "escalate", reason: "Invalid JSON from LLM" };
    }

    // 4. Execute Fix
    let actionResult = "";
    if (decision.action === "retry_sop") {
        try {
            const sopName = decision.sop_name || "showcase_sop"; // Default to showcase_sop
            // Using sop_execute tool from sop_engine
            const res = await mcp.callTool("sop_engine", "sop_execute", { name: sopName, input: "Healer retry" });

            let resText = "";
            if (res && res.content && res.content[0]) {
                 resText = res.content[0].text;
            }
            actionResult = `Executed retry for ${sopName}: ${resText.substring(0, 100)}...`;
        } catch (e: any) {
            actionResult = `Retry failed: ${e.message}`;
        }
    } else if (decision.action === "rebuild_brain") {
        try {
            const res = await mcp.callTool("brain", "brain_maintenance", { action: "rebuild_indices" });
            let resText = "";
            if (res && res.content && res.content[0]) resText = res.content[0].text;
            actionResult = `Brain maintenance: ${resText}`;
        } catch (e: any) {
            actionResult = `Brain maintenance failed: ${e.message}`;
        }
    } else if (decision.action === "restart_agent") {
        try {
             // Schedule a restart task via scheduler
             const res = await mcp.callTool("scheduler", "scheduler_add_task", {
                 id: `restart-request-${Date.now()}`,
                 name: "Emergency Restart",
                 trigger: "webhook",
                 prompt: "Restart the agent daemon immediately."
             });
             let resText = "";
             if (res && res.content && res.content[0]) resText = res.content[0].text;
             actionResult = `Scheduled restart request: ${resText}`;
        } catch (e: any) {
            actionResult = `Restart scheduling failed: ${e.message}`;
        }
    } else {
        actionResult = `Escalated: ${decision.reason}`;
    }

    // 5. Log Episode
    try {
        await episodic.store(
            `heal_showcase_${latestRun.id}_${Date.now()}`,
            "Heal showcase failure",
            `Action: ${decision.action}, Result: ${actionResult}`,
            [],
            undefined, // company
            undefined, // simulation
            undefined, // dreaming
            undefined, // dreaming outcomes
            undefined, // id
            undefined, // tokens
            undefined, // duration
            "showcase_healing_episode", // type
            latestRun.id // related_episode_id
        );
    } catch (e) {
        console.error("Failed to store healing episode:", e);
    }

    return `Healed: ${decision.action} - ${actionResult}`;
}
