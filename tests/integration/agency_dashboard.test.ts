import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { join } from 'path';

// Mocks must be hoisted
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  return {
    Client: vi.fn().mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn().mockImplementation(async ({ name }) => {
        if (name === 'get_fleet_status') {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify([{
                company: 'Test Company',
                projectId: 'proj_123',
                active_agents: 5,
                pending_issues: 2,
                health: 'healthy',
                last_updated: new Date().toISOString()
              }])
            }]
          };
        }
        if (name === 'billing_get_financial_kpis') {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                outstanding_amount: 5000,
                overdue_amount: 0,
                revenue_last_30d: 10000,
                active_clients_billing: 3,
                currency: 'USD'
              })
            }]
          };
        }
        if (name === 'generate_dashboard_summary') {
             return { content: [{ type: 'text', text: "System is healthy." }] };
        }
        return { content: [] };
      })
    }))
  };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
  return {
    StdioClientTransport: vi.fn().mockImplementation(() => ({}))
  };
});

vi.mock('../../src/brain/episodic.js', () => {
  return {
    EpisodicMemory: vi.fn().mockImplementation(() => ({
      getRecentEpisodes: vi.fn().mockResolvedValue([])
    }))
  };
});

vi.mock('../../src/config.js', () => {
  return {
    loadConfig: vi.fn().mockResolvedValue({ companies: ['Test Company'] })
  };
});

vi.mock('fs/promises', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-ignore
        ...actual,
        readFile: vi.fn().mockImplementation(async (path, encoding) => {
            if (String(path).includes('alert_rules.json')) return '[]';
             // @ts-ignore
            return actual.readFile(path, encoding);
        })
    };
});

import { main } from '../../src/mcp_servers/health_monitor/index.js';

describe('Agency Dashboard Integration', () => {
  let server: any;
  const PORT = 3005;

  beforeAll(async () => {
    process.env.PORT = String(PORT);
    // Start server
    server = await main();
  });

  afterAll(() => {
    if (server) server.close();
  });

  it('GET /api/dashboard/data returns aggregated metrics from Business Ops and System', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/dashboard/data`);
    expect(res.status).toBe(200);
    const body: any = await res.json();

    expect(body).toHaveProperty('fleet');
    expect(body).toHaveProperty('finance');
    expect(body).toHaveProperty('system');

    // Verify Fleet Data (from Mock)
    expect(body.fleet).toHaveLength(1);
    expect(body.fleet[0].company).toBe('Test Company');
    expect(body.fleet[0].active_agents).toBe(5);

    // Verify Finance Data (from Mock)
    expect(body.finance.revenue_last_30d).toBe(10000);
    expect(body.finance.outstanding_amount).toBe(5000);

    // Verify System Data (Local)
    expect(body.system).toHaveProperty('uptime');
    expect(body.system).toHaveProperty('alerts');
    expect(Array.isArray(body.system.active_alerts)).toBe(true);
  });
});
