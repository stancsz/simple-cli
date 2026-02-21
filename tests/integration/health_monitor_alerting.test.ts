import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { mkdir, writeFile, rm } from 'fs/promises';
import http from 'http';
import { AddressInfo } from 'net';

const TEST_DIR = join(process.cwd(), 'tests', 'temp', 'health_monitor_alerting');
const METRICS_DIR = join(TEST_DIR, 'metrics');
const ALERT_RULES_FILE = join(TEST_DIR, 'alert_rules.json');

describe('Health Monitor Alerting Integration', () => {
  let webhookServer: http.Server;
  let webhookUrl: string;
  let receivedAlerts: any[] = [];

  beforeAll(async () => {
    // Setup directories
    await mkdir(METRICS_DIR, { recursive: true });

    // Start mock webhook server
    webhookServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        if (req.method === 'POST') {
          try {
            receivedAlerts.push(JSON.parse(body));
          } catch (e) {
            console.error('Failed to parse webhook body:', e);
          }
          res.writeHead(200);
          res.end('OK');
        } else {
          res.writeHead(405);
          res.end();
        }
      });
    });

    await new Promise<void>(resolve => {
      webhookServer.listen(0, () => {
        const address = webhookServer.address() as AddressInfo;
        webhookUrl = `http://localhost:${address.port}/webhook`;
        console.log(`Mock webhook server running at ${webhookUrl}`);
        resolve();
      });
    });
  });

  afterAll(async () => {
    webhookServer.close();
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should trigger an alert when threshold is breached', async () => {
    // 1. Create metrics
    const today = new Date().toISOString().split('T')[0];
    const metricFile = join(METRICS_DIR, `${today}.ndjson`);

    // Create timestamps within the last 5 minutes
    const now = new Date();
    const twoMinsAgo = new Date(now.getTime() - 2 * 60 * 1000).toISOString();

    const metrics = [
      { timestamp: twoMinsAgo, agent: 'test_agent', metric: 'error_rate', value: 10, tags: {} },
      { timestamp: twoMinsAgo, agent: 'test_agent', metric: 'error_rate', value: 15, tags: {} },
      { timestamp: twoMinsAgo, agent: 'test_agent', metric: 'error_rate', value: 20, tags: {} }
    ];

    await writeFile(metricFile, metrics.map(m => JSON.stringify(m)).join('\n'));

    // 2. Create alert rule
    const rules = [
      {
        metric: 'error_rate',
        threshold: 5,
        operator: '>',
        contact: webhookUrl,
        created_at: new Date().toISOString()
      }
    ];
    await writeFile(ALERT_RULES_FILE, JSON.stringify(rules, null, 2));

    // 3. Run the MCP server
    const serverProcess = spawn('npx', ['tsx', 'src/mcp_servers/health_monitor/index.ts'], {
      env: {
        ...process.env,
        JULES_AGENT_DIR: TEST_DIR, // Ensure server uses this for metrics
        JULES_ALERT_RULES_FILE: ALERT_RULES_FILE // Ensure server uses this for rules
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    serverProcess.stderr.on('data', (data) => {
        // console.error(`Server stderr: ${data}`);
    });

    // Helper to send JSON-RPC
    const send = (msg: any) => {
        serverProcess.stdin.write(JSON.stringify(msg) + '\n');
    };

    // Handshake
    const initRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" }
      }
    };
    send(initRequest);

    let initialized = false;
    let toolCalled = false;
    let outputBuffer = '';

    return new Promise<void>((resolve, reject) => {
        serverProcess.stdout.on('data', (data) => {
            outputBuffer += data.toString();
            const lines = outputBuffer.split('\n');
            outputBuffer = lines.pop() || ''; // Keep incomplete line

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const msg = JSON.parse(line);
                    if (msg.id === 1 && msg.result) {
                        // Init complete, send initialized notification
                        send({ jsonrpc: "2.0", method: "notifications/initialized" });
                        initialized = true;

                        // Call tool
                        send({
                            jsonrpc: "2.0",
                            id: 2,
                            method: "tools/call",
                            params: {
                                name: "check_alerts",
                                arguments: {}
                            }
                        });
                    } else if (msg.id === 2 && msg.result) {
                        // Tool execution complete
                        toolCalled = true;

                        // Check webhook
                        // Wait a bit for async fetch to complete (it happens inside the tool execution but might be async)
                        // Actually tool execution awaits sendAlert, so it should be done.
                        setTimeout(() => {
                            try {
                                expect(receivedAlerts.length).toBeGreaterThan(0);
                                const alert = receivedAlerts[0];
                                expect(alert.text).toContain('ALERT: error_rate is 15.00 (> 5)');
                                serverProcess.kill();
                                resolve();
                            } catch (e) {
                                reject(e);
                            }
                        }, 100);
                    }
                } catch (e) {
                    // Ignore parsing errors for partial JSON
                }
            }
        });

        serverProcess.on('error', reject);

        // Timeout
        setTimeout(() => {
            serverProcess.kill();
            reject(new Error('Test timed out'));
        }, 15000);
    });
  }, 20000);
});
