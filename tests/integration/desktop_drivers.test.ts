import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicComputerUseDriver } from '../../src/mcp_servers/desktop_orchestrator/drivers/AnthropicComputerUseDriver.js';
import { OpenAIOperatorDriver } from '../../src/mcp_servers/desktop_orchestrator/drivers/OpenAIOperatorDriver.js';
import { SkyvernDriver } from '../../src/mcp_servers/desktop_orchestrator/drivers/SkyvernDriver.js';

// Hoisted mocks for module-level mocking
const { mockAnthropicCreate, mockGenerateText, mockFetch } = vi.hoisted(() => {
    return {
        mockAnthropicCreate: vi.fn(),
        mockGenerateText: vi.fn(),
        mockFetch: vi.fn()
    };
});

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      beta = {
        messages: {
          create: mockAnthropicCreate
        }
      };
      constructor() {}
    }
  };
});

// Mock AI SDK
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    generateText: mockGenerateText
  };
});

// Mock Fetch
global.fetch = mockFetch;

describe('Desktop Drivers Integration', () => {
  let skyvern: SkyvernDriver;
  let anthropic: AnthropicComputerUseDriver;
  let openai: OpenAIOperatorDriver;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "dummy-key";
    process.env.OPENAI_API_KEY = "dummy-key";
    skyvern = new SkyvernDriver();
    anthropic = new AnthropicComputerUseDriver();
    openai = new OpenAIOperatorDriver();

    // Default mocks
    mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Anthropic Done' }]
    });

    mockGenerateText.mockResolvedValue({
        text: "OpenAI Done",
        toolResults: [],
        response: { messages: [{ content: "OpenAI Done" }] }
    });
  });

  afterEach(async () => {
    await skyvern.shutdown();
    await anthropic.shutdown();
    await openai.shutdown();
  });

  describe('SkyvernDriver', () => {
    it('should launch a real browser and navigate', async () => {
        // This is the E2E test with real headless browser
        await skyvern.navigate('data:text/html,<h1>Hello World</h1>');
        const text = await skyvern.extract_text();
        expect(text).toContain('Hello World');
    });

    it('should use fetch for NL click', async () => {
        // Navigate first to init browser
        await skyvern.navigate('data:text/html,<button>Click Me</button>');

        // Mock fetch for create task
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ task_id: 'task-1' })
        });

        // Mock fetch for task status
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ status: 'completed', output: 'Clicked' })
        });

        // Use a natural language selector to trigger Skyvern API
        const result = await skyvern.click('Click the button');
        // The result is the output from Skyvern API
        // SkyvernDriver returns `Skyvern task completed. Result: "Clicked"` (or similar json stringified)
        expect(result).toContain('Skyvern task completed');
        expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('AnthropicComputerUseDriver', () => {
      it('should launch a real browser and navigate', async () => {
          await anthropic.navigate('data:text/html,<h1>Anthropic Test</h1>');
          const text = await anthropic.extract_text();
          expect(text).toContain('Anthropic Test');
      });

      it('should call Anthropic API for complex flow', async () => {
          await anthropic.navigate('data:text/html,<div>Target</div>');

          mockAnthropicCreate.mockResolvedValueOnce({
              content: [{ type: 'text', text: 'Task completed' }]
          });

          const result = await anthropic.execute_complex_flow('Do something');
          expect(result).toContain('Task completed');
          expect(mockAnthropicCreate).toHaveBeenCalled();
      });
  });

  describe('OpenAIOperatorDriver', () => {
      it('should launch a real browser and navigate', async () => {
          await openai.navigate('data:text/html,<h1>OpenAI Test</h1>');
          const text = await openai.extract_text();
          expect(text).toContain('OpenAI Test');
      });

      it('should call generateText for complex flow', async () => {
          await openai.navigate('data:text/html,<div>Target</div>');

          // Ensure generateText is called
          const result = await openai.execute_complex_flow('Do something');
          expect(result).toBe('OpenAI Done');
          expect(mockGenerateText).toHaveBeenCalled();
      });
  });
});
