import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicComputerUseDriver } from '../../src/mcp_servers/desktop_orchestrator/drivers/anthropic.js';

// Mock Anthropic
const { mockCreate } = vi.hoisted(() => {
  return { mockCreate: vi.fn() };
});

vi.mock('@anthropic-ai/sdk', () => {
  return {
    Anthropic: class {
      beta = {
        messages: {
          create: mockCreate
        }
      }
    }
  };
});

// Mock Stagehand
const mockPage = {
  goto: vi.fn(),
  screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-image")),
  evaluate: vi.fn().mockResolvedValue("fake text"),
  mouse: {
    click: vi.fn(),
    move: vi.fn(),
    down: vi.fn(),
    up: vi.fn(),
    dblclick: vi.fn(),
  },
  keyboard: {
    type: vi.fn(),
    press: vi.fn(),
  }
};

vi.mock('@browserbasehq/stagehand', () => ({
  Stagehand: class {
    constructor() {}
    async init() {}
    page = mockPage;
    async close() {}
  }
}));

describe('AnthropicComputerUseDriver Integration', () => {
  let driver: AnthropicComputerUseDriver;

  beforeEach(() => {
    vi.clearAllMocks();
    driver = new AnthropicComputerUseDriver();
  });

  it('should initialize stagehand', async () => {
    await driver.init();
    // We can't easily check internal state, but calling methods shouldn't throw
  });

  it('should navigate using page.goto', async () => {
    const result = await driver.navigate('http://example.com');
    expect(mockPage.goto).toHaveBeenCalledWith('http://example.com', expect.any(Object));
    expect(result).toContain('Navigated to');
  });

  it('should process click by calling Anthropic and executing click', async () => {
    mockCreate
      .mockResolvedValueOnce({
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "computer",
            input: {
              action: "left_click",
              coordinate: [100, 200]
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "Done" }]
      });

    await driver.click("login button");

    expect(mockCreate).toHaveBeenCalledTimes(2);
    // Check if message content has image
    const callArgs = mockCreate.mock.calls[0][0];
    const userMsg = callArgs.messages.find((m: any) => m.role === 'user');
    // userMsg.content is expected to be array because we inject image
    expect(userMsg.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'image' })
    ]));

    expect(mockPage.mouse.click).toHaveBeenCalledWith(100, 200, { button: 'left' });
  });

  it('should process type by calling Anthropic and executing type', async () => {
    mockCreate
      .mockResolvedValueOnce({
        content: [
          {
            type: "tool_use",
            id: "call_2",
            name: "computer",
            input: {
              action: "type",
              text: "hello world"
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "Done" }]
      });

    await driver.type("search box", "hello world");

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockPage.keyboard.type).toHaveBeenCalledWith("hello world");
  });

  it('should handle complex flow with multiple steps', async () => {
    // Step 1: LLM decides to click
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "call_1",
          name: "computer",
          input: { action: "left_click", coordinate: [50, 50] }
        }
      ]
    });

    // Step 2: Driver sends tool result, LLM decides to finish (no tools)
    // We need to mock the SECOND call.
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: "text", text: "Done." }
      ]
    });

    const result = await driver.execute_complex_flow("do something complex");

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockPage.mouse.click).toHaveBeenCalledWith(50, 50, { button: 'left' });
    expect(result).toContain("Done");
  });

  it('should handle errors gracefully', async () => {
      mockCreate.mockRejectedValue(new Error("API Error"));
      // We expect it to return error string, not throw
      const result = await driver.click("btn");
      expect(result).toContain("Error: API Error");
  });

});
