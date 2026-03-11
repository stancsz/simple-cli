import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAdaptiveRoutingTools } from '../../src/mcp_servers/business_ops/tools/adaptive_routing.js';
// We need to avoid circular dependencies in the tests by carefully mocking/importing
import { LLM } from '../../src/llm.js';
import { AdaptiveRouter } from '../../src/llm/router.js';
import * as configModule from '../../src/config.js';
import * as loggerModule from '../../src/logger.js';

vi.mock('../../src/logger.js', () => ({
    logMetric: vi.fn(),
}));

// Mock the business_ops client to avoid full subprocess spawning in tests
const mockBusinessClient = {
    callTool: vi.fn()
};

// We will mock AdaptiveRouter's connectToBusinessOps to return our mock client
vi.spyOn(AdaptiveRouter.prototype as any, 'connectToBusinessOps').mockResolvedValue(mockBusinessClient);

describe('Adaptive Model Routing Validation (Phase 28)', () => {
    let mockServer: any;
    let evalTool: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup mock MCP server
        mockServer = {
            tool: vi.fn(),
            _registeredTools: {} as Record<string, any>
        };

        // Capture tool registration
        mockServer.tool.mockImplementation((name: string, desc: string, schema: any, handler: any) => {
            mockServer._registeredTools[name] = { handler, schema };
        });

        registerAdaptiveRoutingTools(mockServer as unknown as McpServer);
        evalTool = mockServer._registeredTools['evaluate_task_complexity'].handler;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Task Complexity Evaluation (Heuristic Fallback)', () => {
        // We test the heuristic fallback because the primary tool invokes the LLM,
        // which we don't want to actually run in unit tests without mocking generateText entirely.

        it('should evaluate a short, simple prompt as low complexity', async () => {
            // Force the fallback by making the mock LLM inside throw
            vi.spyOn(await import('../../src/llm.js'), 'createLLM').mockReturnValue({
                generate: vi.fn().mockRejectedValue(new Error("Simulated LLM failure")),
                disableRouting: true
            } as any);

            const prompt = "Format this JSON nicely: {'a': 1}";
            const response = await evalTool({ prompt });

            expect(response.content[0].text).toBeDefined();
            const result = JSON.parse(response.content[0].text);

            // Base score 3, no keywords, length < 5000 -> score 3
            expect(result.score).toBe(3);
            expect(result.recommended_model).toBe('claude-3-haiku-20240307');
        });

        it('should evaluate a prompt with complex keywords as high complexity', async () => {
             vi.spyOn(await import('../../src/llm.js'), 'createLLM').mockReturnValue({
                generate: vi.fn().mockRejectedValue(new Error("Simulated LLM failure")),
                disableRouting: true
            } as any);

            const prompt = "Design a strategic microservice architecture to optimize our database. Analyze the impact.";
            const response = await evalTool({ prompt });

            expect(response.content[0].text).toBeDefined();
            const result = JSON.parse(response.content[0].text);

            // Base 3 + 1 (has keywords) + 2 (matches > 2) = 6.
            expect(result.score).toBe(6);
            expect(result.recommended_model).toBe('claude-3-5-sonnet-latest');
        });
    });

    describe('AdaptiveRouter Logic', () => {
        beforeEach(() => {
            // Mock config to enable routing
            vi.spyOn(configModule, 'loadConfig').mockResolvedValue({
                routing: {
                    enabled: true,
                    defaultModel: 'claude-3-5-sonnet-latest',
                    modelMap: {
                         'claude-3-haiku-20240307': 'custom-fast-model'
                    },
                    costProfiles: {
                        'claude-3-opus-20240229': 15.0,
                        'claude-3-haiku-20240307': 0.25,
                        'custom-fast-model': 0.20
                    }
                }
            });
        });

        it('should route to the appropriate model based on complexity score', async () => {
            const router = new AdaptiveRouter({ provider: 'anthropic', model: 'claude-3-opus-20240229' });

            // Mock the evaluation tool method directly on the router instance
            const evalSpy = vi.spyOn(router as any, 'evaluateTaskComplexity').mockResolvedValue({
                score: 2,
                recommended_model: 'claude-3-haiku-20240307',
                reasoning: 'Simple task'
            });

            // Mock the createLLMInstance to return a mock LLM so we don't actually hit external API
            const mockRoutedGenerate = vi.fn().mockResolvedValue({
                 thought: '', tool: 'none', args: {}, message: 'Success', raw: '{}'
            });
            const createLLMSpy = vi.spyOn(await import('../../src/llm.js'), 'createLLMInstance').mockReturnValue({
                generate: mockRoutedGenerate
            } as any);

            await router.generate("System prompt", [{ role: "user", content: "Simple user message" }]);

            // Ensure we evaluated complexity
            expect(evalSpy).toHaveBeenCalledWith(expect.stringContaining("Simple user message"));

            // Ensure it mapped 'claude-3-haiku-20240307' to 'custom-fast-model' via modelMap
            expect(createLLMSpy).toHaveBeenCalledWith('custom-fast-model');

            // Verify metrics were logged correctly
            expect(loggerModule.logMetric).toHaveBeenCalledWith(
                'llm', 'llm_router_complexity_score', 2, { model: 'claude-3-haiku-20240307' }
            );

            expect(loggerModule.logMetric).toHaveBeenCalledWith(
                'llm', 'llm_router_model_selected', 1, { model: 'claude-3-haiku-20240307' }
            );

            // Cost calculation: 15.0 (Opus base) - 0.20 (custom-fast-model) = 14.8 savings
            expect(loggerModule.logMetric).toHaveBeenCalledWith(
                'llm', 'llm_cost_savings_estimated', 14.8, { model: 'custom-fast-model' }
            );

            // Verify the routed LLM had routing disabled to prevent infinite loops
            const routedInstance = createLLMSpy.mock.results[0].value;
            expect(routedInstance.disableRouting).toBe(true);
        });

        it('should bypass routing if disabled in config', async () => {
            vi.spyOn(configModule, 'loadConfig').mockResolvedValueOnce({
                routing: { enabled: false }
            });

            const router = new AdaptiveRouter({ provider: 'anthropic', model: 'claude-3-opus-20240229' });

            // Mock super.generate
            const superGenerateSpy = vi.spyOn(Object.getPrototypeOf(AdaptiveRouter.prototype), 'generate').mockResolvedValue({
                 thought: '', tool: 'none', args: {}, message: 'Bypassed', raw: '{}'
            });

            await router.generate("System prompt", [{ role: "user", content: "Simple user message" }]);

            expect(mockBusinessClient.callTool).not.toHaveBeenCalled();
            expect(superGenerateSpy).toHaveBeenCalled();
        });

        it('should bypass routing if disableRouting property is set on instance', async () => {
             const router = new AdaptiveRouter({ provider: 'anthropic', model: 'claude-3-opus-20240229' });
             router.disableRouting = true;

             const superGenerateSpy = vi.spyOn(Object.getPrototypeOf(AdaptiveRouter.prototype), 'generate').mockResolvedValue({
                 thought: '', tool: 'none', args: {}, message: 'Bypassed', raw: '{}'
            });

            await router.generate("System prompt", [{ role: "user", content: "Simple user message" }]);

            expect(mockBusinessClient.callTool).not.toHaveBeenCalled();
            expect(superGenerateSpy).toHaveBeenCalled();
        });
    });
});
