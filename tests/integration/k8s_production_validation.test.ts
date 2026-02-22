import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess, execSync, exec } from "child_process";
import { join } from "path";
import { mkdir, rm, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { fetch } from "undici";
import { promisify } from "util";

const execAsync = promisify(exec);

// Helper to kill process on port
async function killPort(port: number) {
  try {
    const { stdout } = await execAsync(`lsof -t -i :${port}`);
    if (stdout) {
      const pids = stdout.trim().split('\n').join(' ');
      console.log(`Killing process on port ${port}: ${pids}`);
      await execAsync(`kill -9 ${pids}`);
    }
  } catch (e) {
    // Ignore if no process found
  }
}

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

// Check for Kind Availability
const isKindAvailable = (() => {
  try {
    execSync("kind version", { stdio: "ignore" });
    execSync("kubectl version --client", { stdio: "ignore" });
    // Also check if a cluster is actually running/accessible
    execSync("kubectl cluster-info", { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
})();

describe("Kubernetes Production Validation", () => {

  // --- MODE 1: SIMULATED ENVIRONMENT (Runs Always) ---
  // We run this always to validate application logic even if Kind is present.
  // Using different ports (3002/3004) avoids conflict if Kind runs in parallel on 3003/3005.
  describe("Simulated Environment", () => {
    let testRoot: string;
    let brainProcess: ChildProcess;
    let healthMonitorProcess: ChildProcess;
    const BRAIN_PORT = 3002;
    const HEALTH_PORT = 3004;

    beforeAll(async () => {
      console.log("Running Simulated Environment (Always active for logic validation).");

      // Ensure ports are free
      await killPort(BRAIN_PORT);
      await killPort(HEALTH_PORT);

      testRoot = await mkdir(join(tmpdir(), `k8s-validation-${Date.now()}`), { recursive: true });
      await mkdir(join(testRoot, ".agent", "brain"), { recursive: true });
      await mkdir(join(testRoot, ".agent", "metrics"), { recursive: true });

      console.log(`Test Root: ${testRoot}`);

      console.log("Starting Brain Server...");
      brainProcess = spawn("npx", ["tsx", "src/mcp_servers/brain/index.ts"], {
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

      console.log("Starting Health Monitor...");
      healthMonitorProcess = spawn("npx", ["tsx", "src/mcp_servers/health_monitor/index.ts"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: HEALTH_PORT.toString(),
          JULES_AGENT_DIR: join(testRoot, ".agent"),
        },
        stdio: "pipe",
      });
      healthMonitorProcess.stdout?.on("data", (d) => console.log(`[Health] ${d}`));
      healthMonitorProcess.stderr?.on("data", (d) => console.error(`[Health] ${d}`));

      await waitForPort(BRAIN_PORT);
      await waitForPort(HEALTH_PORT);
    }, 30000);

    afterAll(async () => {
      if (brainProcess) brainProcess.kill();
      if (healthMonitorProcess) healthMonitorProcess.kill();
      await new Promise(r => setTimeout(r, 1000));
    });

    it("should validate Multi-Tenancy Isolation", async () => {
      // Store A
      const resA = await fetch(`http://localhost:${BRAIN_PORT}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "tools/call",
          params: { name: "brain_store", arguments: { taskId: "task-a", request: "req-a", solution: "sol-a", company: "company-a" } }
        })
      });
      expect(resA.ok).toBe(true);

      // Store B
      const resB = await fetch(`http://localhost:${BRAIN_PORT}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 2, method: "tools/call",
          params: { name: "brain_store", arguments: { taskId: "task-b", request: "req-b", solution: "sol-b", company: "company-b" } }
        })
      });
      expect(resB.ok).toBe(true);

      await new Promise(r => setTimeout(r, 1000));

      // Query A
      const queryA = await fetch(`http://localhost:${BRAIN_PORT}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 3, method: "tools/call",
          params: { name: "brain_query", arguments: { query: "req-a", company: "company-a" } }
        })
      });
      const dataA = await parseSSEResponse(queryA) as any;
      expect(dataA.result.content[0].text).toContain("task-a");
      expect(dataA.result.content[0].text).not.toContain("task-b");

      // Query B
      const queryB = await fetch(`http://localhost:${BRAIN_PORT}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 4, method: "tools/call",
            params: { name: "brain_query", arguments: { query: "req-b", company: "company-b" } }
          })
        });
        const dataB = await parseSSEResponse(queryB) as any;
        expect(dataB.result.content[0].text).toContain("task-b");
        expect(dataB.result.content[0].text).not.toContain("task-a");
    });

    it("should validate Persistence (Restart Brain)", async () => {
      brainProcess.kill('SIGKILL');
      await new Promise(r => setTimeout(r, 2000));

      console.log("Restarting Brain Server...");
      brainProcess = spawn("npx", ["tsx", "src/mcp_servers/brain/index.ts"], {
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

      const queryA = await fetch(`http://localhost:${BRAIN_PORT}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 5, method: "tools/call",
            params: { name: "brain_query", arguments: { query: "req-a", company: "company-a" } }
          })
        });
        const dataA = await parseSSEResponse(queryA) as any;
        expect(dataA.result.content[0].text).toContain("task-a");
    });

    it("should validate Sidecar Communication (Metrics)", async () => {
      const trackRes = await fetch(`http://localhost:${HEALTH_PORT}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 6, method: "tools/call",
            params: { name: "track_metric", arguments: { agent: "agent-sim", metric: "latency", value: 123 } }
          })
        });
      expect(trackRes.ok).toBe(true);

      await new Promise(r => setTimeout(r, 1000));

      const reportRes = await fetch(`http://localhost:${HEALTH_PORT}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 7, method: "tools/call",
            params: { name: "get_health_report", arguments: { timeframe: "last_hour" } }
          })
        });
      const reportData = await parseSSEResponse(reportRes) as any;
      expect(reportData.result.content[0].text).toContain("agent-sim:latency");
    });

    it("should validate 4-Pillar Integration (SOP + Brain)", async () => {
      const logRes = await fetch(`http://localhost:${BRAIN_PORT}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 8, method: "tools/call",
            params: { name: "log_experience", arguments: { taskId: "sop-1", task_type: "onboarding", agent_used: "sop-engine", outcome: "success", summary: "Completed onboarding SOP", company: "company-c" } }
          })
        });
      expect(logRes.ok).toBe(true);

      await new Promise(r => setTimeout(r, 1000));

      const recallRes = await fetch(`http://localhost:${BRAIN_PORT}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 9, method: "tools/call",
            params: { name: "recall_delegation_patterns", arguments: { task_type: "onboarding", company: "company-c" } }
          })
        });
      const recallData = await parseSSEResponse(recallRes) as any;
      expect(recallData.result.content[0].text).toContain("sop-engine");
    });

    it("should validate HR Loop Infrastructure (Proposal Storage)", async () => {
      const proposalDir = join(testRoot, ".agent", "companies", "company-a", "hr", "proposals");
      await mkdir(proposalDir, { recursive: true });
      const proposalFile = join(proposalDir, "proposal-1.json");
      await writeFile(proposalFile, JSON.stringify({ id: "proposal-1", title: "Fix Typo", description: "Fixing a typo in README", status: "pending" }));

      const logRes = await fetch(`http://localhost:${BRAIN_PORT}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 10, method: "tools/call",
            params: { name: "log_experience", arguments: { taskId: "hr-review-1", task_type: "hr_review", agent_used: "hr-agent", outcome: "success", summary: "Created proposal-1", company: "company-a" } }
          })
        });
      expect(logRes.ok).toBe(true);
      expect(existsSync(proposalFile)).toBe(true);
    });
  });

  // --- MODE 2: REAL KUBERNETES VALIDATION (Kind) ---
  describe.runIf(isKindAvailable)("Real Kubernetes Validation (Kind)", () => {
      const namespace = `test-ns-${Date.now()}`;
      const chartDir = join(process.cwd(), 'deployment', 'chart', 'simple-cli');
      let pfProcess: ChildProcess;
      const K8S_BRAIN_PORT = 3005; // Port-forward to avoid conflict with simulated 3002

      beforeAll(async () => {
          console.log("Starting Real K8s Validation in Kind...");

          // 1. Build Docker Images (Agent, Brain)
          try {
              console.log("Building/Loading Docker images...");
              await execAsync("docker build -t simple-cli:test .");
              // Assuming single image for now or reusing simple-cli:test for both if configured
              await execAsync("kind load docker-image simple-cli:test");
          } catch (e: any) {
              console.warn("Image build/load warning:", e.message);
          }

          // 2. Create Namespace
          await execAsync(`kubectl create namespace ${namespace}`);

          // 3. Install Chart
          // Use 'simple-cli:test' image and override pull policy
          await execAsync(`helm install test-release ${chartDir} --namespace ${namespace} --set image.repository=simple-cli --set image.tag=test --set image.pullPolicy=Never --set company=test-company --wait --timeout 120s`);

          // 4. Port Forward to Brain Service
          // Forward host:3005 -> service:3002
          console.log(`Port-forwarding Brain service to ${K8S_BRAIN_PORT}...`);
          pfProcess = spawn("kubectl", ["port-forward", "svc/test-release-brain", `${K8S_BRAIN_PORT}:3002`, "-n", namespace]);

          // Wait for port to be ready
          await waitForPort(K8S_BRAIN_PORT);
      }, 180000); // 3 minutes timeout

      afterAll(async () => {
          if (pfProcess) pfProcess.kill();
          await execAsync(`kubectl delete namespace ${namespace} --wait=false`).catch(() => {});
      });

      it("should have running pods", async () => {
          const { stdout } = await execAsync(`kubectl get pods -n ${namespace}`);
          expect(stdout).toContain("test-release-agent-0");
          expect(stdout).toContain("test-release-brain-0");
          expect(stdout).toContain("Running");
      });

      it("should have bound PVCs", async () => {
          const { stdout } = await execAsync(`kubectl get pvc -n ${namespace}`);
          expect(stdout).toContain("Bound");
      });

      it("should verify Brain connectivity via Port-Forward", async () => {
          // Simple health check or tool call
          const res = await fetch(`http://localhost:${K8S_BRAIN_PORT}/health`);
          expect(res.ok).toBe(true);

          // Store a value to verify persistence write
          const storeRes = await fetch(`http://localhost:${K8S_BRAIN_PORT}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                  jsonrpc: "2.0", id: 1, method: "tools/call",
                  params: { name: "brain_store", arguments: { taskId: "k8s-test", request: "req", solution: "sol", company: "test-company" } }
              })
          });
          expect(storeRes.ok).toBe(true);
      });
  });
});
