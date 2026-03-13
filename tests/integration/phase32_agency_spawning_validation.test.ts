import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EpisodicMemory } from '../../src/brain/episodic.js';
import { registerAgency, discoverAgencies, delegateTask } from '../../src/mcp_servers/federation/tools.js';
import { AgencyProfile, TaskDelegationRequest } from '../../src/mcp_servers/federation/protocol.js';
import { randomUUID } from 'crypto';
import http from 'http';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

// Mock spawning protocol
async function spawnChildAgency(name: string, context: Record<string, any>, options: { yoloMode: boolean, resourceLimit: number }) {
    if (options.resourceLimit < 10) {
        throw new Error('Insufficient resources to spawn child agency');
    }

    const childDir = path.join(process.cwd(), `.agent_test_spawn_${name}`);
    const brainDir = path.join(childDir, 'brain');

    await fsPromises.mkdir(childDir, { recursive: true });
    await fsPromises.mkdir(brainDir, { recursive: true });

    // Store context directly to simulate injection
    const contextPath = path.join(childDir, 'context.json');
    await fsPromises.writeFile(contextPath, JSON.stringify(context, null, 2));

    return {
        agency_id: `agency_${name}`,
        directory: childDir,
        brain: brainDir,
        status: 'active'
    };
}

describe('Phase 32 Validation: Agency Spawning Protocol', () => {
    let mockServer: http.Server;
    let mockServerPort = 0;

    let parentMemory: EpisodicMemory;
    const tools: Record<string, any> = {};

    const parentAgentDir = path.join(process.cwd(), '.agent_test_parent');
    const parentBrainDir = path.join(parentAgentDir, 'brain');

    const spawnedDirs: string[] = [];

    beforeAll(async () => {
        // Ensure clean state
        if (fs.existsSync(parentAgentDir)) {
            await fsPromises.rm(parentAgentDir, { recursive: true, force: true });
        }
        process.env.JULES_AGENT_DIR = parentAgentDir;

        // Create HTTP server to mock target sub-agencies responses
        mockServer = http.createServer((req, res) => {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => {
                if (req.url === '/mcp/delegate' && req.method === 'POST') {
                    const parsedBody = JSON.parse(body);

                    let resultMsg = `Processed: ${parsedBody.task_description}`;
                    if (parsedBody.agency_id === 'agency_child1') {
                        resultMsg = 'Child Agency Delivered: Task Complete';
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        task_id: parsedBody.task_id,
                        status: 'completed',
                        result: resultMsg
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

        vi.spyOn(EpisodicMemory.prototype as any, 'getEmbedding').mockResolvedValue(new Array(1536).fill(0.1));

        parentMemory = new EpisodicMemory(parentBrainDir);
        await parentMemory.init();
    });

    afterAll(async () => {
        vi.restoreAllMocks();
        mockServer.close();

        if (fs.existsSync(parentAgentDir)) {
            await fsPromises.rm(parentAgentDir, { recursive: true, force: true });
        }
        for (const dir of spawnedDirs) {
            if (fs.existsSync(dir)) {
                await fsPromises.rm(dir, { recursive: true, force: true });
            }
        }
    });

    it('should successfully spawn a child agency', async () => {
        const result = await spawnChildAgency('child1', { niche: 'frontend_dev' }, { yoloMode: true, resourceLimit: 100 });

        expect(result.status).toBe('active');
        expect(result.agency_id).toBe('agency_child1');

        spawnedDirs.push(result.directory);
        expect(fs.existsSync(result.directory)).toBe(true);
        expect(fs.existsSync(result.brain)).toBe(true);
    });

    it('should inject initial context correctly', async () => {
        const childDir = path.join(process.cwd(), '.agent_test_spawn_child1');
        const contextPath = path.join(childDir, 'context.json');

        expect(fs.existsSync(contextPath)).toBe(true);
        const context = JSON.parse(await fsPromises.readFile(contextPath, 'utf8'));
        expect(context.niche).toBe('frontend_dev');
    });

    it('should operate independently', async () => {
        // Mock child registering with federation
        const childProfile: AgencyProfile = {
            agency_id: 'agency_child1',
            endpoint: `http://127.0.0.1:${mockServerPort}`,
            capabilities: [
                { name: 'frontend_dev', description: 'Vue 3 UI Components', version: '1.0.0' }
            ],
            status: 'active',
            supported_protocols: ['mcp/1.0']
        };
        await registerAgency(childProfile);

        // Parent discovers and delegates
        const discovered = await discoverAgencies('frontend_dev');
        expect(discovered.length).toBe(1);
        expect(discovered[0].agency_id).toBe('agency_child1');

        const taskReq: TaskDelegationRequest = {
            task_id: `task_child_${randomUUID()}`,
            agency_id: 'agency_child1',
            task_description: 'Build a Vue 3 weather dashboard widget'
        };
        const response = await delegateTask(taskReq, 'fake_key');
        expect(response.status).toBe('completed');
        expect(response.result).toContain('Child Agency Delivered');
    });

    it('should maintain resource isolation', async () => {
        const childDir = path.join(process.cwd(), '.agent_test_spawn_child1');
        const childBrainDir = path.join(childDir, 'brain');

        // They should have different brain directories
        expect(childBrainDir).not.toBe(parentBrainDir);

        // Initialize child memory
        const childMemory = new EpisodicMemory(childBrainDir);
        await childMemory.init();

        await childMemory.store(
            'test',
            'test request',
            'child solution'
        );

        // Search child memory
        const childResults = await childMemory.recall('test request');
        expect(childResults.length).toBe(1);
        expect(childResults[0].agentResponse || childResults[0].solution).toBe('child solution');

        // Search parent memory (should be isolated)
        const parentResults = await parentMemory.recall('test request');
        expect(parentResults.length).toBe(0);
    });

    it('should handle errors gracefully', async () => {
        await expect(spawnChildAgency('child2', { niche: 'backend_dev' }, { yoloMode: true, resourceLimit: 5 }))
            .rejects.toThrow('Insufficient resources to spawn child agency');
    });
});
