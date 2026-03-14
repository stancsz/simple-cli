import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrainServer } from '../../src/mcp_servers/brain/index.js';
import { generateEcosystemAuditReportSchema } from '../../src/mcp_servers/brain/tools.js';

// Mock dependencies
vi.mock('../../src/llm.js', () => {
    return {
        createLLM: vi.fn().mockReturnValue({
            generate: vi.fn().mockResolvedValue({
                raw: "Mocked Markdown Report\n- Key Decisions: None\n- Policy Deviations: None"
            }),
            embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
        })
    };
});

vi.mock('../../src/brain/episodic.js', () => {
    return {
        EpisodicMemory: vi.fn().mockImplementation(() => ({
            store: vi.fn().mockResolvedValue(true),
            recall: vi.fn().mockResolvedValue([]),
            getRecentEpisodes: vi.fn().mockResolvedValue([]),
            delete: vi.fn().mockResolvedValue(true)
        }))
    };
});

vi.mock('../../src/brain/semantic_graph.js', () => {
    return {
        SemanticGraph: vi.fn().mockImplementation(() => ({
            query: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
            addNode: vi.fn().mockResolvedValue(true),
            addEdge: vi.fn().mockResolvedValue(true)
        }))
    };
});

vi.mock('../../src/framework_ingestion/ingest.js', () => {
    return {
        FrameworkIngestionEngine: vi.fn().mockImplementation(() => ({
            scanForFrameworks: vi.fn().mockResolvedValue([]),
            registerFramework: vi.fn().mockResolvedValue(true)
        }))
    };
});

// Mock the Client class to simulate calling the ecosystem_auditor server
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
    return {
        Client: vi.fn().mockImplementation(() => ({
            connect: vi.fn().mockResolvedValue(true),
            callTool: vi.fn().mockResolvedValue({
                isError: false,
                content: [{ text: "Mocked Raw Logs from Auditor" }]
            }),
            close: vi.fn().mockResolvedValue(true)
        }))
    };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
    return {
        StdioClientTransport: vi.fn().mockImplementation(() => ({}))
    };
});

describe('Brain MCP Server - Ecosystem Audit Report', () => {
    let brainServer: BrainServer;

    beforeEach(() => {
        vi.clearAllMocks();
        brainServer = new BrainServer();
    });

    it('should successfully generate an ecosystem audit report', async () => {
        // Extract the tool handler directly from the server instance for testing
        // The server uses _requestHandlers mapping to tools/call.
        // For testing, we can use a small hack to find the tool handler.
        const toolsMap: Record<string, any> = {};

        // Intercept server.tool calls
        const mockToolFn = vi.spyOn((brainServer as any).server, 'tool').mockImplementation((name: string, desc: string, schema: any, handler: any) => {
            toolsMap[name] = handler;
        });

        // Re-run setupTools manually to capture the handler
        (brainServer as any).setupTools();

        expect(toolsMap['generate_ecosystem_audit_report']).toBeDefined();

        const handler = toolsMap['generate_ecosystem_audit_report'];
        const input = { timeframe: "last_24_hours", focus_area: "all" };

        const result = await handler(input);

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain("Mocked Markdown Report");

        // Verify EpisodicMemory.store was called
        expect((brainServer as any).episodic.store).toHaveBeenCalledWith(
            expect.stringContaining("audit-"),
            "Generate audit report for last_24_hours focusing on all",
            expect.stringContaining("Mocked Markdown Report"),
            [],
            "default",
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            "ecosystem_audit_report"
        );
    });
});
