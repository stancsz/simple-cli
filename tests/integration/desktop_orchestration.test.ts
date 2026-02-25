import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DesktopRouter } from '../../src/mcp_servers/desktop_orchestrator/router.js';
import { StagehandDriver } from '../../src/mcp_servers/desktop_orchestrator/drivers/StagehandDriver.js';
import { AnthropicComputerUseDriver } from '../../src/mcp_servers/desktop_orchestrator/drivers/AnthropicComputerUseDriver.js';
import { tools } from '../../src/mcp_servers/desktop_orchestrator/desktop_tools.js';

// Mock LLM
const { mockGenerate } = vi.hoisted(() => {
  return { mockGenerate: vi.fn() };
});

vi.mock('../../src/llm.js', () => ({
  createLLM: () => ({
    generate: mockGenerate,
  }),
  LLM: class {
    generate = mockGenerate;
  }
}));

// Mock Stagehand
const mockPage = {
  goto: vi.fn(),
  click: vi.fn(),
  fill: vi.fn(),
  screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-image")),
  evaluate: vi.fn().mockResolvedValue("fake text"),
  locator: vi.fn().mockReturnValue({
      click: vi.fn(),
      fill: vi.fn()
  })
};

vi.mock('@browserbasehq/stagehand', () => ({
  Stagehand: class {
    async init() {}
    context = {
        activePage: () => mockPage
    };
    async act() {}
    async close() {}
  }
}));

describe('Desktop Orchestrator Integration', () => {
  let router: DesktopRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    router = new DesktopRouter();
  });

  describe('Router Logic', () => {
    it('should select preferred backend (stagehand) by default for short tasks', async () => {
      const driver = await router.selectDriver('click button');
      expect(driver.name).toBe('stagehand');
    });

    it('should respect explicit overrides', async () => {
      const driver = await router.selectDriver('use anthropic to click button');
      expect(driver.name).toBe('anthropic');
    });

    it('should use LLM for complex tasks', async () => {
      // Mock LLM response to select skyvern
      mockGenerate.mockResolvedValueOnce({
        message: 'skyvern',
      });

      const driver = await router.selectDriver('Navigate to the complex dynamic form and fill it out intelligently based on these strict requirements');
      expect(driver.name).toBe('skyvern');
      expect(mockGenerate).toHaveBeenCalled();
    });

    it('should fallback to preferred if LLM fails', async () => {
      mockGenerate.mockRejectedValueOnce(new Error('LLM Error'));
      const driver = await router.selectDriver('Navigate to the complex dynamic form and fill it out intelligently');
      expect(driver.name).toBe('stagehand');
    });
  });

  describe('Drivers', () => {
    it('StagehandDriver should call Stagehand methods', async () => {
      const driver = new StagehandDriver();
      await driver.init();
      const result = await driver.navigate('http://example.com');
      expect(result).toContain('Navigated to');
    });

    it('AnthropicDriver should be a stub', async () => {
      const driver = new AnthropicComputerUseDriver();
      const result = await driver.navigate('http://example.com');
      expect(result).toContain('[Anthropic]');
    });
  });

  describe('Safety Layer', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env = { ...originalEnv };
        delete process.env.DESKTOP_APPROVE_RISKY;
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should block high-risk action if approval env var is missing', async () => {
        const tool = tools.find(t => t.name === 'navigate_to')!;
        // handler expects { url, human_approval_required }
        const result = await (tool.handler as any)({
            url: 'http://dangerous.com',
            human_approval_required: true
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('requires human approval');
    });

    it('should allow high-risk action if approval env var is set', async () => {
        process.env.DESKTOP_APPROVE_RISKY = 'true';
        const tool = tools.find(t => t.name === 'navigate_to')!;

        const result = await (tool.handler as any)({
            url: 'http://safe.com',
            human_approval_required: true
        });

        // It might return success or error from driver, but NOT safety error
        const text = result.content[0].text;
        expect(text).not.toContain('requires human approval');
        expect(text).toContain('Navigated to');
    });
  });
});
