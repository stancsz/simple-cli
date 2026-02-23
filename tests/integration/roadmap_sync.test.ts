import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

// Hoist mockGitInstance so it can be used in vi.mock
const { mockGitInstance } = vi.hoisted(() => {
  return {
    mockGitInstance: {
      log: vi.fn(),
    },
  };
});

// Mock simple-git
vi.mock('simple-git', () => ({
  default: vi.fn(() => mockGitInstance),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

// Mock McpServer
const { mockTools } = vi.hoisted(() => ({ mockTools: {} as Record<string, any> }));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  return {
    McpServer: class {
      constructor(public info: any) {}
      tool(name: string, desc: string, schema: any, handler: any) {
        mockTools[name] = handler;
      }
      async connect() {}
    }
  }
});

// Mock StdioServerTransport
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: class {}
}));

// Import the server AFTER mocking
import { RoadmapSyncServer } from '../../src/mcp_servers/roadmap_sync/index.js';

describe('Roadmap Sync Server', () => {
  let server: RoadmapSyncServer;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mockTools
    for (const key in mockTools) delete mockTools[key];

    // Reset git log
    mockGitInstance.log.mockReset();
    mockGitInstance.log.mockResolvedValue({ all: [] });

    server = new RoadmapSyncServer();
  });

  it('should register tools', () => {
    expect(mockTools.scan_recent_activity).toBeDefined();
    expect(mockTools.update_roadmap).toBeDefined();
  });

  it('scan_recent_activity should return completed items', async () => {
    mockGitInstance.log.mockResolvedValue({
      all: [
        { hash: '1', date: '2023-10-27', message: 'feat: Add new feature', body: '', author_name: 'Dev' },
        { hash: '2', date: '2023-10-26', message: 'fix: Bug fix', body: '', author_name: 'Dev' },
        { hash: '3', date: '2023-10-25', message: 'chore: Cleanup', body: '', author_name: 'Dev' },
        { hash: '4', date: '2023-10-24', message: 'Update docs', body: '[x] Completed task', author_name: 'Dev' },
      ],
    });

    const handler = mockTools.scan_recent_activity;
    const result = await handler({ limit: 10 });

    expect(result.content).toBeDefined();
    const items = JSON.parse(result.content[0].text);
    expect(items).toHaveLength(3); // feat, fix, [x]
    expect(items[0].message).toBe('feat: Add new feature');
    expect(items[1].message).toBe('fix: Bug fix');
    expect(items[2].body).toBe('[x] Completed task');
  });

  it('update_roadmap should update ROADMAP.md and todo.md', async () => {
    mockGitInstance.log.mockResolvedValue({
      all: [
        { hash: '1', date: '2023-10-27', message: 'feat: Add Super Feature', body: '', author_name: 'Dev' },
      ],
    });

    (existsSync as any).mockReturnValue(true);
    (readFile as any).mockResolvedValueOnce(
      '# Roadmap\n- [ ] Add Super Feature\n- [ ] Other Feature'
    ).mockResolvedValueOnce(
      '# Todo\n- [ ] Add Super Feature\n- [ ] Other Task'
    );

    const handler = mockTools.update_roadmap;
    const result = await handler({});

    expect(readFile).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenCalledTimes(2);

    // Verify ROADMAP.md update
    const roadmapCall = (writeFile as any).mock.calls.find((call: any[]) => call[0].endsWith('ROADMAP.md'));
    expect(roadmapCall).toBeDefined();
    expect(roadmapCall[1]).toContain('- [x] Add Super Feature (Completed: 2023-10-27)');
    expect(roadmapCall[1]).toContain('> **Last Updated:**');

    // Verify todo.md update
    const todoCall = (writeFile as any).mock.calls.find((call: any[]) => call[0].endsWith('todo.md'));
    expect(todoCall).toBeDefined();
    expect(todoCall[1]).toContain('- [x] ~~Add Super Feature~~');

    expect(result.content[0].text).toContain('ROADMAP: Marked \'- [ ] Add Super Feature\' as completed.');
    expect(result.content[0].text).toContain('TODO: Struck through \'- [ ] Add Super Feature\'.');
  });

  it('update_roadmap should handle no relevant activity', async () => {
    mockGitInstance.log.mockResolvedValue({ all: [] });

    const handler = mockTools.update_roadmap;
    const result = await handler({});

    expect(result.content[0].text).toContain('No relevant activity');
    expect(readFile).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });
});
