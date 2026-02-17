import { join } from "path";
import { mkdirSync, rmSync, existsSync } from "fs";
import { MCP } from "../src/mcp.js";
import { ContextManager } from "../src/context/ContextManager.js";

async function main() {
    console.log("Starting Brain Integration Validation...");

    // 1. Setup Environment
    const tempDir = join(process.cwd(), "temp_brain_test_" + Date.now());
    if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });

    process.env.BRAIN_STORAGE_ROOT = join(tempDir, "brain");
    process.env.MOCK_EMBEDDINGS = "true";
    process.env.JULES_COMPANY = "test_company_" + Date.now(); // Unique company to avoid lock conflicts

    console.log(`Using temp dir: ${tempDir}`);
    console.log(`Company: ${process.env.JULES_COMPANY}`);

    try {
        // 2. Initialize MCP
        const mcp = new MCP();
        await mcp.init();

        // 3. Start Brain Server
        console.log("Starting Brain MCP Server...");
        await mcp.startServer("brain");

        // Give it a moment to start
        await new Promise(r => setTimeout(r, 2000));

        // 4. Initialize ContextManager
        const contextManager = new ContextManager(mcp);

        // 5. Test Save Context
        console.log("Saving context...");
        const task1 = "Fix the login bug in auth.ts";
        const outcome1 = "Fixed by adding null check.";
        await contextManager.saveContext(task1, outcome1, {}, ["src/auth.ts"]);
        console.log("Context saved.");

        // Wait a bit for async indexing
        await new Promise(r => setTimeout(r, 1000));

        // 6. Test Load Context (Recall)
        console.log("Loading context for similar task...");
        const task2 = "Fix a bug in authentication";

        const result = await contextManager.loadContext(task2);

        console.log("Recalled Memories:", result.relevant_past_experiences);

        if (result.relevant_past_experiences && result.relevant_past_experiences.length > 0) {
            const memory = result.relevant_past_experiences[0];
            if (memory.includes("Fix the login bug in auth.ts") && memory.includes("Fixed by adding null check")) {
                console.log("SUCCESS: Recalled correct memory.");
            } else {
                console.error("FAILURE: Recalled memory content mismatch.");
                console.log("Expected to contain:", task1, outcome1);
                console.log("Got:", memory);
                process.exit(1);
            }
        } else {
            console.error("FAILURE: No relevant memories found.");
            process.exit(1);
        }

        // Cleanup Server
        await mcp.stopServer("brain");

    } catch (e) {
        console.error("Error during validation:", e);
        process.exit(1);
    } finally {
        // Cleanup Files
        console.log("Cleaning up...");
        try {
            // Wait for processes to release locks
            await new Promise(r => setTimeout(r, 1000));
            rmSync(tempDir, { recursive: true, force: true });

            // Cleanup company context
            const companyDir = join(process.cwd(), ".agent", "companies", process.env.JULES_COMPANY!);
            if (existsSync(companyDir)) {
                 rmSync(companyDir, { recursive: true, force: true });
            }
        } catch (e) {
            console.warn("Failed to cleanup temp dir:", e);
        }
    }
}

main();
