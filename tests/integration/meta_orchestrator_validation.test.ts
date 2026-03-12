import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { discoverPartnerAgencies, delegateCrossAgencyTask, monitorCrossAgencyProgress } from '../../src/mcp_servers/meta_orchestrator/tools/index.js';
import { registerAgency } from '../../src/mcp_servers/federation/tools.js';
import http from 'http';
import fs from 'fs';
import path from 'path';

describe('Phase 31: Meta-Orchestrator Validation', () => {
  let mockServer: http.Server;
  let mockServerPort = 0;

  const testAgentDir = path.join(process.cwd(), '.agent_meta_orch');
  process.env.JULES_AGENT_DIR = testAgentDir;

  // Mock episodic memory to prevent test contamination
  vi.mock('../../src/brain/episodic.js', () => ({
    EpisodicMemory: class {
      async store() { return true; }
      async recall() { return []; }
      async search() { return []; }
    }
  }));

  beforeAll(async () => {
    if (fs.existsSync(testAgentDir)) {
      fs.rmSync(testAgentDir, { recursive: true, force: true });
    }

    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', () => {
        if (req.url === '/mcp/delegate' && req.method === 'POST') {
          const parsedBody = JSON.parse(body);

          if (parsedBody.task_description === 'fail_task') {
             res.writeHead(500);
             res.end(JSON.stringify({ error: 'Simulated failure' }));
             return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            task_id: parsedBody.task_id,
            status: 'completed',
            result: `Meta Processed: ${parsedBody.task_description}`
          }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const address = mockServer.address();
        if (address && typeof address !== 'string') {
          mockServerPort = address.port;
        }
        resolve();
      });
    });

    // Register test agencies
    await registerAgency({
      agency_id: 'meta_agency_alpha',
      endpoint: `http://127.0.0.1:${mockServerPort}`,
      capabilities: [ { name: 'analytics', description: 'Data analytics', version: '1.0' } ],
      status: 'active',
      supported_protocols: ['mcp/1.0']
    });
  });

  afterAll(() => {
    mockServer.close();
    if (fs.existsSync(testAgentDir)) {
      fs.rmSync(testAgentDir, { recursive: true, force: true });
    }
  });

  it('should discover partner agencies', async () => {
    const agencies = await discoverPartnerAgencies();
    expect(agencies.length).toBeGreaterThan(0);
    expect(agencies[0].agency_id).toBe('meta_agency_alpha');
  });

  it('should delegate a task successfully and log coordination pattern', async () => {
    const task = await delegateCrossAgencyTask({
      task_id: 'meta_task_1',
      agency_id: 'meta_agency_alpha',
      task_description: 'Analyze data',
      capability_required: 'analytics'
    });

    expect(task.status).toBe('completed');
    expect(task.result).toBe('Meta Processed: Analyze data');

    // Check monitoring
    const monitored = await monitorCrossAgencyProgress(['meta_task_1']);
    expect(monitored[0].task_id).toBe('meta_task_1');
    expect(monitored[0].status).toBe('completed');
  });

  it('should handle failed delegation', async () => {
    const task = await delegateCrossAgencyTask({
      task_id: 'meta_task_fail',
      agency_id: 'meta_agency_alpha',
      task_description: 'fail_task'
    });

    expect(task.status).toBe('failed');

    // Check monitoring
    const monitored = await monitorCrossAgencyProgress(['meta_task_fail']);
    expect(monitored[0].task_id).toBe('meta_task_fail');
    expect(monitored[0].status).toBe('failed');
  });
});
