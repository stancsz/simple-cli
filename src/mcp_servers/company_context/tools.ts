import { EpisodicMemory } from "../../brain/episodic.js";
import { createLLM } from "../../llm.js";
import * as lancedb from "@lancedb/lancedb";
import { join } from "path";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";

async function getDb(companyId: string) {
    const dbPath = join(process.cwd(), ".agent", "companies", companyId, "brain");
    if (!existsSync(dbPath)) {
        await mkdir(dbPath, { recursive: true });
    }
    return await lancedb.connect(dbPath);
}

async function getTable(db: lancedb.Connection, tableName: string = "documents") {
    try {
        const names = await db.tableNames();
        if (names.includes(tableName)) {
            return await db.openTable(tableName);
        }
        return null;
    } catch {
        return null;
    }
}

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

    // Pass the memoryInstance or new default episodic memory instance to fetch ecosystem policy
    const rootMemory = memoryInstance || new EpisodicMemory(process.cwd());

    // Phase 35 Enhancement: Fetch the latest 'ecosystem_policy' from the Brain memory directly
    const policyResults = await rootMemory.recall("ecosystem_policy", 1, "default", "ecosystem_policy");

    if (!policyResults || policyResults.length === 0) {
        return `No ecosystem policies found. Nothing to apply for company ${company_id}.`;
    }

    const latestPolicy = policyResults[0];
    const latestPolicyStr = (latestPolicy as any).solution || latestPolicy.agentResponse || JSON.stringify(latestPolicy);

    // Use LLM to extract insights specifically relevant to this company
    const prompt = `
    You are the Ecosystem Optimization Engine.
    Review the following ecosystem policy update and extract the meta-learning insights relevant to a company with the following attributes:
    ${JSON.stringify(attributes)}

    POLICY UPDATE:
    ${latestPolicyStr}

    Extract key strategies, recommended parameter adjustments, and workflow optimizations as a JSON list of strings.
    If nothing is directly relevant to this specific company context, return an empty list.

    OUTPUT FORMAT:
    Return ONLY a JSON array of strings:
    ["Insight 1", "Insight 2", ...]
    `;

    const llmResponse = await llm.generate(prompt, []);
    let insights: string[] = [];
    try {
        let jsonStr = llmResponse.message || llmResponse.thought || "";
        jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
        const firstBracket = jsonStr.indexOf("[");
        const lastBracket = jsonStr.lastIndexOf("]");
        if (firstBracket !== -1 && lastBracket !== -1) {
            jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
            insights = JSON.parse(jsonStr);
        }
    } catch (e: any) {
        throw new Error(`Failed to parse LLM interpretation of policy: ${e.message}`);
    }

    if (!insights || insights.length === 0) {
        return `No actionable ecosystem insights found for company ${company_id}.`;
    }

    // Insert into the company's vector database to make it part of their context
    const db = await getDb(company_id);
    let table = await getTable(db);

    const insightContent = `ECOSYSTEM META-LEARNING INSIGHTS FOR ${company_id.toUpperCase()}:\n\n` + insights.map(i => `- ${i}`).join("\n");
    const embedding = await llm.embed(insightContent);

    if (embedding) {
        const data = {
            id: `ecosystem_insight_${Date.now()}`,
            content: insightContent,
            source: "brain_ecosystem_policy",
            vector: embedding,
        };

        if (!table) {
            table = await db.createTable("documents", [data]);
        } else {
            await table.add([data]);
        }
    }

    // Store in episodic memory for tracking
    await memory.store(
        "meta_learning_update",
        "Update company with ecosystem insights",
        JSON.stringify({ applied_insights: insights }),
        ["ecosystem_insights"],
        company_id,
        [],
        false,
        "",
        undefined,
        0,
        0,
        "meta_learning_insight"
    );

    return `Successfully applied ${insights.length} ecosystem insights for company ${company_id}.`;
};
