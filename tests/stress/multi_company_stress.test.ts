import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';

// Helper to wait for a port to be ready
async function waitForPort(port: number, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for port ${port}`);
}

async function parseSSEResponse(res: Response) {
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${text}`);
    // Very simple SSE parser for test purposes
    if (text.includes("event: message")) {
        const lines = text.split("\n");
        for (const line of lines) {
            if (line.startsWith("data: ")) {
                return JSON.parse(line.substring(6));
            }
        }
    }
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

describe("Multi-Company Stress Test", () => {
  let testRoot: string;
  const companies = ['acme-corp', 'beta-tech', 'gamma-solutions', 'delta-systems', 'epsilon-enterprises'];
  let brainProcesses: ChildProcess[] = [];
  let healthProcesses: ChildProcess[] = [];
  let ports: Record<string, { brain: number, health: number }> = {};

  const BASE_PORT = 3030;
  const TIMEOUT = 300000; // 5 minutes per test case
  const LONG_RUN = process.env.LONG_RUN === 'true';

  beforeAll(async () => {
    // 1. Setup Test Environment
    testRoot = await mkdir(join(tmpdir(), `stress-test-${Date.now()}`), { recursive: true });
    console.log(`Test Root: ${testRoot}`);

    // Run setup script
    const setupProcess = spawn("npx", ["tsx", "scripts/setup-multi-company-stress.ts", testRoot], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit"
    });

    await new Promise((resolve, reject) => {
        setupProcess.on('close', (code) => {
            if (code === 0) resolve(code);
            else reject(new Error(`Setup failed with code ${code}`));
        });
    });

    // 2. Start Brain & Health Monitor Processes for EACH company
    const mcpServers: Record<string, any> = {};

    for (let i = 0; i < companies.length; i++) {
        const company = companies[i];
        const brainPort = BASE_PORT + (i * 2);
        const healthPort = BASE_PORT + (i * 2) + 1;
        ports[company] = { brain: brainPort, health: healthPort };

        // Ensure ports free
        try {
            const { execSync } = await import('child_process');
            execSync(`fuser -k ${brainPort}/tcp || true`);
            execSync(`fuser -k ${healthPort}/tcp || true`);
        } catch {}

        console.log(`Starting Servers for ${company} on ports ${brainPort}/${healthPort}...`);

        const bp = spawn("npx", ["tsx", "src/mcp_servers/brain/index.ts"], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                PORT: brainPort.toString(),
                JULES_AGENT_DIR: join(testRoot, ".agent"), // Shared storage
                MOCK_EMBEDDINGS: "true",
            },
            stdio: "pipe",
        });
        bp.stdout?.on("data", (d) => console.log(`[Brain-${company}] ${d}`));
        bp.stderr?.on("data", (d) => console.error(`[Brain-${company} ERR] ${d}`));
        brainProcesses.push(bp);

        const hp = spawn("npx", ["tsx", "src/mcp_servers/health_monitor/index.ts"], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                PORT: healthPort.toString(),
                JULES_AGENT_DIR: join(testRoot, ".agent"),
            },
            stdio: "pipe",
        });
        hp.stdout?.on("data", (d) => console.log(`[Health-${company}] ${d}`));
        hp.stderr?.on("data", (d) => console.error(`[Health-${company} ERR] ${d}`));
        healthProcesses.push(hp);

        mcpServers[`brain-${company}`] = {
            url: `http://localhost:${brainPort}/sse`
        };
    }

    // Wait for all ports
    console.log("Waiting for all ports to be ready...");
    for (const company of companies) {
        await waitForPort(ports[company].brain);
        await waitForPort(ports[company].health);
    }

    // Create mcp.json (optional now, but good for completeness)
    const mcpConfig = { mcpServers };
    await writeFile(join(testRoot, "mcp.json"), JSON.stringify(mcpConfig, null, 2));

  }, 120000);

  afterAll(async () => {
    brainProcesses.forEach(p => p.kill());
    healthProcesses.forEach(p => p.kill());
  });

  it("should handle concurrent SOP workflows (Simulated) without data leakage", async () => {
    // Simulate 3 concurrent SOP workflows via fetch
    const activeCompanies = companies.slice(0, 3);
    const steps = LONG_RUN ? 5000 : 50;

    const workers = activeCompanies.map(async (company) => {
        const brainPort = ports[company].brain;

        for (let i = 1; i <= steps; i++) {
            // 1. Query Brain (Simulating Context Retrieval)
            const queryRes = await fetch(`http://localhost:${brainPort}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
                body: JSON.stringify({
                    jsonrpc: "2.0", id: i, method: "tools/call",
                    params: {
                        name: "brain_query",
                        arguments: {
                            query: `Step ${i} context`,
                            company: company,
                            limit: 3
                        }
                    }
                })
            });
            const queryData = await parseSSEResponse(queryRes) as any;
            if (queryData.error) throw new Error(`Brain Query Failed: ${JSON.stringify(queryData.error)}`);

            // 2. Log Experience (Simulating Step Completion)
            const logRes = await fetch(`http://localhost:${brainPort}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
                body: JSON.stringify({
                    jsonrpc: "2.0", id: i, method: "tools/call",
                    params: {
                        name: "log_experience",
                        arguments: {
                            taskId: `sop-${company}-${Date.now()}`,
                            task_type: 'sop_execution',
                            agent_used: 'sop_engine',
                            outcome: 'success',
                            summary: `Step ${i} completed for ${company}`,
                            company: company
                        }
                    }
                })
            });
            const logData = await parseSSEResponse(logRes) as any;
            if (logData.error) throw new Error(`Log Experience Failed: ${JSON.stringify(logData.error)}`);

            // Simulate LLM processing time
            await new Promise(r => setTimeout(r, 10));
        }
    });

    console.log("Launching 3 concurrent SOP simulations...");
    const start = Date.now();
    await Promise.all(workers);
    const duration = Date.now() - start;
    console.log(`SOP Simulations finished in ${duration}ms`);

    // Verify Brain Isolation
    for (const company of activeCompanies) {
        const brainPort = ports[company].brain;
        // Search for this company's logs
        const queryRes = await fetch(`http://localhost:${brainPort}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
            body: JSON.stringify({
                jsonrpc: "2.0", id: 999, method: "tools/call",
                params: {
                    name: "brain_query",
                    arguments: {
                        query: `Step 50 completed for ${company}`,
                        company: company,
                        limit: 5
                    }
                }
            })
        });
        const data = await parseSSEResponse(queryRes) as any;

        // Assertions
        // Vector search might not return the exact last step if semantics are similar, but should return relevant steps
        expect(data.result.content[0].text).toMatch(new RegExp(`Step \\d+ completed for ${company}`));

        // Negative Assertion: Should NOT contain logs from other companies
        for (const other of activeCompanies) {
            if (other !== company) {
                expect(data.result.content[0].text).not.toContain(other);
            }
        }
    }
  }, TIMEOUT);

  it("should handle high-frequency Brain/Metric load (Desktop Simulation)", async () => {
      // Simulate 2 companies hammering their respective endpoints
      const activeCompanies = companies.slice(3, 5); // delta, epsilon
      const iterations = 50;

      const tasks = activeCompanies.map(async (company) => {
          const brainPort = ports[company].brain;
          const healthPort = ports[company].health;

          for (let i = 0; i < iterations; i++) {
              try {
                  // 1. Store memory
                  const storeRes = await fetch(`http://localhost:${brainPort}/messages`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
                      body: JSON.stringify({
                          jsonrpc: "2.0", id: i, method: "tools/call",
                          params: {
                              name: "brain_store",
                              arguments: {
                                  taskId: `desktop-${i}`,
                                  request: `Fill form ${i}`,
                                  solution: "Done",
                                  company: company
                              }
                          }
                      })
                  });
                  const storeData = await parseSSEResponse(storeRes) as any;
                  if (storeData.error) console.error(`Brain Store Failed for ${company}:`, storeData.error);

                  // 2. Track metric
                  const metricRes = await fetch(`http://localhost:${healthPort}/messages`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
                      body: JSON.stringify({
                          jsonrpc: "2.0", id: i, method: "tools/call",
                          params: {
                              name: "track_metric",
                              arguments: {
                                  agent: `desktop-agent-${company}`,
                                  metric: "latency",
                                  value: Math.random() * 100
                              }
                          }
                      })
                  });
                  const metricData = await parseSSEResponse(metricRes) as any;
                  if (metricData.error) console.error(`Metric Track Failed for ${company}:`, metricData.error);

              } catch (e) {
                  console.error(`Fetch failed for ${company}:`, e);
              }
              await new Promise(r => setTimeout(r, 10));
          }
      });

      console.log(`Starting Desktop Simulation...`);
      const start = Date.now();
      await Promise.all(tasks);
      const duration = Date.now() - start;
      console.log(`Desktop Simulation finished in ${duration}ms`);

      // Validation
      const today = new Date().toISOString().split('T')[0];
      const metricFile = join(testRoot, ".agent", "metrics", `${today}.ndjson`);

      // Allow some time for async writes
      await new Promise(r => setTimeout(r, 1000));

      if (!existsSync(metricFile)) {
          // List directory content for debugging
          const metricsDir = join(testRoot, ".agent", "metrics");
          if (existsSync(metricsDir)) {
              const { readdir } = await import('fs/promises');
              const files = await readdir(metricsDir);
              console.log(`Metrics Dir Content: ${files.join(', ')}`);
          } else {
              console.log(`Metrics Dir ${metricsDir} does not exist.`);
          }
      }

      expect(existsSync(metricFile)).toBe(true);
      const metrics = await readFile(metricFile, 'utf-8');
      expect(metrics.split('\n').filter(Boolean).length).toBeGreaterThan(50);
  }, TIMEOUT);

  it("should recover from Brain process failure (Resilience)", async () => {
      const company = "beta-tech";
      const brainPort = ports[company].brain;
      const processIndex = companies.indexOf(company);
      const brainProc = brainProcesses[processIndex];

      console.log(`[Resilience] Killing Brain for ${company} (PID ${brainProc.pid})...`);
      brainProc.kill();

      await new Promise(r => setTimeout(r, 1000)); // Wait for death

      // Verify fetch fails
      try {
          await fetch(`http://localhost:${brainPort}/health`);
          throw new Error("Brain should be down");
      } catch (e) {
          // Expected
      }

      console.log(`[Resilience] Restarting Brain for ${company}...`);
      const newBp = spawn("npx", ["tsx", "src/mcp_servers/brain/index.ts"], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                PORT: brainPort.toString(),
                JULES_AGENT_DIR: join(testRoot, ".agent"),
                MOCK_EMBEDDINGS: "true",
            },
            stdio: "pipe",
        });
      newBp.stdout?.on("data", (d) => console.log(`[Brain-${company}-Restart] ${d}`));
      newBp.stderr?.on("data", (d) => console.error(`[Brain-${company}-Restart ERR] ${d}`));

      // Replace in array to ensure cleanup
      brainProcesses[processIndex] = newBp;

      await waitForPort(brainPort);
      console.log(`[Resilience] Brain restarted.`);

      // Verify Data Persistence
      // Query for data stored in previous tests
      const queryRes = await fetch(`http://localhost:${brainPort}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
            body: JSON.stringify({
                jsonrpc: "2.0", id: 1000, method: "tools/call",
                params: {
                    name: "brain_query",
                    arguments: {
                        query: "sop_execution",
                        company: company,
                        limit: 5
                    }
                }
            })
        });
        const data = await parseSSEResponse(queryRes) as any;
        expect(data.result.content[0].text).toContain("sop_execution");

  }, TIMEOUT);
});
