import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runQuickStart } from '../../src/commands/quickstart.js';

// Mocks
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  text: vi.fn(),
  confirm: vi.fn(),
  isCancel: vi.fn(),
  cancel: vi.fn(),
  note: vi.fn(),
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
  })),
}));

vi.mock('../../src/utils/company-setup.js', () => ({
  setupCompany: vi.fn(),
}));

vi.mock('../../src/commands/dashboard.js', () => ({
  dashboardCommand: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: vi.fn(() => false),
        rmSync: vi.fn(),
    }
});

import * as clack from '@clack/prompts';
import { setupCompany } from '../../src/utils/company-setup.js';
import { dashboardCommand } from '../../src/commands/dashboard.js';

describe('Quick Start Wizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default isCancel to false
    vi.mocked(clack.isCancel).mockReturnValue(false);
  });

  it('runs through the full wizard flow successfully', async () => {
    // Setup prompts responses
    vi.mocked(clack.text).mockResolvedValue('test-company'); // Company Name
    vi.mocked(clack.confirm)
      .mockResolvedValueOnce(true) // Integrate Roo
      .mockResolvedValueOnce(true) // Execute SOP
      .mockResolvedValueOnce(true) // Ghost Mode
      .mockResolvedValueOnce(true); // Dashboard

    await runQuickStart();

    // Verify Company Setup
    expect(clack.text).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Company Context') }));
    expect(setupCompany).toHaveBeenCalledWith('test-company', expect.anything());

    // Verify Framework Integration
    expect(clack.confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Integrate \'Roo Code\'') }));
    expect(clack.note).toHaveBeenCalledWith(expect.stringContaining('Use \'roo_code\' tools'), 'Integration Complete');

    // Verify SOP Execution
    expect(clack.confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Execute \'Build a simple web app\' SOP') }));
    expect(clack.note).toHaveBeenCalledWith(expect.stringContaining('Project files generated'), 'SOP Result');

    // Verify Ghost Mode
    expect(clack.confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Activate Ghost Mode') }));

    // Verify Dashboard
    expect(clack.confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Launch Operational Dashboard') }));
    expect(dashboardCommand).toHaveBeenCalled();

    expect(clack.outro).toHaveBeenCalled();
  });

  it('skips steps when user selects No', async () => {
    vi.mocked(clack.text).mockResolvedValue('test-company-skip');
    vi.mocked(clack.confirm)
      .mockResolvedValueOnce(false) // Skip Roo
      .mockResolvedValueOnce(false) // Skip SOP
      .mockResolvedValueOnce(false) // Skip Ghost
      .mockResolvedValueOnce(false); // Skip Dashboard

    await runQuickStart();

    expect(setupCompany).toHaveBeenCalledWith('test-company-skip', expect.anything());

    // Should NOT show notes or call dashboard
    expect(clack.note).not.toHaveBeenCalled();
    expect(dashboardCommand).not.toHaveBeenCalled();
    expect(clack.outro).toHaveBeenCalled();
  });

  it('handles user cancellation at company name step', async () => {
    vi.mocked(clack.text).mockResolvedValue('cancel_symbol' as any);
    vi.mocked(clack.isCancel).mockReturnValue(true);

    await runQuickStart();

    expect(clack.cancel).toHaveBeenCalledWith('Operation cancelled.');
    expect(setupCompany).not.toHaveBeenCalled();
  });

  it('handles company setup failure', async () => {
    vi.mocked(clack.text).mockResolvedValue('fail-company');
    vi.mocked(setupCompany).mockRejectedValue(new Error('Setup Error'));

    await runQuickStart();

    expect(clack.cancel).toHaveBeenCalledWith('Setup failed.');
    expect(clack.outro).not.toHaveBeenCalled();
  });
});
