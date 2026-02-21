
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { mkdtemp, rm, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { BrainServer } from "../../src/mcp_servers/brain/index.js";

// Mock LLM to avoid external calls and costs
vi.mock("../../src/llm.js", () => {
    return {
        createLLM: () => ({
            // Smart mock embedding: encodes the first number found in the text into the vector
            // This allows us to perform "semantic search" for specific IDs (e.g. "Solution 42")
            embed: vi.fn().mockImplementation(async (text) => {
                const vec = new Array(1536).fill(0.01);
                const match = text.match(/(\d+)/);
                if (match) {
                    // Encode the number in the first dimension.
                    // This makes vectors with the same number very close (distance ~0)
                    // and vectors with different numbers far apart.
                    vec[0] = parseInt(match[1]);
                }
                return vec;
            }),
            generate: vi.fn().mockResolvedValue("Mock response"),
        }),
    };
});

// Capture tool handlers
const toolHandlers = new Map<string, Function>();

// Mock McpServer to capture tool handlers
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
    return {
        McpServer: class {
            constructor() {}
            tool(name: string, description: string, schema: any, handler: Function) {
                toolHandlers.set(name, handler);
            }
            async connect() {}
        }
    };
});

// Mock MCP SDK stdio to avoid transport issues
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
    StdioServerTransport: class { connect() {} }
}));

describe("Brain Production Validation", () => {
    let testRoot: string;
    let brainServer: BrainServer;

    // Test Companies
    const COMPANIES = ["AlphaCorp", "BetaLtd", "GammaInc", "DeltaCo", "EpsilonLLC"];

    beforeAll(() => {
        // Do NOT set MOCK_EMBEDDINGS=true, so EpisodicMemory uses our smart mock in llm.js
        delete process.env.MOCK_EMBEDDINGS;
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    beforeEach(async () => {
        toolHandlers.clear();
        testRoot = await mkdtemp(join(tmpdir(), "brain-prod-test-"));

        // Mock process.cwd() to point to our temp dir so BrainServer uses it for storage
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        // Create necessary directories
        await mkdir(join(testRoot, ".agent", "brain", "episodic"), { recursive: true });
        await mkdir(join(testRoot, ".agent", "sops"), { recursive: true });

        brainServer = new BrainServer();
        // Silence console logs during test
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(async () => {
        // Cleanup
        await rm(testRoot, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    // Helper to call tools
    async function callTool(name: string, args: any) {
        const handler = toolHandlers.get(name);
        if (!handler) throw new Error(`Tool ${name} not found`);
        return await handler(args);
    }

    it("should handle high concurrency multi-tenant load without data loss", async () => {
        // Use console.info to bypass mock
        console.info(`\nStarting concurrent load test with ${COMPANIES.length} companies...`);
        const OPS_PER_COMPANY = 100; // Increased load to verify hardening
        const startTime = Date.now();

        const allPromises: Promise<any>[] = [];

        // Generate load
        for (const company of COMPANIES) {
            for (let i = 0; i < OPS_PER_COMPANY; i++) {
                // Mix of Store and Query
                const storePromise = callTool("brain_store", {
                    taskId: `task-${company}-${i}`,
                    request: `Request ${i} for ${company}`,
                    solution: `Solution ${i} for ${company}`, // "39" will be encoded in vector
                    artifacts: JSON.stringify([`file-${i}.ts`]),
                    company: company
                });
                allPromises.push(storePromise);

                // Add some queries in the mix
                if (i % 5 === 0) {
                     const queryPromise = callTool("brain_query", {
                        query: `Request ${i}`,
                        limit: 5,
                        company: company
                    });
                    allPromises.push(queryPromise);
                }
            }
        }

        await Promise.all(allPromises);
        const duration = Date.now() - startTime;
        console.info(`Completed ${allPromises.length} operations in ${duration}ms (${(allPromises.length / (duration/1000)).toFixed(2)} ops/sec)`);

        // Verify Data Integrity
        console.info("Verifying data integrity...");
        for (const company of COMPANIES) {
            // Check random task existence
            // We search for "Solution 42" which has "42" encoded.
            // The stored memory `Task: ... Solution: Solution 42 ...` also has "42" encoded.
            // So they should match perfectly.
            const res = await callTool("brain_query", {
                query: `Solution 42 for ${company}`,
                limit: 10,
                company: company
            });

            expect(res.content[0].text).toContain(`task-${company}-42`);
            expect(res.content[0].text).toContain(`Solution 42 for ${company}`);

            // Ensure no cross-contamination
            const otherCompany = COMPANIES.find(c => c !== company)!;
            expect(res.content[0].text).not.toContain(otherCompany);
        }
    }, 30000);

    it("should enforce strict data isolation between tenants", async () => {
        // 1. Store distinct data for Company A
        await callTool("brain_store", {
            taskId: "secret-task-A",
            request: "Top Secret Project Alpha (100)",
            solution: "Launch codes for Alpha (100)",
            company: "AlphaCorp"
        });

        // 2. Store distinct data for Company B
        await callTool("brain_store", {
            taskId: "secret-task-B",
            request: "Top Secret Project Beta (200)",
            solution: "Launch codes for Beta (200)",
            company: "BetaLtd"
        });

        // 3. Company A queries for B's data (200)
        const queryA = await callTool("brain_query", {
            query: "Project Beta (200)",
            company: "AlphaCorp"
        });

        // Should NOT find it
        if (!queryA.content[0].text.includes("No relevant memories found")) {
            expect(queryA.content[0].text).not.toContain("secret-task-B");
        }

        // 4. Company B queries for A's data (100)
        const queryB = await callTool("brain_query", {
            query: "Project Alpha (100)",
            company: "BetaLtd"
        });

        if (!queryB.content[0].text.includes("No relevant memories found")) {
            expect(queryB.content[0].text).not.toContain("secret-task-A");
        }
    });

    it("should persist data across server restarts", async () => {
        const company = "PersistCorp";
        const taskId = "persistence-test-1";

        // 1. Store data
        await callTool("brain_store", {
            taskId: taskId,
            request: "Will this persist? (999)",
            solution: "Yes it should. (999)",
            company: company
        });

        // 2. Simulate Restart
        const newServer = new BrainServer();

        // 3. Query with new server instance
        const res = await callTool("brain_query", {
            query: "persist (999)",
            company: company
        });

        expect(res.content[0].text).toContain(taskId);
        expect(res.content[0].text).toContain("Yes it should");
    });

    it("should handle concurrent graph operations", async () => {
        const company = "GraphCorp";
        console.info("Starting concurrent graph operations...");

        const nodes = ["NodeA", "NodeB", "NodeC", "NodeD", "NodeE"];
        const promises = [];

        // Add nodes concurrently
        for (const node of nodes) {
            promises.push(callTool("brain_update_graph", {
                operation: "add_node",
                args: JSON.stringify({ id: node, type: "concept", properties: { desc: `Description for ${node}` } }),
                company: company
            }));
        }

        await Promise.all(promises);

        // Add edges concurrently
        const edgePromises = [];
        for (let i = 0; i < nodes.length - 1; i++) {
            edgePromises.push(callTool("brain_update_graph", {
                operation: "add_edge",
                args: JSON.stringify({ from: nodes[i], to: nodes[i+1], relation: "connects_to" }),
                company: company
            }));
        }

        await Promise.all(edgePromises);

        // Verify Graph
        const res = await callTool("brain_query_graph", {
            query: "Node",
            company: company
        });

        const graphData = JSON.parse(res.content[0].text);

        // Expect all nodes
        for (const node of nodes) {
            expect(graphData.nodes.some((n: any) => n.id === node)).toBe(true);
        }

        // Expect all edges
        expect(graphData.edges.length).toBeGreaterThanOrEqual(nodes.length - 1);
    });
});
