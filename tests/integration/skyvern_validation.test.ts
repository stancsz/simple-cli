import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SkyvernDriver } from '../../src/mcp_servers/desktop_orchestrator/drivers/SkyvernDriver.js';
import { DesktopRouter } from '../../src/mcp_servers/desktop_orchestrator/router.js';

// Mock Playwright
const { mockPage, mockContext, mockBrowser } = vi.hoisted(() => {
    const mockPage = {
        goto: vi.fn(),
        click: vi.fn(),
        fill: vi.fn(),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('mock-image')),
        evaluate: vi.fn().mockResolvedValue('mock-text'),
        url: vi.fn().mockReturnValue('http://example.com'),
        close: vi.fn(),
    };

    const mockContext = {
        newPage: vi.fn().mockResolvedValue(mockPage),
        close: vi.fn(),
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

// Mock logger
vi.mock('../../src/logger.js', () => ({
    logMetric: vi.fn(),
}));

describe('Skyvern Integration Validation', () => {
    let driver: SkyvernDriver;
    let router: DesktopRouter;
    const LIVE_TEST = process.env.SKYVERN_API_URL ? true : false;

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset fetch mock only if not live testing
        if (!LIVE_TEST) {
            global.fetch = vi.fn();
        }
        driver = new SkyvernDriver();
        router = new DesktopRouter();
    });

    afterEach(async () => {
        await driver.shutdown();
    });

    describe('Core Functionality', () => {
        it('Scenario 1: Form Submission (Complex Flow)', async () => {
            if (!LIVE_TEST) {
                const mockFetch = global.fetch as any;
                mockFetch
                    .mockResolvedValueOnce({
                        ok: true,
                        json: async () => ({ task_id: 'task-form-1' }),
                    })
                    .mockResolvedValueOnce({
                        ok: true,
                        json: async () => ({ status: 'completed', output: 'Form submitted successfully' }),
                    });
            }

            const result = await driver.execute_complex_flow('Fill out the contact form with name John Doe');
            expect(result).toContain('Form submitted successfully');

            if (!LIVE_TEST) {
                expect(global.fetch).toHaveBeenCalled();
                 const callArgs = (global.fetch as any).mock.calls[0];
                 const body = JSON.parse(callArgs[1].body);
                 expect(body.navigation_goal).toContain('Fill out the contact form');
            }
        });

        it('Scenario 2: Navigation & Screenshot', async () => {
            await driver.navigate('http://example.com/dashboard');
            const screenshot = await driver.screenshot();

            expect(mockPage.goto).toHaveBeenCalledWith('http://example.com/dashboard', expect.anything());
            expect(mockPage.screenshot).toHaveBeenCalled();
            expect(screenshot).toBeDefined();
            expect(typeof screenshot).toBe('string');
        });

        it('Scenario 3: Data Extraction (Structured)', async () => {
             if (!LIVE_TEST) {
                const mockFetch = global.fetch as any;
                mockFetch
                    .mockResolvedValueOnce({
                        ok: true,
                        json: async () => ({ task_id: 'task-extract-1' }),
                    })
                    .mockResolvedValueOnce({
                        ok: true,
                        json: async () => ({ status: 'completed', output: '{"name": "Item 1", "price": "$10"}' }),
                    });
            }

            // Using execute_complex_flow for structured extraction via Skyvern API
            const result = await driver.execute_complex_flow('Extract the table data as JSON');
            expect(result).toContain('Item 1');

            if (!LIVE_TEST) {
                 const callArgs = (global.fetch as any).mock.calls[0];
                 const body = JSON.parse(callArgs[1].body);
                 expect(body.navigation_goal).toContain('Extract the table data');
            }
        });
    });

    describe('Desktop Orchestrator Integration', () => {
        it('should route form-heavy tasks to Skyvern (override)', async () => {
            const driverInstance = await router.selectDriver('Fill form use skyvern');
            expect(driverInstance).toBeInstanceOf(SkyvernDriver);
            expect(driverInstance.name).toBe('skyvern');
        });
    });

    describe('Error Handling', () => {
        it('should handle API errors gracefully', async () => {
            if (!LIVE_TEST) {
                const mockFetch = global.fetch as any;
                mockFetch.mockResolvedValueOnce({
                    ok: false,
                    status: 500,
                    statusText: 'Internal Server Error',
                    text: async () => 'Server exploded',
                });
            }

            await expect(driver.execute_complex_flow('Do something risky'))
                .rejects.toThrow('Skyvern API error: 500 Internal Server Error - Server exploded');
        });

        it('should handle Playwright navigation errors', async () => {
             mockPage.goto.mockRejectedValueOnce(new Error('Network timeout'));
             await expect(driver.navigate('http://timeout.com'))
                .rejects.toThrow('Network timeout');
        });
    });
});
