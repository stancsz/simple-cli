import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Supervisor } from '../../src/supervisor.js';
import { MCP } from '../../src/mcp.js';
import { LLM, createLLM } from '../../src/llm.js';
import { DesktopRouter } from '../../src/mcp_servers/desktop_orchestrator/router.js';
import { QualityGate } from '../../src/mcp_servers/desktop_orchestrator/quality_gate.js';

// Mock dependencies
vi.mock('../../src/llm.js');
vi.mock('../../src/mcp.js');
vi.mock('fs/promises', () => ({
    writeFile: vi.fn(async () => {}),
    mkdir: vi.fn(async () => {}),
    readFile: vi.fn(async () => Buffer.from('fake-image')),
    appendFile: vi.fn(async () => {}),
    unlink: vi.fn(async () => {}),
}));
vi.mock('fs', () => ({
    existsSync: vi.fn().mockReturnValue(true),
}));
vi.mock('crypto', () => ({
    randomUUID: vi.fn(() => 'test-uuid'),
}));

// Mock Drivers
vi.mock('../../src/mcp_servers/desktop_orchestrator/drivers/StagehandDriver.js', () => {
    return {
        StagehandDriver: class {
            name = 'stagehand';
            async init() {}
            async navigate() { return 'navigated'; }
            async click() { return 'clicked'; }
            async type() { return 'typed'; }
            async screenshot() { return 'stagehand_screenshot'; }
        }
    }
});

vi.mock('../../src/mcp_servers/desktop_orchestrator/drivers/SkyvernDriver.js', () => {
    return {
        SkyvernDriver: class {
            name = 'skyvern';
            async init() {}
            async navigate() { return 'navigated'; }
            async click() { return 'clicked'; }
            async type() { return 'typed'; }
            async screenshot() { return 'skyvern_screenshot'; }
        }
    }
});

vi.mock('../../src/mcp_servers/desktop_orchestrator/drivers/AnthropicComputerUseDriver.js', () => {
    return {
        AnthropicComputerUseDriver: class {
            name = 'anthropic';
            async init() {}
        }
    }
});

vi.mock('../../src/mcp_servers/desktop_orchestrator/drivers/OpenAIOperatorDriver.js', () => {
    return {
        OpenAIOperatorDriver: class {
            name = 'openai';
            async init() {}
        }
    }
});


describe('Visual Quality Gate Integration', () => {
    let supervisor: Supervisor;
    let mockLLM: any;
    let mockMCP: any;
    let mockGateClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        // Setup LLM mock
        mockLLM = {
            generate: vi.fn().mockResolvedValue({
                thought: 'Standard verification passed.',
                message: 'LGTM',
            }),
        };

        // Setup MCP Client mock for visual_quality_gate
        mockGateClient = {
            callTool: vi.fn(),
        };

        // Setup MCP mock
        mockMCP = {
            getClient: vi.fn().mockImplementation((name) => {
                if (name === 'visual_quality_gate') return mockGateClient;
                return null;
            }),
        };

        supervisor = new Supervisor(mockLLM as unknown as LLM, mockMCP as unknown as MCP);
    });

    describe('Supervisor Logic', () => {
        it('should NOT trigger quality gate for non-visual tasks', async () => {
            const result = { content: [{ type: 'text', text: 'some code' }] };
            const verifyResult = await supervisor.verify(result, 'write_file', {}, 'create a file', []);

            expect(mockGateClient.callTool).not.toHaveBeenCalled();
            expect(verifyResult.verified).toBe(true);
        });

        it('should trigger quality gate for take_screenshot tool', async () => {
            const result = {
                content: [{
                    type: 'image',
                    data: 'base64data',
                    mimeType: 'image/png'
                }]
            };

            // Mock passing score
            mockGateClient.callTool.mockResolvedValue({
                content: [{ type: 'text', text: JSON.stringify({ score: 85, critique: [], reasoning: 'Good job' }) }]
            });

            const verifyResult = await supervisor.verify(
                result,
                'take_screenshot',
                {},
                'design a landing page',
                []
            );

            expect(mockGateClient.callTool).toHaveBeenCalledWith({
                name: 'assess_design_quality',
                arguments: expect.objectContaining({
                    screenshot_path: expect.stringMatching(/.*\.png$/),
                    context: 'design a landing page'
                })
            });
            expect(verifyResult.verified).toBe(true);
        });

        it('should fail verification and suggest retry if score is < 70', async () => {
            const result = {
                content: [{
                    type: 'image',
                    data: 'base64data',
                    mimeType: 'image/png'
                }]
            };

            // Mock failing score
            mockGateClient.callTool.mockResolvedValue({
                content: [{ type: 'text', text: JSON.stringify({
                    score: 50,
                    critique: ['Bad colors', 'Small font'],
                    reasoning: 'Ugly'
                }) }]
            });

            const verifyResult = await supervisor.verify(
                result,
                'take_screenshot',
                {},
                'design check',
                []
            );

            expect(verifyResult.verified).toBe(false);
            expect(verifyResult.feedback).toContain('Visual Quality Gate Failed');
            expect(verifyResult.feedback).toContain('Bad colors');
            expect(verifyResult.feedback).toContain('Recommendation: You should retry this task, potentially using a different desktop driver');
        });
    });

    describe('Desktop Router Integration', () => {
        let router: DesktopRouter;

        beforeEach(() => {
            // Mock LLM for router
            const mockLLMInstance = {
                generate: vi.fn().mockResolvedValue({ message: 'stagehand' }) // Default choice
            };
            (LLM as any).mockImplementation(() => mockLLMInstance);
            (createLLM as any).mockImplementation(() => mockLLMInstance);

            router = new DesktopRouter();
        });

        it('should route to preferred backend by default', async () => {
            const driver = await router.selectDriver('navigate to google.com');
            expect(driver.name).toBe('stagehand');
        });

        it('should respect "use skyvern" override', async () => {
            const driver = await router.selectDriver('navigate to google.com (use skyvern)');
            expect(driver.name).toBe('skyvern');
        });

        it('should avoid excluded drivers', async () => {
            // Set preferred to stagehand (default)
            // But exclude stagehand
            // Mock LLM to return skyvern if stagehand is excluded
            const mockLLMInstance = {
                generate: vi.fn().mockImplementation(async (prompt) => {
                    if (prompt.includes('Do NOT use: stagehand')) {
                         return { message: 'skyvern' };
                    }
                    return { message: 'stagehand' };
                })
            };
            (createLLM as any).mockImplementation(() => mockLLMInstance);
            router = new DesktopRouter(); // Re-init to pick up new mock

            const driver = await router.selectDriver('improve design (avoid stagehand)');
            // Should verify that LLM was called with exclusion prompt
            expect(driver.name).not.toBe('stagehand');
            expect(driver.name).toBe('skyvern');
        });

        it('should handle "exclude" keyword', async () => {
            const mockLLMInstance = {
                generate: vi.fn().mockImplementation(async (prompt) => {
                    if (prompt.includes('Do NOT use: stagehand')) {
                         return { message: 'anthropic' };
                    }
                    return { message: 'stagehand' };
                })
            };
            (createLLM as any).mockImplementation(() => mockLLMInstance);
            router = new DesktopRouter(); // Re-init

            const driver = await router.selectDriver('task description (exclude stagehand)');
            expect(driver.name).toBe('anthropic');
        });
    });

    describe('QualityGate Class (Internal)', () => {
        it('should assess design quality using LLM', async () => {
            const mockLLMInstance = {
                generate: vi.fn().mockResolvedValue({
                    thought: JSON.stringify({
                        score: 75,
                        critique: ['Okay'],
                        reasoning: 'Not bad'
                    })
                })
            };
            (LLM as any).mockImplementation(() => mockLLMInstance);

            const gate = new QualityGate();
            const result = await gate.assess('base64image', 'context');

            expect(result.score).toBe(75);
            expect(result.reasoning).toBe('Not bad');
        });

        it('should apply technical penalty', async () => {
            const mockLLMInstance = {
                generate: vi.fn().mockResolvedValue({
                    thought: JSON.stringify({
                        score: 90, // Visual score high
                        critique: [],
                        reasoning: 'Great visual'
                    })
                })
            };
            (LLM as any).mockImplementation(() => mockLLMInstance);

            const gate = new QualityGate();
            const htmlContent = '<html><body><div>No meta viewport</div></body></html>';
            const result = await gate.assess('base64', 'context', htmlContent);

            // Technical Analysis:
            // Missing viewport: -15
            // Missing CSS vars: -10
            // Tech Score = 100 - 25 = 75
            // Final Score = (90 * 0.7) + (75 * 0.3) = 63 + 22.5 = 85.5 -> 86

            expect(result.score).toBeLessThan(90);
            expect(result.reasoning).toContain('Technical penalties');
        });
    });
});
