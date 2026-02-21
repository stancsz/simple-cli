import { MCPManager } from '../src/mcp_manager.js';
import { performance } from 'perf_hooks';

async function benchmark() {
    console.log("Starting benchmark...");
    console.log("Node Version:", process.version);

    // ---------------------------------------------------------
    // Scenario 1: Lazy Loading (Current Implementation)
    // ---------------------------------------------------------
    const lazyManager = new MCPManager();
    const startLazy = performance.now();

    await lazyManager.init();
    const toolsLazy = await lazyManager.getTools();

    const endLazy = performance.now();
    const timeLazy = endLazy - startLazy;

    console.log(`\n[Lazy Loading]`);
    console.log(`Startup Time: ${timeLazy.toFixed(2)}ms`);
    console.log(`Tools Found: ${toolsLazy.length}`);

    // ---------------------------------------------------------
    // Scenario 2: Eager Loading (Simulated Old Behavior)
    // ---------------------------------------------------------
    // We assume the old behavior started these servers:
    // brain, context_server, company_context, aider-server, claude-server

    const eagerManager = new MCPManager();
    const startEager = performance.now();

    await eagerManager.init();

    const coreServers = ["brain", "context_server", "company_context"];
    // We skip aider/claude in benchmark to avoid API key errors or external dependency timeouts
    // dominating the benchmark if they aren't configured.
    // Even just starting 3 local servers should show a difference.

    console.log(`\n[Eager Loading Simulation] Starting ${coreServers.join(', ')}...`);

    for (const s of coreServers) {
        try {
            await eagerManager.startServer(s);
        } catch (e) {
            console.log(`  - Failed to start ${s}: ${(e as Error).message}`);
        }
    }

    const toolsEager = await eagerManager.getTools();

    const endEager = performance.now();
    const timeEager = endEager - startEager;

    console.log(`[Eager Loading]`);
    console.log(`Startup Time: ${timeEager.toFixed(2)}ms`);
    console.log(`Tools Found: ${toolsEager.length}`);

    // ---------------------------------------------------------
    // Results
    // ---------------------------------------------------------
    console.log(`\n------------------------------------------------`);
    console.log(`Improvement: ${(timeEager - timeLazy).toFixed(2)}ms faster`);
    console.log(`Speedup Factor: ${(timeEager / timeLazy).toFixed(2)}x`);
    console.log(`------------------------------------------------`);

    // Explicitly exit to ensure script finishes even if servers are running
    process.exit(0);
}

benchmark().catch(console.error);
