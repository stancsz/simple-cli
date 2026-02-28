import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// In-memory state for basic chaos engineering and circuit breakers
export interface ComponentState {
  simulatedFailure: boolean;
  circuitBreakerOpen: boolean;
  failoverRegion: string | null;
}

export function createResilienceServer() {
  const server = new McpServer({
    name: "resilience",
    version: "1.0.0"
  });

  const systemState: Record<string, ComponentState> = {};

  function getOrCreateState(component: string): ComponentState {
    if (!systemState[component]) {
      systemState[component] = {
        simulatedFailure: false,
        circuitBreakerOpen: false,
        failoverRegion: null
      };
    }
    return systemState[component];
  }

  server.tool(
    "simulate_failure",
    "Triggers a simulated failure for a specific system component to test recovery procedures.",
    {
      component: z.string().describe("The identifier of the component to fail (e.g., 'xero', 'brain_db', 'linear_api')")
    },
    async ({ component }) => {
      const state = getOrCreateState(component);
      state.simulatedFailure = true;

      // Conceptually log to Brain / Health Monitor here
      console.warn(`[Resilience] Simulated failure started for component: ${component}`);

      return {
        content: [
          {
            type: "text",
            text: `Simulated failure successfully triggered for component: ${component}.`
          }
        ]
      };
    }
  );

  server.tool(
    "enable_circuit_breaker",
    "Explicitly enables a circuit breaker for a component, preventing further calls to it and placing the system in a degraded state.",
    {
      component: z.string().describe("The identifier of the component to protect."),
      threshold: z.number().describe("The error threshold or timeout value that triggered this breaker.")
    },
    async ({ component, threshold }) => {
      const state = getOrCreateState(component);
      state.circuitBreakerOpen = true;

      console.warn(`[Resilience] Circuit breaker OPENED for component: ${component} (Threshold: ${threshold})`);

      return {
        content: [
          {
            type: "text",
            text: `Circuit breaker enabled for component: ${component}. The system is now in a degraded state.`
          }
        ]
      };
    }
  );

  server.tool(
    "trigger_failover",
    "Initiates a failover from a failing primary component to a designated backup system or region.",
    {
      component: z.string().describe("The identifier of the failing primary component."),
      backup_region: z.string().describe("The identifier or URI of the backup system/region (e.g., 'us-east-2', 'mock_service').")
    },
    async ({ component, backup_region }) => {
      const state = getOrCreateState(component);

      // Failover implies routing away from the failure, resetting the circuit breaker
      state.failoverRegion = backup_region;
      state.circuitBreakerOpen = false;

      console.warn(`[Resilience] Failover triggered for component: ${component} -> ${backup_region}`);

      return {
        content: [
          {
            type: "text",
            text: `Failover triggered successfully. Component ${component} is now routed to backup region: ${backup_region}.`
          }
        ]
      };
    }
  );

  return { server, systemState };
}

export async function main() {
  const { server } = createResilienceServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Resilience MCP Server running on stdio");
}

import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
