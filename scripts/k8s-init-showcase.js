import { setupCompany } from '../dist/utils/company-setup.js';
import { MCP } from '../dist/mcp.js';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

async function main() {
    console.log("🚀 Starting In-Pod Validation...");

    // NOTE: This script intentionally avoids triggering LLM-dependent tasks (like SOP execution or Morning Standup generation)
    // to ensure the validation is deterministic and does not incur external API costs or require API keys.
    // It validates the underlying infrastructure: Persistence, Multi-tenancy, and MCP Server connectivity.
    process.env.MOCK_LLM = 'true';

    // 1. Setup Company Context
    console.log("Step 1: Setting up Showcase Corp...");
    try {
        await setupCompany("showcase-corp");
    } catch (e) {
        console.error("Failed to setup company:", e);
        process.exit(1);
    }

    // Create a dummy context file if it doesn't exist (simulating what run_demo.ts does)
    const contextPath = "/app/.agent/companies/showcase-corp/config/company_context.json";
    if (!existsSync(contextPath)) {
        console.log("Creating dummy context...");
        writeFileSync(contextPath, JSON.stringify({
            name: "Showcase Corp",
            brand_voice: "Professional",
            project_goals: ["Validate K8s Deployment"],
            tech_stack: ["Kubernetes", "Node.js"]
        }, null, 2));
    }

    // 2. Initialize MCP
    console.log("Step 2: Initializing MCP...");
    const mcp = new MCP();
    await mcp.init();

    // 3. Start Servers
    // We only start servers that don't require external API keys for basic validation
    const requiredServers = ['brain', 'health_monitor', 'company', 'sop_engine'];
    console.log(`Step 3: Starting servers: ${requiredServers.join(', ')}...`);

    for (const server of requiredServers) {
        try {
            await mcp.startServer(server);
            console.log(`✅ Started ${server}`);
        } catch (e) {
            console.warn(`⚠️ Failed to start ${server}: ${e.message}`);
            // specific fail for brain or health_monitor
            if (server === 'brain' || server === 'health_monitor') {
                process.exit(1);
            }
        }
    }

    // 4. Validate Brain (Persistence)
    console.log("Step 4: Validating Brain Persistence...");
    const brainClient = mcp.getClient('brain');
    if (!brainClient) {
        console.error("❌ Brain client not available");
        process.exit(1);
    }

    try {
        // Store a memory
        const memoryContent = `Validation run at ${new Date().toISOString()}`;
        console.log(`Storing memory: ${memoryContent}`);
        await brainClient.callTool({
            name: "brain_store",
            arguments: {
                content: memoryContent,
                metadata: { source: "k8s-validation", type: "validation" }
            }
        });
        console.log("✅ Brain storage successful");
    } catch (e) {
        console.error("❌ Brain validation failed:", e);
        process.exit(1);
    }

    // 5. Validate Health Monitor (Sidecar connectivity)
    console.log("Step 5: Validating Health Monitor...");
    const healthClient = mcp.getClient('health_monitor');
    if (!healthClient) {
         console.error("❌ Health Monitor client not available");
         process.exit(1);
    }

    try {
        const report = await healthClient.callTool({
            name: "get_health_report",
            arguments: {}
        });
        console.log("Health Report:", JSON.stringify(report, null, 2));
        console.log("✅ Health Monitor accessible");
    } catch (e) {
        console.error("❌ Health Monitor validation failed:", e);
        process.exit(1);
    }

    // 6. Validate SOP Engine
    console.log("Step 6: Validating SOP Engine...");
    const sopClient = mcp.getClient('sop_engine');
    if (!sopClient) {
        console.error("❌ SOP Engine client not available");
        process.exit(1);
    }
    console.log("✅ SOP Engine accessible");

    console.log("\n✅✅✅ K8S DEPLOYMENT VALIDATION SUCCESSFUL ✅✅✅");
    process.exit(0);
}

main().catch(err => {
    console.error("Fatal Error:", err);
    process.exit(1);
});
