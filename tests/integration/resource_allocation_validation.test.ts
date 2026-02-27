import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerResourceAllocationTools } from '../../src/mcp_servers/business_ops/tools/resource_allocation.js';

// --- Mocks ---

// Mock Fleet Status Logic
const mockGetFleetStatusLogic = vi.fn();
vi.mock('../../src/mcp_servers/business_ops/tools/swarm_fleet_management.js', () => ({
    getFleetStatusLogic: () => mockGetFleetStatusLogic()
}));

// Mock Performance Analytics
const mockCollectPerformanceMetrics = vi.fn();
vi.mock('../../src/mcp_servers/business_ops/tools/performance_analytics.js', () => ({
    collectPerformanceMetrics: (timeframe: string, clientId: string) => mockCollectPerformanceMetrics(timeframe, clientId)
}));

// Mock Scaling Logic
const mockScaleSwarmLogic = vi.fn();
vi.mock('../../src/mcp_servers/scaling_engine/scaling_orchestrator.js', () => ({
    scaleSwarmLogic: (...args: any[]) => mockScaleSwarmLogic(...args)
}));

// Mock LLM
const mockLLMGenerate = vi.fn();

// Use vi.hoisted for hoisting the mock if necessary, but direct mocking is usually fine if imports are handled
// The issue might be the LLM mock structure or reset behavior.
vi.mock('../../src/llm.js', () => {
  return {
    createLLM: vi.fn(() => ({
      generate: mockLLMGenerate,
    })),
    // Also mock LLM class directly if used via `new LLM()` though the tool uses `createLLM()`
    LLM: vi.fn(),
  };
});

// Mock McpServer
const mockServer = {
    tool: vi.fn((name, desc, schema, handler) => {
        // @ts-ignore
        mockServer.tools[name] = handler;
    }),
    tools: {} as Record<string, Function>
};

describe('Resource Allocation Integration', () => {

    beforeEach(() => {
        // @ts-ignore
        mockServer.tools = {};
        vi.clearAllMocks();

        // Default Mocks
        mockGetFleetStatusLogic.mockResolvedValue([
            { company: "Client A", projectId: "p1", active_agents: 1, pending_issues: 5, health: "strained" },
            { company: "Client B", projectId: "p2", active_agents: 2, pending_issues: 0, health: "healthy" }
        ]);

        mockCollectPerformanceMetrics.mockResolvedValue({
            financial: { revenue: 1000, margin: 0.2 },
            delivery: { efficiency: 0.8 },
            client: { nps: 80 }
        });

        mockScaleSwarmLogic.mockResolvedValue("Spawned Agent X");
    });

    it('should register allocate_resources_optimally tool', () => {
        registerResourceAllocationTools(mockServer as any);
        expect(mockServer.tool).toHaveBeenCalledWith(
            "allocate_resources_optimally",
            expect.any(String),
            expect.any(Object),
            expect.any(Function)
        );
    });

    it('should generate recommendations in dry_run mode', async () => {
        registerResourceAllocationTools(mockServer as any);
        const tool = mockServer.tools['allocate_resources_optimally'];

        // Mock LLM Response for Client A (Scale Up)
        mockLLMGenerate.mockResolvedValueOnce({
            message: JSON.stringify({
                recommendation: "scale_up",
                reasoning: "High demand and good margin.",
                suggested_budget_adjustment: 0.2,
                confidence_score: 85
            })
        });

        // Mock LLM Response for Client B (Maintain)
        mockLLMGenerate.mockResolvedValueOnce({
            message: JSON.stringify({
                recommendation: "maintain",
                reasoning: "Stable.",
                confidence_score: 90
            })
        });

        const result = await tool({ dry_run: true });
        const data = JSON.parse(result.content[0].text);

        expect(data.recommendations).toHaveLength(2);

        const recA = data.recommendations.find((r: any) => r.companyName === "Client A");
        expect(recA.recommendation).toBe("scale_up");
        expect(recA.confidence_score).toBe(85);

        const recB = data.recommendations.find((r: any) => r.companyName === "Client B");
        expect(recB.recommendation).toBe("maintain");

        // Verify NO execution actions in dry_run
        expect(mockScaleSwarmLogic).not.toHaveBeenCalled();
    });

    it('should execute scaling actions when dry_run is false', async () => {
        registerResourceAllocationTools(mockServer as any);
        const tool = mockServer.tools['allocate_resources_optimally'];

        // Mock LLM Response for Client A (Scale Up)
        mockLLMGenerate.mockResolvedValueOnce({
            message: JSON.stringify({
                recommendation: "scale_up",
                reasoning: "Critical demand.",
                confidence_score: 95
            })
        });

        // Mock LLM Response for Client B
        mockLLMGenerate.mockResolvedValueOnce({
            message: JSON.stringify({ recommendation: "maintain", confidence_score: 90 })
        });

        const result = await tool({ dry_run: false });
        const data = JSON.parse(result.content[0].text);

        expect(data.execution_results).toBeDefined();
        const execA = data.execution_results.find((e: any) => e.company === "Client A");
        expect(execA.action).toBe("spawn");
        expect(execA.result).toBe("Spawned Agent X");

        expect(mockScaleSwarmLogic).toHaveBeenCalledWith(
            expect.anything(), // MCP client
            "Client A",
            "spawn",
            "specialist",
            "Assist with high demand"
        );
    });

    it('should filter clients if focus_clients provided', async () => {
        registerResourceAllocationTools(mockServer as any);
        const tool = mockServer.tools['allocate_resources_optimally'];

        mockLLMGenerate.mockResolvedValue({
            message: JSON.stringify({ recommendation: "maintain", confidence_score: 80 })
        });

        await tool({ dry_run: true, focus_clients: ["Client A"] });

        // Should only collect metrics for Client A
        expect(mockCollectPerformanceMetrics).toHaveBeenCalledTimes(1);
        expect(mockCollectPerformanceMetrics).toHaveBeenCalledWith(expect.anything(), "Client A");
    });
});
