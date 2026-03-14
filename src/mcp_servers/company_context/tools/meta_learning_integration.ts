import { EpisodicMemory } from "../../../brain/episodic.js";
import { createLLM } from "../../../llm.js";
import { analyzeEcosystemPatterns } from "../../brain/tools/pattern_analysis.js";

export const update_company_with_ecosystem_insights = async (
    company_id: string,
    memoryInstance?: EpisodicMemory
): Promise<string> => {
    const memory = memoryInstance || new EpisodicMemory(process.cwd());
    const llm = createLLM();

    let attributes = null;
    try {
        const profileMemories = await memory.recall("company attributes", 1, company_id, "company_profile");
        if (profileMemories && profileMemories.length > 0) {
            const profile = profileMemories[0] as any;
            const rawResponse = profile.agentResponse || profile.solution || "{}";
            attributes = JSON.parse(rawResponse);
        }
    } catch (e) {
        console.warn("Could not retrieve company profile:", e);
    }

    if (!attributes || Object.keys(attributes).length === 0) {
        attributes = { industry: "general", size: "unknown" };
        await memory.store(
            "store_profile",
            "Store company attributes",
            JSON.stringify(attributes),
            [],
            company_id,
            [],
            false,
            "",
            undefined,
            0,
            0,
            "company_profile"
        );
    }

    // Pass the memoryInstance or new default episodic memory instance to fetch patterns across ecosystem
    const rootMemory = memoryInstance || new EpisodicMemory(process.cwd());
    const insights = await analyzeEcosystemPatterns(rootMemory, llm, attributes);

    await memory.store(
        "meta_learning_update",
        "Update company with ecosystem insights",
        JSON.stringify(insights),
        [],
        company_id,
        [],
        false,
        "",
        undefined,
        0,
        0,
        "meta_learning_insight"
    );

    return `Successfully applied ecosystem insights for company ${company_id}.`;
};
