import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MarketShockAbsorptionServer } from "../../src/mcp_servers/market_shock_absorption/index.js";

async function runDailyMarketShockAbsorption() {
    console.log(`[${new Date().toISOString()}] Starting daily Market Shock Absorption loop...`);

    const msaServer = new MarketShockAbsorptionServer();

    // In a full environment, we would use an MCP client to call the server.
    // For this scheduled script, we directly invoke the registered handlers on the underlying server object.

    // 1. Monitor Market Signals
    const monitorHandler = msaServer.server._registeredTools["monitor_market_signals"]?.handler;
    if (monitorHandler) {
        console.log("Monitoring market signals...");
        await monitorHandler({ sector: "Software Development", region: "Global" }, {} as any);
    } else {
        console.error("Tool monitor_market_signals not found.");
    }

    // 2. Evaluate Economic Risk
    const evaluateHandler = msaServer.server._registeredTools["evaluate_economic_risk"]?.handler;
    if (evaluateHandler) {
        console.log("Evaluating economic risk...");
        await evaluateHandler({ company: "default" }, {} as any);
    } else {
        console.error("Tool evaluate_economic_risk not found.");
    }

    // 3. Trigger Contingency Plan
    const triggerHandler = msaServer.server._registeredTools["trigger_contingency_plan"]?.handler;
    if (triggerHandler) {
        console.log("Triggering contingency plan if necessary...");
        await triggerHandler({ company: "default" }, {} as any);
    } else {
        console.error("Tool trigger_contingency_plan not found.");
    }

    console.log(`[${new Date().toISOString()}] Finished Market Shock Absorption loop.`);
}

runDailyMarketShockAbsorption().catch(console.error);
