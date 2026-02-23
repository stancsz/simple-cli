import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
    const mockPage = {
        goto: vi.fn(),
        click: vi.fn(),
        fill: vi.fn(),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-screenshot')),
        evaluate: vi.fn().mockResolvedValue('fake text'),
        close: vi.fn(),
        getByText: vi.fn().mockReturnValue({ first: () => ({ click: vi.fn() }) }),
        mouse: {
            click: vi.fn(),
            move: vi.fn(),
        },
        keyboard: {
            type: vi.fn(),
            press: vi.fn(),
        }
    };
    const mockContext = {
        newPage: vi.fn().mockResolvedValue(mockPage),
    };
    const mockBrowser = {
        newContext: vi.fn().mockResolvedValue(mockContext),
        close: vi.fn(),
    };
    const mockAnthropicCreate = vi.fn();
    const mockOpenAICreate = vi.fn();

    return {
        mockPage,
        mockContext,
        mockBrowser,
        mockAnthropicCreate,
        mockOpenAICreate
    };
});

vi.mock('playwright', () => ({
    chromium: {
        launch: vi.fn().mockResolvedValue(mocks.mockBrowser)
    }
}));

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      beta = {
        messages: {
          create: mocks.mockAnthropicCreate
        }
      }
    }
  }
});

vi.mock('openai', () => {
  return {
    default: class {
      chat = {
        completions: {
          create: mocks.mockOpenAICreate
        }
      }
    }
  }
});

vi.mock('../../src/logger.js', () => ({
    logMetric: vi.fn()
}));

vi.mock('../../src/llm.js', () => ({
    createLLM: () => ({
        generate: vi.fn().mockResolvedValue({ message: 'stagehand' })
    })
}));

import { AnthropicComputerUseDriver } from '../../src/mcp_servers/desktop_orchestrator/drivers/AnthropicComputerUseDriver.js';
import { OpenAIOperatorDriver } from '../../src/mcp_servers/desktop_orchestrator/drivers/OpenAIOperatorDriver.js';
import { DesktopRouter } from '../../src/mcp_servers/desktop_orchestrator/router.js';

describe('Desktop Driver Completion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset mock implementations to ensure clean state
        mocks.mockAnthropicCreate.mockReset();
        mocks.mockOpenAICreate.mockReset();

        process.env.ANTHROPIC_API_KEY = 'test-key';
        process.env.OPENAI_API_KEY = 'test-key';
        process.env.DESKTOP_PREFERRED_BACKEND = 'stagehand';
    });

    describe('AnthropicComputerUseDriver', () => {
        it('should use direct playwright for navigation', async () => {
            const driver = new AnthropicComputerUseDriver();
            await driver.init();
            await driver.navigate('https://example.com');
            expect(mocks.mockPage.goto).toHaveBeenCalledWith('https://example.com', expect.any(Object));
        });

        it('should handle tool calls in loop', async () => {
            const driver = new AnthropicComputerUseDriver();
            await driver.init();

            // 1. Tool call
            mocks.mockAnthropicCreate.mockResolvedValueOnce({
                content: [{
                    type: 'tool_use',
                    id: 'call_1',
                    name: 'computer',
                    input: { action: 'screenshot' }
                }]
            });
            // 2. Final response
            mocks.mockAnthropicCreate.mockResolvedValueOnce({
                content: [{ type: 'text', text: 'Done' }]
            });

            const result = await driver.click('button');
            expect(result).toContain('Clicked button');

            expect(mocks.mockAnthropicCreate).toHaveBeenCalledTimes(2);
        });

        it('should execute computer tool actions on browser', async () => {
            const driver = new AnthropicComputerUseDriver();
            await driver.init();

            // 1. Tool call: left_click
            mocks.mockAnthropicCreate.mockResolvedValueOnce({
                content: [{
                    type: 'tool_use',
                    id: 'call_1',
                    name: 'computer',
                    input: { action: 'left_click', coordinate: [100, 200] }
                }]
            });
            // 2. Final response
            mocks.mockAnthropicCreate.mockResolvedValueOnce({
                content: [{ type: 'text', text: 'Done' }]
            });

            await driver.click('button');

            expect(mocks.mockPage.mouse.click).toHaveBeenCalledWith(100, 200);
        });
    });

    describe('OpenAIOperatorDriver', () => {
        it('should execute complex flow with tool calls', async () => {
            const driver = new OpenAIOperatorDriver();
            mocks.mockOpenAICreate.mockResolvedValueOnce({
                choices: [{
                    message: {
                        tool_calls: [{
                            id: 'call_1',
                            type: 'function', // Added this field
                            function: {
                                name: 'navigate',
                                arguments: JSON.stringify({ url: 'https://example.com' })
                            }
                        }]
                    }
                }]
            });
            mocks.mockOpenAICreate.mockResolvedValueOnce({
                choices: [{
                    message: {
                        content: 'Task complete'
                    }
                }]
            });

            const result = await driver.execute_complex_flow('Research AI');
            expect(result).toContain('Task complete');
            expect(mocks.mockPage.goto).toHaveBeenCalledWith('https://example.com', expect.any(Object));
        });
    });

    // Router tests... (no changes needed)
    describe('DesktopRouter', () => {
        it('should route OS tasks to Anthropic via heuristics', async () => {
            const router = new DesktopRouter();
            const driver = await router.selectDriver('Use computer to open Calculator');
            expect(driver.name).toBe('anthropic');
        });

        it('should route Research tasks to OpenAI via heuristics', async () => {
            const router = new DesktopRouter();
            const driver = await router.selectDriver('Research the latest AI news');
            expect(driver.name).toBe('openai');
        });

        it('should route Skyvern tasks via heuristics', async () => {
            const router = new DesktopRouter();
            const driver = await router.selectDriver('Fill out this unknown structure form');
            expect(driver.name).toBe('skyvern');
        });

        it('should route explicit overrides', async () => {
            const router = new DesktopRouter();
            const driver = await router.selectDriver('Use Stagehand to click button');
            expect(driver.name).toBe('stagehand');
        });
    });
});
