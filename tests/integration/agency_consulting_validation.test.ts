
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";

// --- Hoisted Variables ---
const { mockLLMQueue } = vi.hoisted(() => {
    return {
        mockLLMQueue: [] as any[]
    };
});

// --- Mock Setup ---

// 1. Mock LLM (shared across all components)
const mockGenerate = vi.fn().mockImplementation(async (system: string, history: any[]) => {
    const next = mockLLMQueue.shift();
    if (!next) {
        return {
            thought: "Default agency response.",
            tool: "none",
            args: {},
            message: "Operating nominally."
        };
    }
    if (typeof next === 'function') {
        return await next(system, history);
    }
    return next;
});

const mockEmbed = vi.fn().mockImplementation(async (text: string) => {
    // Generate a pseudo-embedding based on text length/hash
    const val = text.length % 100 / 100;
    return new Array(1536).fill(val);
});

vi.mock("../../src/llm.js", () => {
    return {
        createLLM: () => ({
            embed: mockEmbed,
            generate: mockGenerate,
        }),
        LLM: class {
            embed = mockEmbed;
            generate = mockGenerate;
        },
    };
});

// 2. Mock MCP Infrastructure
import { mockToolHandlers, mockServerTools, resetMocks, MockMCP, MockMcpServer } from "../integration/test_helpers/mock_mcp_server.js";

vi.mock("../../src/mcp.js", () => ({
    MCP: MockMCP
}));

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
    McpServer: MockMcpServer
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
    StdioServerTransport: class { connect() {} }
}));

// --- Real Imports ---
import { CompanyContextServer } from "../../src/mcp_servers/company_context.js";
import { BrainServer } from "../../src/mcp_servers/brain/index.js";

describe("Agency Consulting Playbook Validation (Multi-Tenant Isolation)", () => {
    let testRoot: string;
    let mcp: MockMCP;

    // Servers
    let companyServer: CompanyContextServer;
    let brainServer: BrainServer;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockLLMQueue.length = 0;
        resetMocks();

        // 1. Setup Test Environment
        testRoot = await mkdtemp(join(tmpdir(), "agency-test-"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        // Create structure
        await mkdir(join(testRoot, ".agent", "brain", "episodic"), { recursive: true });
        await mkdir(join(testRoot, ".agent", "companies"), { recursive: true });

        // 2. Initialize Servers
        companyServer = new CompanyContextServer();
        brainServer = new BrainServer();
        mcp = new MockMCP();
    });

    afterEach(async () => {
        await rm(testRoot, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("should strictly isolate data between two different agency clients", async () => {
        const clientA = "shopfast-inc";
        const clientB = "medsecure-health";

        console.log(`\n=== Agency Consulting Validation ===`);
        console.log(`Simulating multi-tenant isolation between ${clientA} and ${clientB}`);

        // 1. Initialize Client A
        await mkdir(join(testRoot, ".agent", "companies", clientA), { recursive: true });
        const companyClient = mcp.getClient("company_context");

        await companyClient.callTool({
            name: "load_company_context",
            arguments: { company_id: clientA }
        });

        // 2. Store Data for Client A (ShopFast)
        const brainClient = mcp.getClient("brain");
        await brainClient.callTool({
            name: "brain_store",
            arguments: {
                taskId: "task-A",
                request: "Optimize checkout flow",
                solution: "Implemented 1-click buy",
                company: clientA
            }
        });
        console.log(`Stored unique data for ${clientA}`);

        // 3. Switch to Client B (MedSecure)
        await mkdir(join(testRoot, ".agent", "companies", clientB), { recursive: true });
        await companyClient.callTool({
            name: "load_company_context",
            arguments: { company_id: clientB }
        });
        console.log(`Switched context to ${clientB}`);

        // 4. Store Data for Client B
        await brainClient.callTool({
            name: "brain_store",
            arguments: {
                taskId: "task-B",
                request: "Audit HIPAA logs",
                solution: "Log rotation enabled",
                company: clientB
            }
        });
        console.log(`Stored unique data for ${clientB}`);

        // 5. Verify Isolation: Client B should NOT find Client A's data
        // Note: The Brain server uses the 'company' argument to filter or route queries.
        // We simulate a query from Client B's context.
        const queryResB = await brainClient.callTool({
            name: "brain_query",
            arguments: {
                query: "checkout flow",
                company: clientB
            }
        });
        const contentB = queryResB.content[0].text;

        expect(contentB).not.toContain("Implemented 1-click buy");
        // expect(contentB).toContain("No relevant past experiences found");
        // Note: In a mock environment with simple embeddings, we might get a "best match"
        // that is technically Client B's data (e.g. HIPAA logs).
        // The critical check is that we DO NOT see Client A's data.

        // 6. Verify Self-Consistency: Client B should find Client B's data
        const queryResB2 = await brainClient.callTool({
            name: "brain_query",
            arguments: {
                query: "HIPAA",
                company: clientB
            }
        });
        const contentB2 = queryResB2.content[0].text;
        expect(contentB2).toContain("Log rotation enabled");

        // 7. Switch back to Client A and verify data persistence
        await companyClient.callTool({
            name: "load_company_context",
            arguments: { company_id: clientA }
        });

        const queryResA = await brainClient.callTool({
            name: "brain_query",
            arguments: {
                query: "checkout",
                company: clientA
            }
        });
        const contentA = queryResA.content[0].text;
        expect(contentA).toContain("Implemented 1-click buy");
        expect(contentA).not.toContain("Log rotation enabled");

        console.log(`=== Validation PASSED: Strict Data Isolation Confirmed ===`);
    });
});
