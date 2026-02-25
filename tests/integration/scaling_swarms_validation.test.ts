import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerScalingSwarmsTools, setTestSwarmServer, setTestGetLinearClient } from '../../src/mcp_servers/business_ops/tools/scaling_swarms.js';
import assert from 'assert';

// Mock SwarmServer methods
const mockSpawnSubAgent = async (role: string, task: string) => {
    console.log(`[Mock] Spawning ${role} for ${task}`);
    return { content: [{ type: 'text' as const, text: 'Spawned' }] };
};
const mockTerminateAgent = async (id: string) => {
    console.log(`[Mock] Terminating ${id}`);
    return { content: [{ type: 'text' as const, text: 'Terminated' }] };
};
const mockListAgents = async () => ({ content: [] });
const mockWorkerDetails = new Map();

// Mock Object
const mockSwarmServer = {
    workerDetails: mockWorkerDetails,
    spawnSubAgent: mockSpawnSubAgent,
    terminateAgent: mockTerminateAgent,
    listAgents: mockListAgents
};

// Mock Linear Client Function
let mockIssuesData: any[] = [];
const mockGetLinearClient = () => ({
    issues: async () => ({ nodes: mockIssuesData })
});

// Inject mocks
setTestSwarmServer(mockSwarmServer);
setTestGetLinearClient(mockGetLinearClient);

async function runTest() {
    console.log("Starting Manual Validation...");
    const server = new McpServer({ name: 'test', version: '1.0' });

    // Capture tools
    const tools = new Map();
    // Override tool registration to capture handlers
    (server as any).tool = (name: string, desc: string, schema: any, handler: any) => {
        tools.set(name, handler);
        return server;
    };

    registerScalingSwarmsTools(server);

    const monitorWorkload = tools.get('monitor_workload');
    if (!monitorWorkload) throw new Error("monitor_workload tool not found");

    // Test Case 1: Scale Up
    console.log("\n--- Test Case 1: Scale Up ---");
    // Config: threshold 5. We have 10 bugs. 0 agents.
    // Should spawn 1 agent (count=1 in config).
    mockIssuesData = new Array(10).fill({ id: 'issue-1', labels: { nodes: [{ name: 'Bug' }] } });
    mockWorkerDetails.clear();

    const resultUp = await monitorWorkload({});
    console.log("Result:", resultUp.content[0].text);

    if (!resultUp.content[0].text.includes('Scaling up: Spawning 1')) {
        throw new Error(`FAILED: Expected 'Scaling up: Spawning 1', got '${resultUp.content[0].text}'`);
    }

    // Test Case 2: Scale Down
    console.log("\n--- Test Case 2: Scale Down ---");
    // Config: cooldown 2. We have 1 bug. 3 agents.
    // Should terminate.
    mockIssuesData = new Array(1).fill({ id: 'issue-1', labels: { nodes: [{ name: 'Bug' }] } });
    mockWorkerDetails.set('agent-1', { role: 'support_agent' });
    mockWorkerDetails.set('agent-2', { role: 'support_agent' });
    mockWorkerDetails.set('agent-3', { role: 'support_agent' });

    const resultDown = await monitorWorkload({});
    console.log("Result:", resultDown.content[0].text);

    if (!resultDown.content[0].text.includes('Scaling down: Terminating 1')) {
        throw new Error(`FAILED: Expected 'Scaling down: Terminating 1', got '${resultDown.content[0].text}'`);
    }

    console.log("\nSUCCESS: All manual tests passed.");
}

runTest().catch(e => {
    console.error(e);
    process.exit(1);
});
