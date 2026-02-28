import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMarketPositioningTools } from '../../src/mcp_servers/business_ops/tools/market_positioning.js';
import { MCP } from '../../src/mcp.js';

// Mock LLM
const mockGenerate = vi.fn();
vi.mock('../../src/llm.js', () => ({
    createLLM: () => ({
        generate: mockGenerate
    })
}));

// Mock MCP
const mockCallTool = vi.fn();
const mockGetClient = vi.fn();

vi.mock('../../src/mcp.js', () => {
    return {
        MCP: vi.fn().mockImplementation(() => {
            return {
                init: vi.fn().mockResolvedValue(undefined),
                getClient: mockGetClient
            };
        })
    };
});

describe('Market Positioning Automation', () => {
    let server: McpServer;
    let toolHandler: any;

    beforeEach(() => {
        vi.clearAllMocks();
        server = new McpServer({ name: 'test', version: '1.0.0' });
        registerMarketPositioningTools(server);

        // Mock the `server.tool` function to capture the handler before registering
        const mockServer = {
            tool: vi.fn((name, desc, schema, handler) => {
                if (name === "analyze_and_adjust_positioning") {
                    toolHandler = handler;
                }
            })
        };
        registerMarketPositioningTools(mockServer as any);

        mockGetClient.mockImplementation((name: string) => {
             return { callTool: mockCallTool };
        });
    });

    it('should synthesize strategy and market data and propose a pivot when requires_pivot is true', async () => {
        // Setup Mocks
        mockCallTool.mockImplementation(async ({ name, arguments: args }) => {
            if (name === "read_strategy") {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            vision: "Old Vision",
                            objectives: ["Old Obj 1"],
                            policies: { "min_margin": 0.2 }
                        })
                    }]
                };
            }
            if (name === "collect_market_data") {
                return {
                    content: [{ type: "text", text: "Market is growing fast in AI." }]
                };
            }
            return { content: [] };
        });

        mockGenerate.mockResolvedValue({
            message: JSON.stringify({
                analysis: "The market is shifting to AI rapidly.",
                proposed_strategy: {
                    vision: "New AI Vision",
                    objectives: ["New AI Obj"],
                    policies: { "min_margin": 0.2 }
                },
                requires_pivot: true
            })
        });

        // Execute Tool
        const result = await toolHandler({ sector: "Software", region: "Global" });

        // Assertions
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain("New AI Vision");
        expect(result.content[0].text).toContain("**Pivot Required:** Yes");

        // Verify the pivot was triggered
        expect(mockCallTool).toHaveBeenCalledWith({
            name: "propose_strategic_pivot",
            arguments: {
                proposal: JSON.stringify({
                    vision: "New AI Vision",
                    objectives: ["New AI Obj"],
                    policies: { "min_margin": 0.2 }
                })
            }
        });
    });

    it('should not propose a pivot when requires_pivot is false', async () => {
        // Setup Mocks
        mockCallTool.mockImplementation(async ({ name, arguments: args }) => {
            if (name === "read_strategy") {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            vision: "Old Vision",
                            objectives: ["Old Obj 1"]
                        })
                    }]
                };
            }
            if (name === "collect_market_data") {
                return {
                    content: [{ type: "text", text: "Market is stable." }]
                };
            }
            return { content: [] };
        });

        mockGenerate.mockResolvedValue({
            message: JSON.stringify({
                analysis: "Market is stable, no major changes needed.",
                proposed_strategy: {
                    vision: "Old Vision",
                    objectives: ["Old Obj 1"]
                },
                requires_pivot: false
            })
        });

        // Execute Tool
        const result = await toolHandler({ sector: "Software", region: "Global" });

        // Assertions
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain("Old Vision");
        expect(result.content[0].text).toContain("**Pivot Required:** No");

        // Verify the pivot was NOT triggered
        const pivotCalls = mockCallTool.mock.calls.filter(call => call[0].name === "propose_strategic_pivot");
        expect(pivotCalls.length).toBe(0);
    });
});
