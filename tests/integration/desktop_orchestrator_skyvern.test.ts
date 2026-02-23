import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SkyvernDriver } from '../../src/mcp_servers/desktop_orchestrator/drivers/SkyvernDriver.js';

// Mock Playwright
const { mockPage, mockContext, mockBrowser } = vi.hoisted(() => {
    const mockPage = {
        goto: vi.fn(),
        click: vi.fn(),
        fill: vi.fn(),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('mock-image')),
        evaluate: vi.fn().mockResolvedValue('mock-text'),
        url: vi.fn().mockReturnValue('http://example.com'),
    };

    const mockContext = {
        newPage: vi.fn().mockResolvedValue(mockPage),
    };

    const mockBrowser = {
        newContext: vi.fn().mockResolvedValue(mockContext),
        close: vi.fn(),
    };
    return { mockPage, mockContext, mockBrowser };
});

vi.mock('playwright', () => ({
    chromium: {
        launch: vi.fn().mockResolvedValue(mockBrowser),
    },
}));

// Mock logger to avoid clutter
vi.mock('../../src/logger.js', () => ({
    logMetric: vi.fn(),
}));

describe('SkyvernDriver', () => {
    let driver: SkyvernDriver;

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset fetch mock
        global.fetch = vi.fn();
        driver = new SkyvernDriver();
    });

    afterEach(async () => {
        await driver.shutdown();
    });

    it('should initialize browser on first action', async () => {
        await driver.navigate('http://example.com');
        expect(mockBrowser.newContext).toHaveBeenCalled();
        expect(mockPage.goto).toHaveBeenCalledWith('http://example.com', expect.anything());
    });

    it('should use Playwright for CSS selectors', async () => {
        await driver.click('#submit-btn');
        expect(mockPage.click).toHaveBeenCalledWith('#submit-btn');
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should use Skyvern API for natural language selectors', async () => {
        // Mock successful task creation and completion
        const mockFetch = global.fetch as any;
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ task_id: 'task-123' }),
            }) // Create task response
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ status: 'completed', output: 'Clicked it' }),
            }); // Status response

        await driver.click('Click the big red button');

        expect(global.fetch).toHaveBeenCalledTimes(2);
        // Verify payload includes prompt and cdp_url
        const callArgs = mockFetch.mock.calls[0];
        expect(callArgs[0]).toContain('/api/v1/tasks');
        const body = JSON.parse(callArgs[1].body);
        expect(body.navigation_goal).toContain('Click the big red button');
        expect(body.cdp_url).toContain('127.0.0.1');
    });

    it('should execute complex flow using Skyvern API', async () => {
         const mockFetch = global.fetch as any;
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ task_id: 'task-456' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ status: 'completed', output: 'Flow done' }),
            });

        const result = await driver.execute_complex_flow('Login and download invoice');
        expect(result).toContain('Flow done');
        expect(global.fetch).toHaveBeenCalled();
    });
});
