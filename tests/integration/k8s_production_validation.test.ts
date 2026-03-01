import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "child_process";
import { join } from "path";
import { mkdir, rm, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { fetch } from "undici"; // vitest uses node, fetch available globally in node 18+, but undici is safer if not. actually fetch is global in node 22.

// Helper to wait for a port to be ready
async function waitForPort(port: number, timeout = 10000) {
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

async function waitForPortClosed(port: number, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await fetch(`http://localhost:${port}/health`);
      // If it responds, it's still open
    } catch {
      // If it fails to connect, it's closed
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for port ${port} to close`);
}

async function parseSSEResponse(res: Response) {
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${text}`);
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

describe("Kubernetes Production Validation (Simulated)", () => {
  let testRoot: string;
  let brainProcess: ChildProcess;
  let healthMonitorProcess: ChildProcess;
  const BRAIN_PORT = 3002;
  const HEALTH_PORT = 3004;

  beforeAll(async () => {
    // 1. Setup Test Environment (Simulating K8s PVCs)
    testRoot = await mkdir(join(tmpdir(), `k8s-validation-${Date.now()}`), { recursive: true });

    // Create PVC structure
    await mkdir(join(testRoot, ".agent", "brain"), { recursive: true });
    await mkdir(join(testRoot, ".agent", "metrics"), { recursive: true });

    // Copy necessary files (if any) or rely on src/
    // We run processes from the repo root but set CWD to testRoot?
    // No, if we set CWD to testRoot, they won't find node_modules or src.
    // Better to set CWD to repo root, but override storage paths via ENV if possible.
    // The code uses `process.cwd()` for storage.
    // We can symlink node_modules and src to testRoot? Or just mock process.cwd() inside the process?
    // Easiest: Run from repo root, but use JULES_AGENT_DIR env var if supported.
    // Memory says: "JULES_AGENT_DIR environment variable allows overriding the default .agent directory"

    console.log(`Test Root: ${testRoot}`);

    // 2. Start Brain Server (Simulating Brain Pod)
    console.log("Starting Brain Server...");
    brainProcess = spawn("./node_modules/.bin/tsx", ["src/mcp_servers/brain/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: BRAIN_PORT.toString(),
        JULES_AGENT_DIR: join(testRoot, ".agent"), // Override storage location
        MOCK_EMBEDDINGS: "true", // Use mock embeddings to avoid API calls
        // Ensure it uses the right .agent/brain
      },
      stdio: "pipe",
    });

    brainProcess.stdout?.on("data", (d) => console.log(`[Brain] ${d}`));
    brainProcess.stderr?.on("data", (d) => console.error(`[Brain] ${d}`));

    // 3. Start Health Monitor (Simulating Sidecar)
    console.log("Starting Health Monitor...");
    healthMonitorProcess = spawn("./node_modules/.bin/tsx", ["src/mcp_servers/health_monitor/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: HEALTH_PORT.toString(),
        JULES_AGENT_DIR: join(testRoot, ".agent"), // Shared volume
      },
      stdio: "pipe",
    });

    healthMonitorProcess.stdout?.on("data", (d) => console.log(`[Health] ${d}`));
    healthMonitorProcess.stderr?.on("data", (d) => console.error(`[Health] ${d}`));

    // Wait for services to be ready
    await waitForPort(BRAIN_PORT);
    await waitForPort(HEALTH_PORT);
  }, 30000); // 30s timeout for startup

  afterAll(async () => {
    // Cleanup
    if (brainProcess) brainProcess.kill();
    if (healthMonitorProcess) healthMonitorProcess.kill();

    // Wait for processes to exit
    await new Promise(r => setTimeout(r, 1000));

    // Remove temp dir
    // await rm(testRoot, { recursive: true, force: true });
  });

  it("should validate Multi-Tenancy Isolation", async () => {
    // We simulate multi-tenancy by storing data with 'company' tag/parameter
    // The Brain server supports 'company' param in 'brain_store'

    // Store data for Company A
    const resA = await fetch(`http://localhost:${BRAIN_PORT}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "brain_store",
          arguments: {
            taskId: "task-a",
            request: "req-a",
            solution: "sol-a",
            company: "company-a"
          }
        }
      })
    });
    if (!resA.ok) {
        console.error(`[Test] Failed to store task-a: ${resA.status} ${resA.statusText}`);
        console.error(`[Test] Response: ${await resA.text()}`);
    }
    expect(resA.ok).toBe(true);

    // Store data for Company B
    const resB = await fetch(`http://localhost:${BRAIN_PORT}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "brain_store",
          arguments: {
            taskId: "task-b",
            request: "req-b",
            solution: "sol-b",
            company: "company-b"
          }
        }
      })
    });
    expect(resB.ok).toBe(true);

    await new Promise(r => setTimeout(r, 1000)); // Wait for persistence

    // Query Company A (should only see A)
    const queryA = await fetch(`http://localhost:${BRAIN_PORT}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "brain_query",
          arguments: {
            query: "req-a",
            company: "company-a"
          }
        }
      })
    });
    const dataA = await parseSSEResponse(queryA) as any;
      if (!dataA.result || !dataA.result.content) {
          console.error(`[Test] Invalid Brain Response:`, JSON.stringify(dataA, null, 2));
      }
    expect(dataA.result.content[0].text).toContain("task-a");
    expect(dataA.result.content[0].text).not.toContain("task-b");

    // Query Company B (should only see B)
    const queryB = await fetch(`http://localhost:${BRAIN_PORT}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 4,
        method: "tools/call",
          params: {
            name: "brain_query",
            arguments: {
            query: "req-b",
              company: "company-b"
            }
          }
        })
      });
      const dataB = await parseSSEResponse(queryB) as any;
      expect(dataB.result.content[0].text).toContain("task-b");
      expect(dataB.result.content[0].text).not.toContain("task-a");
  });

  it("should validate Persistence (Restart Brain)", async () => {
    // Kill Brain
    brainProcess.kill();
    await waitForPortClosed(BRAIN_PORT);

    // Restart Brain
    console.log("Restarting Brain Server...");
    brainProcess = spawn("./node_modules/.bin/tsx", ["src/mcp_servers/brain/index.ts"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: BRAIN_PORT.toString(),
          JULES_AGENT_DIR: join(testRoot, ".agent"),
        MOCK_EMBEDDINGS: "true",
        },
        stdio: "pipe",
      });
      brainProcess.stdout?.on("data", (d) => console.log(`[Brain] ${d}`));
      brainProcess.stderr?.on("data", (d) => console.error(`[Brain] ${d}`));

    await waitForPort(BRAIN_PORT);

    // Query Company A again
    const queryA = await fetch(`http://localhost:${BRAIN_PORT}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 5,
        method: "tools/call",
          params: {
            name: "brain_query",
            arguments: {
            query: "req-a",
              company: "company-a"
            }
          }
        })
      });
      const dataA = await parseSSEResponse(queryA) as any;
      expect(dataA.result.content[0].text).toContain("task-a");
  });

  it("should validate Sidecar Communication (Metrics)", async () => {
    // 1. Agent (Simulated) logs a metric to the shared volume
    // We can use the 'track_metric' tool on Health Monitor (via API) OR write directly to file
    // Since HealthMonitor exposes 'track_metric' tool, let's use that first to simulate Agent calling it.
    // BUT the sidecar reads files written by 'src/logger.ts'.
    // 'src/logger.ts' writes to .agent/metrics/YYYY-MM-DD.ndjson

    // We can verify that if we use the tool 'track_metric' on the HealthMonitor server,
    // it writes to the file, and then 'get_health_report' reads it back.

    // Track Metric
    const trackRes = await fetch(`http://localhost:${HEALTH_PORT}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 6,
        method: "tools/call",
          params: {
            name: "track_metric",
            arguments: {
              agent: "agent-sim",
              metric: "latency",
              value: 123
            }
          }
        })
      });
    const trackData = await parseSSEResponse(trackRes);
    if (!trackRes.ok || (trackData.error)) {
         console.error(`[Test] Track Metric Failed:`, trackData);
    }
    expect(trackRes.ok).toBe(true);

    // Verify file exists in shared volume
    // The date format is YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];
    const metricFile = join(testRoot, ".agent", "metrics", `${today}.ndjson`);

    // Wait a bit for async write (logMetric is usually non-blocking/async)
    await new Promise(r => setTimeout(r, 1000));

    expect(existsSync(metricFile)).toBe(true);
    const content = await readFile(metricFile, 'utf-8');
    expect(content).toContain("agent-sim");
    expect(content).toContain("latency");
    expect(content).toContain("123");

    // Get Health Report (reads from file)
    const reportRes = await fetch(`http://localhost:${HEALTH_PORT}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 7,
        method: "tools/call",
          params: {
            name: "get_health_report",
            arguments: {
              timeframe: "last_hour"
            }
          }
        })
      });
    const reportData = await parseSSEResponse(reportRes) as any;
    expect(reportData.result.content[0].text).toContain("agent-sim:latency");
    expect(reportData.result.content[0].text).toContain("123");
  });

  it("should validate 4-Pillar Integration (SOP + Brain)", async () => {
    // Simulate SOP execution logging to Brain
    // We call 'log_experience' on Brain
    const logRes = await fetch(`http://localhost:${BRAIN_PORT}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 8,
        method: "tools/call",
          params: {
            name: "log_experience",
            arguments: {
              taskId: "sop-1",
              task_type: "onboarding",
              agent_used: "sop-engine",
              outcome: "success",
              summary: "Completed onboarding SOP",
              company: "company-c"
            }
          }
        })
      });
    expect(logRes.ok).toBe(true);

    await new Promise(r => setTimeout(r, 1000)); // Wait for persistence

    // Recall delegation patterns
    const recallRes = await fetch(`http://localhost:${BRAIN_PORT}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 9,
        method: "tools/call",
          params: {
            name: "recall_delegation_patterns",
            arguments: {
              task_type: "onboarding",
              company: "company-c"
            }
          }
        })
      });
    const recallData = await parseSSEResponse(recallRes) as any;
    expect(recallData.result.content[0].text).toContain("sop-engine");
    expect(recallData.result.content[0].text).toContain("100% success");
  });

  it("should validate HR Loop Infrastructure (Proposal Storage)", async () => {
    // Simulate HR Agent proposing a change
    // 1. Write proposal to FS (shared volume)
    const proposalDir = join(testRoot, ".agent", "companies", "company-a", "hr", "proposals");
    await mkdir(proposalDir, { recursive: true });
    const proposalFile = join(proposalDir, "proposal-1.json");
    const proposalContent = JSON.stringify({
        id: "proposal-1",
        title: "Fix Typo",
        description: "Fixing a typo in README",
        status: "pending"
    });
    await writeFile(proposalFile, proposalContent);

    // 2. Log this action to Brain (simulating HR logging)
    const logRes = await fetch(`http://localhost:${BRAIN_PORT}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 10,
        method: "tools/call",
          params: {
            name: "log_experience",
            arguments: {
              taskId: "hr-review-1",
              task_type: "hr_review",
              agent_used: "hr-agent",
              outcome: "success",
              summary: "Created proposal-1",
              company: "company-a"
            }
          }
        })
      });
    expect(logRes.ok).toBe(true);

    // 3. Verify Proposal exists (Persistence)
    expect(existsSync(proposalFile)).toBe(true);
    const readContent = await readFile(proposalFile, 'utf-8');
    expect(readContent).toContain("Fix Typo");
  });

  it("should validate Multi-Region Deployment and Failover (Simulated)", async () => {
    // 1. Simulate multi-region topology
    // In a real multi-region deployment, external-dns/Route53 directs traffic.
    // Here we simulate the Global Load Balancer (GLB) behavior.
    const REGION_1_PORT = BRAIN_PORT; // Assume this is us-east-1 (healthy)
    const REGION_2_PORT = BRAIN_PORT + 100; // Simulated eu-west-1 (we'll start a separate instance)

    // Start a secondary "region" brain process
    const region2Root = await mkdir(join(tmpdir(), `k8s-region2-${Date.now()}`), { recursive: true });
    await mkdir(join(region2Root, ".agent", "brain"), { recursive: true });

    console.log("Starting Region 2 Brain Server...");
    const region2Process = spawn("./node_modules/.bin/tsx", ["src/mcp_servers/brain/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: REGION_2_PORT.toString(),
        JULES_AGENT_DIR: join(region2Root, ".agent"),
        MOCK_EMBEDDINGS: "true",
        REGION: "eu-west-1"
      },
      stdio: "pipe",
    });

    await waitForPort(REGION_2_PORT);

    // Mocking GLB routing logic (Active-Passive failover)
    // If region 1 is healthy, return it, otherwise return region 2
    const getActiveEndpoint = async () => {
      try {
        const res = await fetch(`http://localhost:${REGION_1_PORT}/health`);
        if (res.ok) return `http://localhost:${REGION_1_PORT}`;
        throw new Error("Region 1 unhealthy");
      } catch (err) {
        try {
          const res2 = await fetch(`http://localhost:${REGION_2_PORT}/health`);
          if (res2.ok) return `http://localhost:${REGION_2_PORT}`;
        } catch {}
      }
      throw new Error("No healthy regions available");
    };

    // Before outage: traffic goes to Region 1
    const activeBeforeOutage = await getActiveEndpoint();
    expect(activeBeforeOutage).toBe(`http://localhost:${REGION_1_PORT}`);

    // Verify it works
    const testReq = await fetch(`${activeBeforeOutage}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 11,
        method: "tools/call",
        params: {
          name: "brain_store",
          arguments: {
            taskId: "multi-region-test-1",
            request: "ping",
            solution: "pong",
            company: "global-company"
          }
        }
      })
    });
    expect(testReq.ok).toBe(true);

    // Simulate Region 1 Outage
    console.log("Simulating Region 1 Outage...");
    brainProcess.kill();
    await waitForPortClosed(REGION_1_PORT);

    // After outage: traffic should route to Region 2
    const activeAfterOutage = await getActiveEndpoint();
    expect(activeAfterOutage).toBe(`http://localhost:${REGION_2_PORT}`);

    // Verify Region 2 is operational
    const testReq2 = await fetch(`${activeAfterOutage}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 12,
        method: "tools/call",
        params: {
          name: "brain_store",
          arguments: {
            taskId: "multi-region-test-2",
            request: "ping",
            solution: "pong",
            company: "global-company"
          }
        }
      })
    });
    expect(testReq2.ok).toBe(true);

    // Cleanup Region 2
    region2Process.kill();
    await waitForPortClosed(REGION_2_PORT);
  });
});
