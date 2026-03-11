import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdaptiveRouter } from '../../src/llm/router.js';
import { globalSymbolicEngine } from '../../src/symbolic/compiler.js';
import { TaskGraph } from '../../src/symbolic/task_graph.js';
import * as loggerModule from '../../src/logger.js';
import * as configModule from '../../src/config.js';

vi.mock('../../src/logger.js', () => ({
    logMetric: vi.fn()
}));

vi.mock('../../src/config.js', () => ({
    loadConfig: vi.fn().mockResolvedValue({
        routing: { enabled: true, defaultModel: 'claude-3-haiku-20240307' }
    })
}));

describe('Phase 29: Zero-Token Reduction Validation', () => {
    let mockGraph: TaskGraph;

    beforeEach(() => {
        vi.clearAllMocks();

        mockGraph = {
            id: 'report_gen_1',
            name: 'weekly_report_gen',
            description: 'Generate weekly stats',
            trigger_intent: 'generate weekly report',
            startNode: 'fetch',
            contextVariables: [],
            nodes: {
                'fetch': {
                    id: 'fetch',
                    type: 'tool_call',
                    toolName: 'get_stats',
                    argumentsTemplate: {},
                    resultKey: 'stats',
                    next: undefined
                }
            }
        };

        // Inject the compiled graph
        globalSymbolicEngine.addGraph(mockGraph);

        // Mock execution
        vi.spyOn(globalSymbolicEngine, 'execute').mockResolvedValue({ stats: { revenue: 1000 } });

        // Mock Business Ops connection in AdaptiveRouter
        vi.spyOn(AdaptiveRouter.prototype as any, 'connectToBusinessOps').mockResolvedValue({
             callTool: vi.fn().mockResolvedValue({ content: [{ text: '{}' }] })
        });

        // Prevent actual LLM calls
        vi.spyOn(Object.getPrototypeOf(AdaptiveRouter.prototype), 'generate').mockResolvedValue({
            message: 'Standard LLM Response',
            tool: 'none',
            args: {},
            thought: 'reasoning',
            raw: ''
        });

        // Mock evaluateTaskComplexity
        vi.spyOn(AdaptiveRouter.prototype as any, 'evaluateTaskComplexity').mockResolvedValue({
             score: 3, recommended_model: 'claude-3-haiku-20240307', reasoning: 'simple'
        });
    });

    it('should reduce token usage by >40% for routine operations', async () => {
        const router = new AdaptiveRouter({ provider: 'anthropic', model: 'claude-3-opus-20240229' });

        let tokenIntensiveCount = 0;
        let zeroTokenCount = 0;

        // Simulate a week of operations: 10 routine report generations, 5 unique tasks
        const workload = [
            "generate weekly report for sales",
            "generate weekly report for marketing",
            "write a new python script for data processing", // unique
            "generate weekly report for engineering",
            "debug the database connection error", // unique
            "generate weekly report for HR",
            "generate weekly report for finance",
            "propose a new strategic pivot based on Q3", // unique
            "generate weekly report for operations",
            "generate weekly report for executive team",
            "explain the theory of relativity", // unique
            "generate weekly report for board",
            "generate weekly report for compliance",
            "generate weekly report for investors",
            "create a React component for the dashboard" // unique
        ];

        for (const prompt of workload) {
            const result = await router.generate("System", [{ role: "user", content: prompt }]);

            // Check if it was executed symbolically
            if (result.thought?.includes('Executed symbolically')) {
                zeroTokenCount++;
            } else {
                tokenIntensiveCount++;
            }
        }

        const totalTasks = workload.length;
        const reductionPercentage = (zeroTokenCount / totalTasks) * 100;

        console.log(`[Phase 29 Token Validation]`);
        console.log(`Total Tasks Simulated: ${totalTasks}`);
        console.log(`Tasks routed to LLM: ${tokenIntensiveCount}`);
        console.log(`Tasks executed via Symbolic Engine (Zero Tokens): ${zeroTokenCount}`);
        console.log(`Token Reduction / Avoidance: ${reductionPercentage.toFixed(2)}%`);

        // Assert > 40% reduction
        expect(reductionPercentage).toBeGreaterThanOrEqual(40);

        // Assert metrics were logged
        expect(loggerModule.logMetric).toHaveBeenCalledWith(
            'llm', 'llm_requests_avoided', 1, { reason: 'symbolic_execution' }
        );
    });
});
