
import { MCP } from '../../src/mcp.js';
import { JobDelegator } from '../../src/scheduler/job_delegator.js';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

async function main() {
    console.log("🚀 Starting Showcase Simulation...");

    const __filename = fileURLToPath(import.meta.url);
    const showcaseDir = dirname(__filename);
    const agentDir = join(showcaseDir, '.agent');
    const sopsDir = join(showcaseDir, 'docs', 'sops');

    // Set environment variable for agent directory (for JobDelegator and others respecting it)
    process.env.JULES_AGENT_DIR = agentDir;
    // Set environment variable for SOP directory (for SOP Engine)
    process.env.JULES_SOP_DIR = sopsDir;

    // Ensure directories exist
    if (!existsSync(agentDir)) mkdirSync(agentDir, { recursive: true });

    // Setup Company Context Structure
    const companyDocsDir = join(agentDir, 'companies', 'showcase-corp', 'docs');
    if (!existsSync(companyDocsDir)) mkdirSync(companyDocsDir, { recursive: true });

    // Copy Company Context to where the server expects it
    const contextSrc = join(showcaseDir, 'company_context.json');
    const contextDest = join(companyDocsDir, 'context.md'); // Rename to .md for ingestion
    if (existsSync(contextSrc)) {
        console.log(`Copying context from ${contextSrc} to ${contextDest}`);
        const contextContent = readFileSync(contextSrc, 'utf-8');
        writeFileSync(contextDest, "```json\n" + contextContent + "\n```");
    } else {
        console.error(`Missing company_context.json at ${contextSrc}`);
        process.exit(1);
    }

    // Initialize MCP
    console.log("Step 1: Initializing MCP...");
    const mcp = new MCP();
    await mcp.init();

    // Start necessary servers
    console.log("Starting servers...");
    const requiredServers = ['company', 'sop_engine', 'brain', 'health_monitor', 'hr_loop', 'filesystem'];
    for (const server of requiredServers) {
        try {
            await mcp.startServer(server);
            console.log(`✅ Started ${server}`);
        } catch (e) {
            console.warn(`⚠️ Failed to start ${server}: ${e.message}`);
        }
    }

    // 1. Company Context
    console.log("\n--- Pillar 1: Company Context ---");
    const companyClient = mcp.getClient('company');
    if (companyClient) {
        console.log("Loading Showcase Corp context...");
        try {
            // Ingest the context
            await companyClient.callTool({
                name: "load_company_context",
                arguments: { company_id: "showcase-corp" }
            });

            // Query it
            console.log("Querying Company Context...");
            const res = await companyClient.callTool({
                name: "query_company_context",
                arguments: { query: "What is the tech stack?", company_id: "showcase-corp" }
            });
            console.log("Result:", res.content[0].text);
        } catch (e) {
            console.error("Failed to interact with Company Context:", e);
        }
    }

    // 2. SOP Execution
    console.log("\n--- Pillar 2: SOP-as-Code ---");
    const sopClient = mcp.getClient('sop_engine');
    if (sopClient) {
        console.log("Executing Showcase SOP...");
        try {
            const result = await sopClient.callTool({
                name: "sop_execute",
                arguments: {
                    name: "showcase_sop",
                    input: "Initialize project"
                }
            });
            console.log("SOP Execution Result:", result.content[0].text);
        } catch (e) {
            console.error("Failed to execute SOP:", e);
        }
    }

    // 3. Ghost Mode (Time Lapse)
    console.log("\n--- Pillar 3: Ghost Mode (Time Lapse) ---");
    const delegator = new JobDelegator(agentDir);

    // Simulate Morning Standup
    console.log("⏰ 09:00 - Triggering Morning Standup...");
    await delegator.delegateTask({
        id: "showcase-standup",
        name: "Morning Standup",
        trigger: "cron",
        schedule: "0 9 * * *",
        prompt: "Run the Morning Standup for Showcase Corp.",
        yoloMode: true,
        company: "showcase-corp"
    });

    // 4. HR Loop
    console.log("\n--- Pillar 4: HR Loop (Self-Optimization) ---");
    console.log("⏰ 18:00 - Triggering Daily HR Review...");
    await delegator.delegateTask({
        id: "showcase-hr-review",
        name: "Daily HR Review",
        trigger: "cron",
        schedule: "0 18 * * *",
        prompt: "Run the Daily HR Review.",
        yoloMode: true,
        company: "showcase-corp"
    });

    // 5. Framework Integration (Roo Code)
    console.log("\n--- Pillar 5: Framework Integration (Roo Code) ---");
    const rooClient = mcp.getClient('roo_code');
    if (rooClient) {
        console.log("Delegating task to Roo Code...");
        try {
            // Create a dummy file to analyze if it doesn't exist
            const testFile = join(showcaseDir, 'test_component.ts');
            if (!existsSync(testFile)) {
                // Create a larger file to match the mock analysis "Line 10" references
                const content = `
// Test Component for Showcase
export class DataProcessor {
    private secret = "12345"; // Hardcoded secret (Line 5)

    constructor() {}

    public process(data: any) {
        // Complex logic (Line 10)
        if (data) {
            if (data.x) {
                if (data.y) {
                    if (data.z) {
                        return data.x + data.y + data.z;
                    }
                }
            }
        }
        return null;
    }
}
`;
                writeFileSync(testFile, content.trim());
            }

            const result = await rooClient.callTool({
                name: "roo_review_code",
                arguments: { file_path: testFile }
            });
            console.log("Roo Code Analysis Result:\n", result.content[0].text);

            // Clean up
            // unlinkSync(testFile);
        } catch (e) {
            console.error("Failed to execute Roo Code task:", e);
        }
    } else {
        console.warn("⚠️ Roo Code MCP client not found.");
    }

    console.log("\n✅ Showcase Simulation Complete!");
    console.log("Report generated in logs/ and ghost_logs/.");

    process.exit(0);
}

main().catch(err => {
    console.error("Fatal Error:", err);
    process.exit(1);
});
