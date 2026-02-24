import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as prompts from '@clack/prompts';
import { setupCompany } from '../../src/utils/company-setup.js';
import { dashboardCommand } from '../../src/commands/dashboard.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';

// Mock dependencies
vi.mock('@clack/prompts');
vi.mock('../../src/utils/company-setup.js', () => ({
  setupCompany: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/commands/dashboard.js', () => ({
  dashboardCommand: vi.fn().mockResolvedValue(undefined),
}));

// Mock fs module completely
vi.mock('fs', () => ({
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
}));

describe('Onboard Command Integration', () => {
    let consoleLogSpy: any;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        // Setup default mocks for prompts
        (prompts.intro as any).mockReturnValue(undefined);
        (prompts.outro as any).mockReturnValue(undefined);
        (prompts.spinner as any).mockReturnValue({
            start: vi.fn(),
            stop: vi.fn(),
            message: vi.fn(),
        });
        (prompts.isCancel as any).mockReturnValue(false);
        (prompts.note as any).mockReturnValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should complete the full onboarding flow successfully', async () => {
        // Import runOnboard inside the test to ensure mocks are applied
        const { runOnboard } = await import('../../src/commands/onboard.js');

        // Mock user inputs
        (prompts.text as any).mockResolvedValueOnce('TestCorp');
        (prompts.select as any).mockResolvedValueOnce('Professional');
        (prompts.text as any).mockResolvedValueOnce('Build things');

        // Confirmations
        (prompts.confirm as any)
            .mockResolvedValueOnce(true) // Integrate Roo Code
            .mockResolvedValueOnce(true) // Execute SOP
            .mockResolvedValueOnce(true) // Activate Ghost Mode
            .mockResolvedValueOnce(true); // Launch Dashboard

        // Mock fs behaviors
        (existsSync as any).mockReturnValue(false);
        (readFileSync as any).mockReturnValue(JSON.stringify({ tasks: [] }));

        await runOnboard();

        // Verification

        // 1. Company Setup
        expect(setupCompany).toHaveBeenCalledWith('TestCorp', {
            brand_voice: 'Professional',
            project_goals: ['Build things'],
            tech_stack: expect.arrayContaining(['Simple Biosphere'])
        });

        // 2. Roo Code Integration (Log file)
        expect(mkdirSync).toHaveBeenCalled(); // .agent/logs
        expect(writeFileSync).toHaveBeenCalledWith(
            expect.stringContaining('roo_integration.log'),
            expect.stringContaining('Integrated Roo Code successfully')
        );

        // 3. SOP Execution (SOP file)
        expect(writeFileSync).toHaveBeenCalledWith(
            expect.stringContaining('initialize_project.sop'),
            expect.stringContaining('# Initialize Project SOP')
        );

        // 4. Ghost Mode (Scheduler)
        expect(writeFileSync).toHaveBeenCalledWith(
            expect.stringContaining('scheduler.json'),
            expect.stringContaining('morning-standup')
        );

        // 5. Dashboard
        expect(dashboardCommand).toHaveBeenCalled();
    });

    it('should handle cancellation gracefully', async () => {
        const { runOnboard } = await import('../../src/commands/onboard.js');

         (prompts.text as any).mockResolvedValue(Symbol('clack:cancel'));
         (prompts.isCancel as any).mockReturnValue(true);
         const cancelSpy = vi.spyOn(prompts, 'cancel');

         await runOnboard();

         expect(cancelSpy).toHaveBeenCalledWith("Operation cancelled.");
    });
});
