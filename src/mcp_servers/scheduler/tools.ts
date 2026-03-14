import { createLLM } from "../../llm.js";
import { EpisodicMemory } from "../../brain/episodic.js";

/**
 * Enhanced Phase 35 Predictive Task Assignment.
 * Queries the Brain's ecosystem patterns via agency_orchestrator to predict the optimal child agency for a task.
 */
export async function assign_task_with_ecosystem_insights(
    task_description: string,
    task_requirements: string,
    memoryInstance?: EpisodicMemory
): Promise<{ agency_id: string, reasoning: string }> {
    const memory = memoryInstance || new EpisodicMemory(process.cwd());

    try {
        // Query Brain for the latest ecosystem_policy
        const policyResults = await memory.recall("ecosystem_policy", 1, "default", "ecosystem_policy");

        if (!policyResults || policyResults.length === 0) {
            return {
                agency_id: "local",
                reasoning: "No ecosystem policies found. Defaulting to local."
            };
        }

        const latestPolicy = policyResults[0];
        const latestPolicyStr = (latestPolicy as any).solution || latestPolicy.agentResponse || JSON.stringify(latestPolicy);

        // Fetch spawned agencies
        const spawnResults = await memory.recall("agency_spawning", 50, "default", "autonomous_decision");
        let availableAgencies: any[] = [];

        if (spawnResults && spawnResults.length > 0) {
            spawnResults.forEach((mem: any) => {
                let id = null;
                let role = "unknown";

                if (mem.tags && Array.isArray(mem.tags)) {
                    id = mem.tags.find((t: string) => t.startsWith("agency_"));
                }
                if (mem.request && mem.request.includes("role:")) {
                    const match = mem.request.match(/role:\s*(.+)/);
                    if (match) role = match[1].trim();
                }

                if (id) {
                    availableAgencies.push({ agency_id: id, role });
                }
            });
        }

        if (availableAgencies.length === 0) {
             return {
                agency_id: "local",
                reasoning: "No spawned child agencies found. Defaulting to local."
            };
        }

        // Use LLM to reason and pick the best agency
        const llm = createLLM();
        const prompt = `
        You are the Ecosystem Optimization Scheduler.
        Your goal is to assign the following task to the BEST available agency based on ecosystem insights.

        TASK DESCRIPTION:
        ${task_description}

        TASK REQUIREMENTS:
        ${task_requirements}

        LATEST ECOSYSTEM POLICY INSIGHTS:
        ${latestPolicyStr}

        AVAILABLE CHILD AGENCIES:
        ${JSON.stringify(availableAgencies, null, 2)}

        Analyze the task against the ecosystem policy and the available agencies' roles.
        If an agency is a strong match and the policy supports its capability, return its agency_id.
        If no child agency is a good fit, or if there's conflicting/negative insight about them for this task, return "local".

        OUTPUT FORMAT:
        Return ONLY a JSON object with this schema:
        {
            "agency_id": "agency_xxx" or "local",
            "reasoning": "A brief explanation of why this agency was chosen based on the insights."
        }
        `;

        const llmResponse = await llm.generate(prompt, []);
        let jsonStr = llmResponse.message || llmResponse.thought || "";
        jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();

        const firstBrace = jsonStr.indexOf("{");
        const lastBrace = jsonStr.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) {
            jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
            const parsed = JSON.parse(jsonStr);

            // Validation
            if (parsed.agency_id && parsed.reasoning) {
                 // Check if the predicted agency is actually in our available list (or is 'local')
                 if (parsed.agency_id === "local" || availableAgencies.some(a => a.agency_id === parsed.agency_id)) {
                     return {
                         agency_id: parsed.agency_id,
                         reasoning: parsed.reasoning
                     };
                 } else {
                     return {
                         agency_id: "local",
                         reasoning: "LLM selected an invalid agency ID. Defaulting to local."
                     };
                 }
            }
        }

        return {
            agency_id: "local",
            reasoning: "Failed to parse LLM recommendation. Defaulting to local."
        };

    } catch (e: any) {
        console.error(`Error in assign_task_with_ecosystem_insights: ${e.message}`);
        return {
            agency_id: "local",
            reasoning: `Error during prediction: ${e.message}`
        };
    }
}
