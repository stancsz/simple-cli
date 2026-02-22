import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import fetch from 'node-fetch';
import { tmpdir } from 'os';
import { join } from 'path';

// Mock dependencies
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  return {
    Client: class MockClient {
      constructor() {}
      connect() { return Promise.resolve(); }
      callTool({ name, arguments: args }: any) {
        if (name === 'generate_dashboard_summary') {
          return Promise.resolve({
            content: [{ type: 'text', text: 'Mocked summary: All systems nominal.' }]
          });
        }
        return Promise.resolve({ content: [] });
      }
    }
  };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
    return {
        StdioClientTransport: class MockTransport {
            constructor() {}
        }
    };
});

// Mock config loading
vi.mock('../../src/config.js', () => ({
    loadConfig: async () => ({
        companies: ['TestCorp'],
        active_company: 'TestCorp'
    })
}));

// Mock logger
vi.mock('../../src/logger.js', () => ({
    logMetric: vi.fn()
}));

// Mock EpisodicMemory
vi.mock('../../src/brain/episodic.js', () => ({
    EpisodicMemory: class MockEpisodic {
        async getRecentEpisodes() {
            return [
                { tokens: 100, duration: 1000, agentResponse: "Success" },
                { tokens: 200, duration: 2000, agentResponse: "Outcome: Failure" }
            ];
        }
    }
}));


describe('Dashboard Integration', () => {
  let server: any;
  const PORT = 3005;
  const baseUrl = `http://localhost:${PORT}`;
  const testAgentDir = join(tmpdir(), `jules-test-${Date.now()}`);

  beforeAll(async () => {
    process.env.PORT = String(PORT);
    process.env.JULES_AGENT_DIR = testAgentDir;
    await fs.mkdir(testAgentDir, { recursive: true });

    // Dynamically import the module under test
    const { main } = await import('../../src/mcp_servers/health_monitor/index.ts');
    server = await main();
  });

  afterAll(async () => {
    if (server) server.close();
    await fs.rm(testAgentDir, { recursive: true, force: true });
  });

  it('should serve index.html', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Jules Operational Dashboard');
  });

  it('should serve metrics API with mocked data', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/metrics`);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.TestCorp).toBeDefined();
    expect(data.TestCorp.task_count).toBe(2);
    expect(data.TestCorp.success_rate).toBe(50); // 1 success, 1 failure
  });

  it('should serve summary API using mocked persona', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/summary`);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.summary).toBe('Mocked summary: All systems nominal.');
  });

  it('should serve alerts API', async () => {
      const res = await fetch(`${baseUrl}/api/dashboard/alerts`);
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(Array.isArray(data.alerts)).toBe(true);
  });
});
