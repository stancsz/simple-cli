import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import http from 'http';
import { StagehandDriver } from '../../src/mcp_servers/desktop_orchestrator/drivers/StagehandDriver';
import { AnthropicComputerUseDriver } from '../../src/mcp_servers/desktop_orchestrator/drivers/AnthropicComputerUseDriver';

// Mock Anthropic SDK
const mockMessagesCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      beta = {
        messages: {
          create: mockMessagesCreate
        }
      }
    }
  }
});

// Setup local server
const app = express();
const server = http.createServer(app);
const PORT = 3456; // Use a different port to avoid conflicts
const BASE_URL = `http://localhost:${PORT}`;

app.get('/', (req, res) => {
  res.send(`
    <html>
      <body>
        <h1>Test Page</h1>
        <button id="btn-click" style="width: 100px; height: 50px;">Click Me</button>
        <input id="input-text" type="text" />
        <div id="result">Waiting...</div>
        <script>
          document.getElementById('btn-click').addEventListener('click', () => {
            document.getElementById('result').innerText = 'Clicked!';
          });
          document.getElementById('input-text').addEventListener('input', (e) => {
            document.getElementById('result').innerText = 'Typed: ' + e.target.value;
          });
        </script>
      </body>
    </html>
  `);
});

describe('Desktop Orchestrator Complete Integration', () => {
  beforeAll(async () => {
    return new Promise<void>((resolve) => {
      server.listen(PORT, resolve);
    });
  });

  afterAll(async () => {
    return new Promise<void>((resolve) => {
        server.close(() => resolve());
    });
  });

  describe('Stagehand Driver', () => {
    it('should navigate and click using CSS selector (Playwright)', async () => {
      const driver = new StagehandDriver();
      await driver.init();
      await driver.navigate(BASE_URL);

      const textBefore = await driver.extract_text();
      expect(textBefore).toContain('Waiting...');

      await driver.click('#btn-click');

      const textAfter = await driver.extract_text();
      expect(textAfter).toContain('Clicked!');

      await driver.shutdown();
    });

    it('should type using CSS selector', async () => {
      const driver = new StagehandDriver();
      await driver.init();
      await driver.navigate(BASE_URL);

      await driver.type('#input-text', 'Hello World');

      const textAfter = await driver.extract_text();
      expect(textAfter).toContain('Typed: Hello World');

      await driver.shutdown();
    });
  });

  describe('Anthropic Driver', () => {
    it('should navigate and click using mocked Anthropic tool use', async () => {
        const driver = new AnthropicComputerUseDriver();
        // Inject API key to avoid warning
        process.env.ANTHROPIC_API_KEY = "dummy";

        await driver.init();
        await driver.navigate(BASE_URL);

        // Cheat: Get button coordinates from the real page
        // We access the private page property by casting to any
        const btnBox = await (driver as any).page.locator('#btn-click').boundingBox();
        const x = btnBox.x + btnBox.width / 2;
        const y = btnBox.y + btnBox.height / 2;

        // Mock Anthropic response sequence
        mockMessagesCreate
            .mockResolvedValueOnce({
                content: [
                    {
                        type: 'tool_use',
                        id: 'tool_1',
                        name: 'computer',
                        input: { action: 'mouse_move', coordinate: [x, y] }
                    }
                ]
            })
            .mockResolvedValueOnce({
                content: [
                    {
                        type: 'tool_use',
                        id: 'tool_2',
                        name: 'computer',
                        input: { action: 'left_click' }
                    }
                ]
            })
            .mockResolvedValueOnce({
                content: [
                    { type: 'text', text: 'Clicked the button.' }
                ]
            });

        await driver.click("The Click Me button");

        // Verify page state changed
        const textAfter = await driver.extract_text();
        expect(textAfter).toContain('Clicked!');

        await driver.shutdown();
    });
  });
});
