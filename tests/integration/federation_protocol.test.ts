import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerAgency, discoverAgencies, delegateTask } from '../../src/mcp_servers/federation/tools.js';
import { AgencyProfile, TaskDelegationRequest } from '../../src/mcp_servers/federation/protocol.js';
import http from 'http';
import fs from 'fs';
import path from 'path';

describe('Phase 31: Multi-Agency Federation Protocol', () => {
  let mockServer: http.Server;
  let mockServerPort = 0;

  // Set up temporary federation directory
  const testAgentDir = path.join(process.cwd(), '.agent_test_fed');
  process.env.JULES_AGENT_DIR = testAgentDir;

  beforeAll(async () => {
    // Ensure clean state
    if (fs.existsSync(testAgentDir)) {
      fs.rmSync(testAgentDir, { recursive: true, force: true });
    }

    // Create a mock HTTP server to simulate the target agency's endpoint
    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        if (req.url === '/mcp/delegate' && req.method === 'POST') {
          // Check security headers
          if (!req.headers['authorization']) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'Missing Authorization header' }));
            return;
          }

          if (!req.headers['x-federation-signature']) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'Missing Signature header' }));
            return;
          }

          const parsedBody = JSON.parse(body);

          if (parsedBody.task_description === 'fail_task') {
             res.writeHead(500);
             res.end(JSON.stringify({ error: 'Simulated failure' }));
             return;
          }

          // Simulate successful task processing
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            task_id: parsedBody.task_id,
            status: 'completed',
            result: `Processed: ${parsedBody.task_description}`
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
  });

  afterAll(() => {
    mockServer.close();
    if (fs.existsSync(testAgentDir)) {
      fs.rmSync(testAgentDir, { recursive: true, force: true });
    }
  });

  const agencyAlpha: AgencyProfile = {
    agency_id: 'agency_alpha',
    endpoint: 'http://127.0.0.1:0', // will be replaced with dynamic port
    capabilities: [
      { name: 'legal_review', description: 'Review legal documents', version: '1.0.0' }
    ],
    status: 'active',
    supported_protocols: ['mcp/1.0']
  };

  const agencyBeta: AgencyProfile = {
    agency_id: 'agency_beta',
    endpoint: 'http://127.0.0.1:0',
    capabilities: [
      { name: 'code_review', description: 'Review source code', version: '1.0.0' },
      { name: 'security_audit', description: 'Audit security architecture', version: '1.0.0' }
    ],
    status: 'inactive', // Note: inactive
    supported_protocols: ['mcp/1.0']
  };

  describe('Federation Protocol - Registration & Discovery', () => {
    it('should successfully register agency profiles to the local directory', async () => {
      agencyAlpha.endpoint = `http://127.0.0.1:${mockServerPort}`;
      agencyBeta.endpoint = `http://127.0.0.1:${mockServerPort}`;

      const res1 = await registerAgency(agencyAlpha);
      const res2 = await registerAgency(agencyBeta);

      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);

      // Verify file was created
      const agenciesFile = path.join(testAgentDir, 'federation', 'agencies.json');
      expect(fs.existsSync(agenciesFile)).toBe(true);
    });

    it('should successfully discover all active capabilities', async () => {
      const agencies = await discoverAgencies();
      expect(agencies.length).toBe(1);
      expect(agencies[0].agency_id).toBe('agency_alpha');
    });

    it('should filter discoveries by specific required capability', async () => {
      const agencies = await discoverAgencies('legal_review');
      expect(agencies.length).toBe(1);
      expect(agencies[0].agency_id).toBe('agency_alpha');

      const noAgencies = await discoverAgencies('unknown_capability');
      expect(noAgencies.length).toBe(0);
    });
  });

  describe('Federation Protocol - Task Delegation', () => {
    it('should securely delegate a sub-task to an active partner agency', async () => {
      const request: TaskDelegationRequest = {
        task_id: 'task_100',
        agency_id: 'agency_alpha',
        task_description: 'Please review this MSA'
      };

      const response = await delegateTask(request, 'test-api-key');

      expect(response.status).toBe('completed');
      expect(response.task_id).toBe('task_100');
      expect(response.result).toBe('Processed: Please review this MSA');
    });

    it('should reject delegation to an inactive agency', async () => {
      const request: TaskDelegationRequest = {
        task_id: 'task_101',
        agency_id: 'agency_beta',
        task_description: 'Please review this code'
      };

      const response = await delegateTask(request, 'test-api-key');

      expect(response.status).toBe('rejected');
      expect(response.error).toContain('is not active');
    });

    it('should handle target agency failure gracefully', async () => {
      const request: TaskDelegationRequest = {
        task_id: 'task_102',
        agency_id: 'agency_alpha',
        task_description: 'fail_task'
      };

      const response = await delegateTask(request, 'test-api-key');

      expect(response.status).toBe('failed');
      expect(response.error).toContain('HTTP 500');
    });

    it('should fail if the target agency is unknown', async () => {
      const request: TaskDelegationRequest = {
        task_id: 'task_103',
        agency_id: 'agency_omega',
        task_description: 'Do something'
      };

      const response = await delegateTask(request, 'test-api-key');

      expect(response.status).toBe('failed');
      expect(response.error).toContain('not found');
    });
  });
});
