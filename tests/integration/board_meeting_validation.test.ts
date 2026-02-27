import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBoardMeetingTools } from '../../src/mcp_servers/brain/tools/convene_board_meeting.js';
import { EpisodicMemory } from '../../src/brain/episodic.js';
import { createLLM } from '../../src/llm.js';

// Mock dependencies
vi.mock('../../src/brain/episodic.js');
vi.mock('../../src/llm.js');
vi.mock('../../src/mcp_servers/business_ops/tools/swarm_fleet_management.js', () => ({
    getFleetStatusLogic: vi.fn().mockResolvedValue([
        { company: 'test_client', health: 'healthy', active_agents: 5 }
    ])
}));
vi.mock('../../src/mcp_servers/business_ops/tools/performance_analytics.js', () => ({
    collectPerformanceMetrics: vi.fn().mockResolvedValue({
        financial: { revenue: 1000, profit: 200 },
        delivery: { efficiency: 0.9 },
        client: { satisfaction: 90 }
    })
}));
vi.mock('../../src/mcp_servers/brain/tools/strategy.js', () => ({
    readStrategy: vi.fn().mockResolvedValue({
        vision: 'Old Vision',
        objectives: ['Grow'],
        policies: {},
        timestamp: Date.now()
    }),
    proposeStrategicPivot: vi.fn().mockResolvedValue({
        vision: 'New Vision',
        objectives: ['Pivot'],
        policies: {},
        timestamp: Date.now()
    })
}));
vi.mock('../../src/mcp_servers/brain/tools/scan_strategic_horizon.js', () => ({
    scanStrategicHorizon: vi.fn().mockResolvedValue({
        opportunities: ['AI'],
        threats: ['None']
    })
}));
vi.mock('../../src/mcp_servers/business_ops/tools/policy_engine.js', () => ({
    updateOperatingPolicyLogic: vi.fn().mockResolvedValue({
        version: 2,
        name: 'New Policy',
        isActive: true
    })
}));

describe('Autonomous Board Meeting', () => {
    let server: McpServer;
    let mockLLM: any;
    let mockMemory: any;

    beforeEach(() => {
        vi.resetAllMocks();

        // Setup Mock Memory
        mockMemory = {
            store: vi.fn().mockResolvedValue(true),
            recall: vi.fn().mockResolvedValue([]),
        };
        (EpisodicMemory as any).mockImplementation(() => mockMemory);

        // Setup Mock LLM
        mockLLM = {
            generate: vi.fn()
        };
        (createLLM as any).mockReturnValue(mockLLM);

        server = new McpServer({ name: 'test-brain', version: '1.0.0' });
        registerBoardMeetingTools(server);
    });

    it('should convene a board meeting and execute a strategic pivot', async () => {
        // Mock LLM Responses for the 3 rounds
        mockLLM.generate
            .mockResolvedValueOnce({ message: "CSO Analysis: We need to pivot to AI." }) // CSO
            .mockResolvedValueOnce({ message: "CFO Analysis: We can afford it." }) // CFO
            .mockResolvedValueOnce({ // CEO
                message: JSON.stringify({
                    decision: "strategic_pivot",
                    rationale: "Align with market.",
                    meeting_minutes: "Agreed to pivot.",
                    action_payload: {
                        proposal: "Pivot to AI First strategy."
                    }
                })
            });

        // Use _registeredTools, which seems to be an object/array in some versions.
        // Let's try to find the tool by iterating or checking properties.
        const toolsMap = (server as any)._registeredTools;
        let tool;
        if (toolsMap instanceof Map) {
             tool = toolsMap.get('convene_board_meeting');
        } else {
            // It might be an object
             tool = toolsMap['convene_board_meeting'];
        }

        expect(tool).toBeDefined();

        // Execute the tool handler directly
        // The handler signature is likely (args: any, extra: any) => Promise<Result>
        const result = await tool.handler({ company: 'test_corp', dry_run: false });

        // Verify Content
        const content = JSON.parse(result.content[0].text);
        expect(content.status).toBe('success');
        expect(content.meeting_minutes.outcome).toBe('strategic_pivot');

        // Verify LLM interactions (3 personas)
        expect(mockLLM.generate).toHaveBeenCalledTimes(3);

        // Verify Execution
        const { proposeStrategicPivot } = await import('../../src/mcp_servers/brain/tools/strategy.js');
        expect(proposeStrategicPivot).toHaveBeenCalledWith(
            expect.anything(), // memory
            expect.anything(), // llm
            "Pivot to AI First strategy.",
            "test_corp"
        );

        // Verify Memory Storage
        expect(mockMemory.store).toHaveBeenCalledWith(
            expect.stringContaining('board_meeting'),
            "Convene Autonomous Board Meeting",
            expect.any(String), // JSON body
            [],
            "test_corp",
            undefined, undefined, undefined, undefined, 0, 0,
            "board_meeting"
        );
    });

    it('should convene a board meeting and execute a policy update', async () => {
        // Mock LLM Responses
        mockLLM.generate
            .mockResolvedValueOnce({ message: "CSO: Steady course." })
            .mockResolvedValueOnce({ message: "CFO: Margins are low. Increase min margin." })
            .mockResolvedValueOnce({
                message: JSON.stringify({
                    decision: "policy_update",
                    rationale: "Improve profitability.",
                    action_payload: {
                        policy_name: "Profit First",
                        description: "Increase margins",
                        min_margin: 0.35,
                        risk_tolerance: "low",
                        max_agents_per_swarm: 3
                    }
                })
            });

        const toolsMap = (server as any)._registeredTools;
        let tool;
        if (toolsMap instanceof Map) {
             tool = toolsMap.get('convene_board_meeting');
        } else {
             tool = toolsMap['convene_board_meeting'];
        }

        const result = await tool.handler({ company: 'test_corp', dry_run: false });

        const content = JSON.parse(result.content[0].text);
        expect(content.status).toBe('success');
        expect(content.meeting_minutes.outcome).toBe('policy_update');

        // Verify Execution
        const { updateOperatingPolicyLogic } = await import('../../src/mcp_servers/business_ops/tools/policy_engine.js');
        expect(updateOperatingPolicyLogic).toHaveBeenCalledWith(
            expect.anything(),
            "Profit First",
            "Increase margins",
            0.35,
            "low",
            3,
            "test_corp"
        );
    });

    it('should respect dry_run parameter', async () => {
        mockLLM.generate
            .mockResolvedValueOnce({ message: "CSO: Pivot." })
            .mockResolvedValueOnce({ message: "CFO: Okay." })
            .mockResolvedValueOnce({
                message: JSON.stringify({
                    decision: "strategic_pivot",
                    action_payload: { proposal: "Pivot" }
                })
            });

        const toolsMap = (server as any)._registeredTools;
        let tool;
        if (toolsMap instanceof Map) {
             tool = toolsMap.get('convene_board_meeting');
        } else {
             tool = toolsMap['convene_board_meeting'];
        }
        const result = await tool.handler({ company: 'test_corp', dry_run: true });

        const content = JSON.parse(result.content[0].text);
        expect(content.status).toBe('success');
        expect(content.meeting_minutes.executed).toBe(false);

        // Verify NO Execution
        const { proposeStrategicPivot } = await import('../../src/mcp_servers/brain/tools/strategy.js');
        expect(proposeStrategicPivot).not.toHaveBeenCalled();
    });
});
