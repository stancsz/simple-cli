import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Briefcase } from '../../src/context/briefcase.js';

// Mock dependencies
const mockRegistry = {
  loadCompanyTools: vi.fn(),
};

const mockLLM = {};

const mockSOPRegistry = {
  setCompany: vi.fn(),
};

const mockMCP = {
  isServerRunning: vi.fn(),
  stopServer: vi.fn(),
  startServer: vi.fn(),
};

describe('Briefcase', () => {
  let briefcase: Briefcase;

  beforeEach(() => {
    vi.clearAllMocks();
    briefcase = new Briefcase(
      mockRegistry as any,
      mockLLM as any,
      mockSOPRegistry as any,
      mockMCP as any
    );
  });

  it('should switch company correctly', async () => {
    const company = 'client-a';
    mockMCP.isServerRunning.mockReturnValue(false);

    await briefcase.switchCompany(company);

    expect(process.env.JULES_COMPANY).toBe(company);
    expect(mockSOPRegistry.setCompany).toHaveBeenCalledWith(company);
    expect(mockRegistry.loadCompanyTools).toHaveBeenCalledWith(company);

    // Check calls for both servers
    expect(mockMCP.isServerRunning).toHaveBeenCalledWith('context_server');
    expect(mockMCP.isServerRunning).toHaveBeenCalledWith('company');

    expect(mockMCP.stopServer).not.toHaveBeenCalled();
    expect(mockMCP.startServer).not.toHaveBeenCalled();
  });

  it('should restart context server if running', async () => {
    const company = 'client-b';
    mockMCP.isServerRunning.mockReturnValue(true);

    await briefcase.switchCompany(company);

    expect(process.env.JULES_COMPANY).toBe(company);
    expect(mockSOPRegistry.setCompany).toHaveBeenCalledWith(company);
    expect(mockRegistry.loadCompanyTools).toHaveBeenCalledWith(company);

    expect(mockMCP.isServerRunning).toHaveBeenCalledWith('context_server');
    expect(mockMCP.stopServer).toHaveBeenCalledWith('context_server');
    expect(mockMCP.startServer).toHaveBeenCalledWith('context_server');

    expect(mockMCP.isServerRunning).toHaveBeenCalledWith('company');
    expect(mockMCP.stopServer).toHaveBeenCalledWith('company');
    expect(mockMCP.startServer).toHaveBeenCalledWith('company');
  });

  it('should throw error for invalid company name', async () => {
    // We need to wrap the async call in a function for expect().rejects to work
    await expect(async () => await briefcase.switchCompany('../../evil')).rejects.toThrow();
    await expect(async () => await briefcase.switchCompany('client/a')).rejects.toThrow();
    await expect(async () => await briefcase.switchCompany('client a')).rejects.toThrow();
  });
});
