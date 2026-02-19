
import { CompanyContextServer } from "../src/mcp_servers/company_context.js";
import { BrainServer } from "../src/mcp_servers/brain.js";
import { LLM } from "../src/llm.js";
import { join } from "path";
import { rm, mkdir } from "fs/promises";

// Mock Embeddings for Testing
LLM.prototype.embed = async function(text: string): Promise<number[]> {
    console.log(`[MockEmbed] Generating embedding for: "${text.substring(0, 20)}..."`);
    // Simple deterministic hash for testing
    const hash = text.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return new Array(1536).fill(0).map((_, i) => ((hash * (i + 1)) % 1000) / 1000);
};

// Helper to access tool handlers
function getToolHandler(serverInstance: any, toolName: string) {
    // @ts-ignore
    const tools = serverInstance.server._registeredTools;
    if (!tools || !tools[toolName]) {
        throw new Error(`Tool ${toolName} not found on server instance.`);
    }
    return tools[toolName].handler;
}

async function runValidation() {
    console.log("Starting Company Context Validation (Pillar #3)...");

    // 1. Setup Environment
    process.env.BRAIN_STORAGE_ROOT = join(process.cwd(), ".agent", "test_brain", "episodic");

    // Clean up previous test runs if any
    try {
        await rm(join(process.cwd(), ".agent", "test_brain"), { recursive: true, force: true });
        // We don't delete .agent/companies/.../brain because we want to test ingestion freshly?
        // Yes, let's clean up the company brains too to ensure fresh ingestion.
        await rm(join(process.cwd(), ".agent", "companies", "acme-corp", "brain"), { recursive: true, force: true });
        await rm(join(process.cwd(), ".agent", "companies", "startup-xyz", "brain"), { recursive: true, force: true });
    } catch (e) {
        console.warn("Cleanup warning:", e);
    }

    // 2. Initialize Servers
    const companyServer = new CompanyContextServer();
    const brainServer = new BrainServer();

    console.log("Servers initialized.");

    // 3. Ingest Context (RAG)
    console.log("\n--- Validating Document Ingestion (RAG) ---");
    const loadContext = getToolHandler(companyServer, "load_company_context");

    console.log("Loading context for 'acme-corp'...");
    const res1 = await loadContext({ company_id: "acme-corp" });
    console.log("Result:", res1.content[0].text);

    console.log("Loading context for 'startup-xyz'...");
    const res2 = await loadContext({ company_id: "startup-xyz" });
    console.log("Result:", res2.content[0].text);

    // 4. Validate Context Separation
    console.log("\n--- Validating Context Separation ---");
    const queryContext = getToolHandler(companyServer, "query_company_context");

    // Query for Acme
    console.log("Querying 'backend language' for acme-corp...");
    const acmeRes = await queryContext({ query: "What is the backend language?", company_id: "acme-corp" });
    const acmeText = acmeRes.content[0].text;
    console.log("Acme Response snippet:", acmeText.substring(0, 100) + "...");

    if (acmeText.includes("Java") && !acmeText.includes("TypeScript")) {
        console.log("✅ Acme Context Correct: Found Java, ignored TypeScript.");
    } else {
        console.error("❌ Acme Context Failed: Expected Java, got:", acmeText);
        process.exit(1);
    }

    // Query for Startup
    console.log("Querying 'backend language' for startup-xyz...");
    const startupRes = await queryContext({ query: "What is the backend language?", company_id: "startup-xyz" });
    const startupText = startupRes.content[0].text;
    console.log("Startup Response snippet:", startupText.substring(0, 100) + "...");

    if (startupText.includes("TypeScript") && !startupText.includes("Java")) {
        console.log("✅ Startup Context Correct: Found TypeScript, ignored Java.");
    } else {
        console.error("❌ Startup Context Failed: Expected TypeScript, got:", startupText);
        process.exit(1);
    }

    // 5. Validate Brain Separation (Memory)
    console.log("\n--- Validating Brain Memory Separation ---");
    const storeMemory = getToolHandler(brainServer, "brain_store");
    const queryMemory = getToolHandler(brainServer, "brain_query");

    // Store memory for Acme
    console.log("Storing specific memory for Acme...");
    await storeMemory({
        taskId: "task-1",
        request: "Fix the legacy monolith",
        solution: "Failed because the Java version was too old.",
        company: "acme-corp",
        artifacts: '["legacy_service.java"]'
    });

    // Query Acme
    console.log("Querying 'Java version' in Acme memory...");
    const acmeMem = await queryMemory({ query: "Java version", company: "acme-corp" });
    if (acmeMem.content[0].text.includes("too old")) {
        console.log("✅ Acme Memory Correct: Found the memory.");
    } else {
        console.error("❌ Acme Memory Failed: Did not find the memory.");
        process.exit(1);
    }

    // Query Startup (Should NOT find it)
    console.log("Querying 'Java version' in Startup memory...");
    const startupMem = await queryMemory({ query: "Java version", company: "startup-xyz" });
    if (startupMem.content[0].text.includes("No relevant memories found") || !startupMem.content[0].text.includes("too old")) {
        console.log("✅ Startup Memory Correct: Did not find Acme's memory.");
    } else {
        console.error("❌ Startup Memory Failed: Found leaked memory!", startupMem.content[0].text);
        process.exit(1);
    }

    console.log("\n✅✅✅ ALL VALIDATION CHECKS PASSED ✅✅✅");
}

runValidation().catch(err => {
    console.error("Validation Script Failed:", err);
    process.exit(1);
});
