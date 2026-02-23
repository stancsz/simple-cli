import { describe, it, expect, vi, beforeEach } from "vitest";
import { DesktopRouter } from "../../src/mcp_servers/desktop_orchestrator/router.js";
import { DesktopDriver } from "../../src/mcp_servers/desktop_orchestrator/types.js";
import { logMetric } from "../../src/logger.js";

// Mock Logger to verify metrics
vi.mock("../../src/logger.js", () => ({
    logMetric: vi.fn().mockResolvedValue(undefined)
}));

// Mock LLM
vi.mock("../../src/llm.js", () => ({
    createLLM: () => ({
        generate: vi.fn().mockImplementation(async (prompt) => {
             if (prompt.includes("visual")) return { message: "anthropic" };
             if (prompt.includes("complex")) return { message: "skyvern" };
             return { message: "stagehand" };
        }),
    }),
}));

class MockDriver implements DesktopDriver {
    name: string;
    constructor(name: string) {
        this.name = name;
    }
    async init() {}
    async navigate(url: string) {
        // Simulate latency between 10ms and 50ms
        await new Promise(r => setTimeout(r, 10 + Math.random() * 40));
        // Simulate 10% failure rate
        if (Math.random() < 0.1) throw new Error("Chaos Error");
        return `Navigated to ${url}`;
    }
    async click() { return ""; }
    async type() { return ""; }
    async screenshot() { return ""; }
    async extract_text() { return ""; }
    async execute_complex_flow() { return ""; }
    async shutdown() {}
}

describe("Desktop Orchestrator Stress Test", () => {
    let router: DesktopRouter;

    beforeEach(() => {
        vi.clearAllMocks();
        router = new DesktopRouter();
        // Overwrite real drivers with mocks
        router.registerDriver(new MockDriver("stagehand"));
        router.registerDriver(new MockDriver("anthropic"));
        router.registerDriver(new MockDriver("openai"));
        router.registerDriver(new MockDriver("skyvern"));
    });

    it("should handle 100 concurrent tasks with routing and execution", async () => {
        const tasks = Array.from({ length: 100 }, (_, i) => {
            if (i % 3 === 0) return `Task ${i} use anthropic`; // Explicit
            if (i % 3 === 1) return `Task ${i} complex site`; // Implicit via LLM
            return `Task ${i} simple check`; // Default
        });

        console.log("Starting 100 concurrent tasks...");
        const start = Date.now();

        const results = await Promise.allSettled(tasks.map(async (task) => {
            try {
                const driver = await router.selectDriver(task);
                return await driver.navigate("http://example.com");
            } catch (e) {
                throw e;
            }
        }));

        const duration = Date.now() - start;
        console.log(`Completed in ${duration}ms`);

        const succeeded = results.filter(r => r.status === "fulfilled").length;
        const failed = results.filter(r => r.status === "rejected").length;

        console.log(`Success: ${succeeded}, Failed: ${failed}`);

        // We expect mostly success, but some chaos failures are allowed/expected.
        // The router itself shouldn't crash.
        expect(succeeded + failed).toBe(100);
        expect(succeeded).toBeGreaterThan(50); // At least 50% should pass despite chaos

        // Verify metrics logged
        // 100 routing decisions + 100 execution logs (success or failure)
        // routing decision logs happen in selectDriver
        // execution logs happen in driver.navigate (which is our mock here? No wait.)

        // WAIT: The MockDriver above does NOT call logMetric.
        // The real drivers do.
        // But I replaced the drivers with MockDriver.
        // So I need to verify that `logMetric` was called by `selectDriver` (the router).

        // logMetric is called for routing decisions.
        // It is NOT called for execution latency in this test because MockDriver doesn't call it.
        // That's fine, we are testing the Orchestrator (Router) resilience here primarily.

        // We expect at least 100 calls to logMetric (for routing).
        expect(logMetric).toHaveBeenCalledTimes(100);
    });
});
