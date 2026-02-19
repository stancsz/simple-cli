import { vi } from 'vitest';

export const mockCallTool = vi.fn();
export const mockGetClient = vi.fn().mockReturnValue({
  callTool: mockCallTool,
  listTools: vi.fn().mockResolvedValue({ tools: [] }),
  close: vi.fn(),
});
export const mockInit = vi.fn();
export const mockStartServer = vi.fn();
export const mockListServers = vi.fn().mockReturnValue([{ name: "brain", status: "stopped" }]);
export const mockIsServerRunning = vi.fn().mockReturnValue(false);
export const mockStopServer = vi.fn();
export const mockGetTools = vi.fn().mockResolvedValue([]);

export class MCP {
  init = mockInit;
  startServer = mockStartServer;
  listServers = mockListServers;
  getClient = mockGetClient;
  isServerRunning = mockIsServerRunning;
  stopServer = mockStopServer;
  getTools = mockGetTools;
}
