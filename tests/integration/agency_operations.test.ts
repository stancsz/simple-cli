import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkflowRegistry } from '../../src/mcp_servers/agency_operations/workflows.js';
import { ReportingEngine } from '../../src/mcp_servers/agency_operations/reporting.js';
import { EscalationManager } from '../../src/mcp_servers/agency_operations/escalation.js';
import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

// Mock Executor for simulation
const mockExecuteTask = async (client: string, taskId: string, duration: number, shouldFail = false) => {
    // Simulate work
    await new Promise(resolve => setTimeout(resolve, duration));
    if (shouldFail) throw new Error("Simulated failure");
    return { status: 'success' };
};

describe('Agency Operations Production Simulation', () => {
    let registry: WorkflowRegistry;
    let reporting: ReportingEngine;
    let escalation: EscalationManager;

    beforeEach(async () => {
        // Clear DB file to ensure isolation between tests
        const dbPath = join(process.cwd(), '.agent', 'agency_workflows.json');
        if (existsSync(dbPath)) {
            await writeFile(dbPath, '[]');
        } else {
             // ensure directory exists
             const agentDir = join(process.cwd(), '.agent');
             if (!existsSync(agentDir)) {
                 const { mkdir } = await import('fs/promises');
                 await mkdir(agentDir, { recursive: true });
             }
             await writeFile(dbPath, '[]');
        }

        registry = new WorkflowRegistry();
        reporting = new ReportingEngine(registry);
        escalation = new EscalationManager(registry);
    });

    it('should handle concurrent workflow registration and updates', async () => {
        const clients = ['ClientA', 'ClientB', 'ClientC'];

        // Concurrent Registration
        await Promise.all(clients.map(client =>
            registry.register(client, 'onboarding', '0 9 * * 1')
        ));

        const workflows = await registry.list();
        const ourWorkflows = workflows.filter(w => clients.includes(w.client));
        expect(ourWorkflows).toHaveLength(3);

        // Concurrent Execution Simulation
        const results = await Promise.all(ourWorkflows.map(async (wf) => {
            try {
                await registry.updateStatus(wf.id, 'active', 'Running task');
                await mockExecuteTask(wf.client, wf.id, 10); // 10ms task
                await registry.updateStatus(wf.id, 'completed', 'Task finished');
                return { id: wf.id, success: true };
            } catch (e) {
                return { id: wf.id, success: false };
            }
        }));

        expect(results.every(r => r.success)).toBe(true);

        // Verify Isolation (Registry check)
        for (const client of clients) {
            const clientWfs = await registry.list(client);
            const completed = clientWfs.find(w => w.status === 'completed');
            expect(completed).toBeDefined();
        }
    });

    it('should trigger escalation after simulated failures', async () => {
        const wf = await registry.register('FailingClient', 'critical');

        // Simulate 3 failures
        for (let i = 0; i < 3; i++) {
             try {
                 await mockExecuteTask('FailingClient', wf.id, 5, true);
             } catch {
                 await registry.updateStatus(wf.id, 'active', `Failure ${i+1}`); // Reset for retry
             }
        }

        // Trigger escalation
        const result = await escalation.escalate(wf.id, '3 consecutive failures');
        expect(result.success).toBe(true);

        const updated = await registry.get(wf.id);
        expect(updated?.status).toBe('escalated');
    });

    it('should generate accurate reports for multiple clients', async () => {
         await registry.register('ReportClientA', 'task1');
         await registry.register('ReportClientB', 'task2');

         const reportA = await reporting.generateReport('ReportClientA');
         const reportB = await reporting.generateReport('ReportClientB');

         expect(reportA).toContain('task1');
         expect(reportA).not.toContain('task2');

         expect(reportB).toContain('task2');
         expect(reportB).not.toContain('task1');
    });
});
