
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { join } from 'path';
import { mkdtemp, rm, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { SwarmServer } from '../../src/mcp_servers/swarm/index.js';
import { BrainServer } from '../../src/mcp_servers/brain/index.js';
import { resetMocks, mockToolHandlers, mockServerTools } from './test_helpers/mock_mcp_server.js';

// --- Mock Dependencies ---

// 1. Mock McpServer (SDK) - captures tool registrations from Brain/Swarm servers
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', async () => {
    const { MockMcpServer } = await import('./test_helpers/mock_mcp_server.js');
    return {
        McpServer: MockMcpServer
    };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: class { connect() {} }
}));

// 2. Mock MCP Client (src/mcp.ts) - used by SwarmServer to talk to Brain
vi.mock('../../src/mcp.js', async () => {
    const { MockMCP } = await import('./test_helpers/mock_mcp_server.js');
    return {
        MCP: MockMCP
    };
});

// 3. Mock LLM - controls agent responses
const { mockLLMGenerate, mockLLMEmbed } = vi.hoisted(() => ({
    mockLLMGenerate: vi.fn(),
    mockLLMEmbed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
}));

vi.mock('../../src/llm.js', () => ({
    createLLM: () => ({
        generate: mockLLMGenerate,
        embed: mockLLMEmbed
    })
}));

// 4. Mock child_process (if needed)
vi.mock('child_process', () => ({
    spawn: vi.fn(),
    exec: vi.fn()
}));

describe('Swarm Integration (Hive Mind)', () => {
    let tempDir: string;
    let brainServer: BrainServer;
    let swarmServer: SwarmServer;

    beforeAll(() => {
        vi.useFakeTimers();
    });

    afterAll(() => {
        vi.useRealTimers();
    });

    beforeEach(async () => {
        vi.clearAllMocks();
        mockLLMEmbed.mockResolvedValue(new Array(1536).fill(0.1));
        mockLLMGenerate.mockReset();
        resetMocks();

        // Setup Temp Dir
        tempDir = await mkdtemp(join(tmpdir(), 'swarm-test-'));

        // Create necessary dirs for Brain
        await mkdir(join(tempDir, '.agent', 'brain', 'episodic'), { recursive: true });
        await mkdir(join(tempDir, '.agent', 'brain', 'sops'), { recursive: true });

        // Mock CWD and env to point to tempDir
        vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
        process.env.BRAIN_STORAGE_ROOT = join(tempDir, '.agent', 'brain', 'episodic');

        // Initialize Brain Server (registers tools to MockMCP)
        brainServer = new BrainServer();

        // Initialize Swarm Server
        swarmServer = new SwarmServer();
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it('should spawn a sub-agent and log the event to the Brain', async () => {
        // Prepare LLM response for the spawned agent's initialization
        mockLLMGenerate.mockResolvedValueOnce({
            message: "Acknowledged. I am ready to start testing."
        });

        // Act
        const result = await swarmServer.spawnSubAgent(
            "QA Engineer",
            "Test the login page",
            "Lead-Dev",
            "test-corp"
        );

        // Assert
        expect(result.content[0].text).toContain("spawned");

        // Verify agent is in workers map
        const responseJson = JSON.parse(result.content[0].text);
        const agentId = responseJson.agent_id;
        expect(swarmServer.workers.has(agentId)).toBe(true);
        expect(swarmServer.workerDetails.get(agentId)).toEqual(expect.objectContaining({
            role: "QA Engineer",
            parentId: "Lead-Dev"
        }));

        // Verify Brain Log
        // Query the Brain directly using its internal method or tool
        // Since we are in the same process, we can check the episodic memory
        // But BrainServer logic is async and might take a moment if we don't await properly.
        // SwarmServer awaits the callTool, so it should be done.

        const memories = await (brainServer as any).episodic.recall("spawned QA Engineer", 5, "test-corp");
        expect(memories.length).toBeGreaterThan(0);
        expect(memories[0].userPrompt).toContain("Task Type: spawn_subagent");
        expect(memories[0].agentResponse).toContain("Outcome: success");
        expect(memories[0].agentResponse).toContain(`Spawned QA Engineer (${agentId})`);
    });

    it('should negotiate a task between two agents and log the winner', async () => {
        // 1. Spawn Agent A (Low Cost, Low Quality)
        mockLLMGenerate.mockResolvedValueOnce({ message: "Ready." }); // Init
        const resA = await swarmServer.spawnSubAgent("Junior Dev", "Coding", "Manager");
        const agentA = JSON.parse(resA.content[0].text).agent_id;

        // 2. Spawn Agent B (High Cost, High Quality)
        mockLLMGenerate.mockResolvedValueOnce({ message: "Ready." }); // Init
        const resB = await swarmServer.spawnSubAgent("Senior Dev", "Architecture", "Manager");
        const agentB = JSON.parse(resB.content[0].text).agent_id;

        // 3. Negotiate
        // Mock responses for bids
        // Agent A bid
        mockLLMGenerate.mockResolvedValueOnce({
            message: JSON.stringify({
                cost: 20,
                quality: 60,
                rationale: "I am cheap but decent."
            })
        });
        // Agent B bid
        mockLLMGenerate.mockResolvedValueOnce({
            message: JSON.stringify({
                cost: 80,
                quality: 95,
                rationale: "I am expensive but perfect."
            })
        });

        const negotiationRes = await swarmServer.negotiateTask(
            [agentA, agentB],
            "Build a critical banking module."
        );

        // Assert
        const negotiation = JSON.parse(negotiationRes.content[0].text);

        // Scoring: Quality - (Cost / 2)
        // A: 60 - (20/2) = 50
        // B: 95 - (80/2) = 55
        // B should win.

        expect(negotiation.winner_id).toBe(agentB);
        expect(negotiation.winning_bid.quality).toBe(95);

        // Verify Brain Log
        const memories = await (brainServer as any).episodic.recall("Negotiation for", 5);
        // Find the one relevant to this task
        const relevant = memories.find((m: any) => m.agentResponse.includes("Build a critical banking module"));
        expect(relevant).toBeDefined();
        expect(relevant?.agentResponse).toContain(`Winner: ${agentB}`);
    });
});
