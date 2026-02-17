import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { mkdirSync, rmSync, existsSync } from "fs";
import { MCP } from "../src/mcp.js";
import { ContextManager } from "../src/context/ContextManager.js";
import { Engine, Registry, Context } from "../src/engine/orchestrator.js";
import { LLM, LLMResponse } from "../src/llm.js";
import { Skill } from "../skills.js";

// Mock LLM
class MockLLM extends LLM {
    public generatedPrompts: string[] = [];

    constructor() {
        super({ provider: "mock", model: "mock" });
    }

    async generate(
        system: string,
        history: any[],
        signal?: AbortSignal,
        onTyping?: () => void,
    ): Promise<LLMResponse> {
        this.generatedPrompts.push(system);

        // Also capture user messages in history where injection might happen
        // Engine injects into `input` which is added to `ctx.history`.
        // But `generate` receives `system` (prompt) and `history`.

        return {
            thought: "Mock thought",
            tool: "none",
            args: {},
            message: "Mock completion",
            raw: "Mock completion",
            tools: []
        };
    }
}

// Test Engine to control input
class TestEngine extends Engine {
    private inputs: string[];

    constructor(llm: LLM, registry: Registry, mcp: MCP, inputs: string[]) {
        super(llm, registry, mcp);
        this.inputs = inputs;
    }

    protected async getUserInput(initialValue: string, interactive: boolean): Promise<string | undefined> {
        return this.inputs.shift();
    }

    // Override log to suppress output during tests
    protected log(type: 'info' | 'success' | 'warn' | 'error', message: string) {}
}

describe("Brain Integration", () => {
    let mcp: MCP;
    let contextManager: ContextManager;
    let tempDir: string;
    let companyName: string;

    beforeAll(async () => {
        tempDir = join(process.cwd(), "temp_brain_test_integration_" + Date.now());
        if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });

        process.env.BRAIN_STORAGE_ROOT = join(tempDir, "brain");
        process.env.MOCK_EMBEDDINGS = "true";
        companyName = "test_company_integration_" + Date.now();
        process.env.JULES_COMPANY = companyName;

        mcp = new MCP();
        await mcp.init();
        await mcp.startServer("brain");

        // Give server time to start
        await new Promise(r => setTimeout(r, 2000));

        contextManager = new ContextManager(mcp);
    }, 15000);

    afterAll(async () => {
        await mcp.stopServer("brain");
        try {
            await new Promise(r => setTimeout(r, 1000));
            rmSync(tempDir, { recursive: true, force: true });
            const companyDir = join(process.cwd(), ".agent", "companies", companyName);
            if (existsSync(companyDir)) {
                 rmSync(companyDir, { recursive: true, force: true });
            }
        } catch (e) {
            console.warn("Failed to cleanup temp dir:", e);
        }
    });

    it("should save context to Brain", async () => {
        const task = "Fix the login bug in auth.ts";
        const outcome = "Fixed by adding null check.";
        const artifacts = ["src/auth.ts"];

        await contextManager.saveContext(task, outcome, {}, artifacts);

        // Wait for async indexing
        await new Promise(r => setTimeout(r, 1000));
    });

    it("should recall relevant past experiences via ContextManager", async () => {
        const task = "Fix a bug in authentication";
        const result = await contextManager.loadContext(task);

        expect(result.relevant_past_experiences).toBeDefined();
        expect(result.relevant_past_experiences!.length).toBeGreaterThan(0);

        const memory = result.relevant_past_experiences![0];
        expect(memory).toContain("Fix the login bug in auth.ts");
        expect(memory).toContain("Fixed by adding null check");
        expect(memory).toContain("src/auth.ts");
    });

    it("should inject recalled experiences into Engine prompt", async () => {
        const mockLLM = new MockLLM();
        const registry = new Registry();
        const inputs = ["Fix a bug in authentication"]; // similar task

        const engine = new TestEngine(mockLLM, registry, mcp, inputs);

        const skill: Skill = {
            name: "Test Skill",
            description: "Test",
            systemPrompt: "You are a test agent.",
            tools: []
        };
        const ctx = new Context(process.cwd(), skill);

        await engine.run(ctx, undefined, { interactive: false });

        // Check history for injection
        // Engine injects memory into the user message content in history
        const userMessages = ctx.history.filter(m => m.role === "user");
        const lastUserMessage = userMessages[userMessages.length - 1];

        expect(lastUserMessage).toBeDefined();
        expect(lastUserMessage.content).toContain("[Past Experience]");
        expect(lastUserMessage.content).toContain("Fix the login bug in auth.ts");
        expect(lastUserMessage.content).toContain("src/auth.ts");
    });
});
