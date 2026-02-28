import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createResilienceServer, ComponentState } from "../../src/mcp_servers/resilience/index.js";

describe('Phase 27: Enterprise Resilience Validation', () => {
    let serverInstance: ReturnType<typeof createResilienceServer>;

    beforeEach(() => {
        vi.clearAllMocks();
        serverInstance = createResilienceServer();
    });

    // Helper to call tools directly on the McpServer instance
    async function callTool(name: string, args: any) {
        // @ts-ignore - reaching into internals for testing without full transport
        const registeredTools = serverInstance.server._registeredTools;
        const tool = registeredTools && registeredTools[name];
        if (!tool) throw new Error(`Tool ${name} not found`);
        return await tool.handler(args, { request: {} as any, signal: new AbortController().signal });
    }

    it('should successfully simulate a failure for a component', async () => {
        const response = await callTool("simulate_failure", { component: "xero_api" });

        expect(response.content[0].text).toContain("successfully triggered for component: xero_api");
        expect(serverInstance.systemState["xero_api"].simulatedFailure).toBe(true);
    });

    it('should explicitly enable a circuit breaker', async () => {
        const response = await callTool("enable_circuit_breaker", { component: "linear_api", threshold: 5 });

        expect(response.content[0].text).toContain("Circuit breaker enabled for component: linear_api");
        expect(serverInstance.systemState["linear_api"].circuitBreakerOpen).toBe(true);
    });

    it('should trigger failover and reset the circuit breaker', async () => {
        // First, simulate it being open
        await callTool("enable_circuit_breaker", { component: "brain_db", threshold: 10 });
        expect(serverInstance.systemState["brain_db"].circuitBreakerOpen).toBe(true);

        // Now trigger failover
        const response = await callTool("trigger_failover", { component: "brain_db", backup_region: "us-east-2" });

        expect(response.content[0].text).toContain("routed to backup region: us-east-2");
        expect(serverInstance.systemState["brain_db"].failoverRegion).toBe("us-east-2");

        // Circuit breaker should be reset after failover
        expect(serverInstance.systemState["brain_db"].circuitBreakerOpen).toBe(false);
    });
});
