import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EpisodicMemory } from '../../src/brain/episodic.js';
import { registerAgency, discoverAgencies, delegateTask } from '../../src/mcp_servers/federation/tools.js';
import { AgencyProfile, TaskDelegationRequest } from '../../src/mcp_servers/federation/protocol.js';
import { registerCollectiveLearningTools } from '../../src/mcp_servers/brain/tools/collective_learning.js';
import { registerLedgerTools } from '../../src/mcp_servers/distributed_ledger/tools.js';
import { randomUUID } from 'crypto';
import http from 'http';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

describe('Phase 31 Validation: Multi-Agency Federation', () => {
    let mockServer: http.Server;
    let mockServerPort = 0;

    let episodic: EpisodicMemory;
    let server: McpServer;
    const tools: Record<string, any> = {};

    // Use isolated testing directories for this specific test
    const testAgentDir = path.join(process.cwd(), '.agent_test_multi_fed');
    const testBrainDir = path.join(testAgentDir, 'brain');

    beforeAll(async () => {
        // Ensure clean state
        if (fs.existsSync(testAgentDir)) {
            await fsPromises.rm(testAgentDir, { recursive: true, force: true });
        }
        process.env.JULES_AGENT_DIR = testAgentDir;

        // Create HTTP server to mock target sub-agencies responses
        mockServer = http.createServer((req, res) => {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => {
                if (req.url === '/mcp/delegate' && req.method === 'POST') {
                    const parsedBody = JSON.parse(body);

                    let resultMsg = `Processed: ${parsedBody.task_description}`;
                    if (parsedBody.agency_id === 'agency_frontend') {
                        resultMsg = 'Frontend Component Delivered: <button>Vue Widget</button>';
                    } else if (parsedBody.agency_id === 'agency_backend') {
                        resultMsg = 'Backend API Delivered: { "status": "ok", "endpoints": ["/api/weather"] }';
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

        // Mock episodic memory embeddings
        vi.spyOn(EpisodicMemory.prototype as any, 'getEmbedding').mockResolvedValue(new Array(1536).fill(0.1));

        episodic = new EpisodicMemory(testBrainDir);
        await episodic.init();

        server = new McpServer({ name: 'test_multi_fed', version: '1.0' });

        // Intercept tool registration for local memory and ledger interactions
        vi.spyOn(server, 'tool').mockImplementation((name, desc, schema, func) => {
            if (typeof schema === 'function') {
                tools[name] = schema;
            } else {
                tools[name] = func;
            }
            return server as any;
        });

        registerCollectiveLearningTools(server, episodic);
        registerLedgerTools(server, episodic);
    });

    afterAll(async () => {
        vi.restoreAllMocks();
        mockServer.close();
        if (fs.existsSync(testAgentDir)) {
            await fsPromises.rm(testAgentDir, { recursive: true, force: true });
        }
    });

    it('should simulate an E2E multi-agency federation workflow: Discovery, Delegation, Memory Sharing, and Ledger Settlement', async () => {
        const leadAgency = 'agency_lead';
        const frontendAgency = 'agency_frontend';
        const backendAgency = 'agency_backend';
        const companyId = 'federation_project_' + randomUUID();

        // 1. Setup Agency Profiles
        const frontendProfile: AgencyProfile = {
            agency_id: frontendAgency,
            endpoint: `http://127.0.0.1:${mockServerPort}`,
            capabilities: [
                { name: 'frontend_dev', description: 'Vue 3 UI Components', version: '1.0.0' }
            ],
            status: 'active',
            supported_protocols: ['mcp/1.0']
        };

        const backendProfile: AgencyProfile = {
            agency_id: backendAgency,
            endpoint: `http://127.0.0.1:${mockServerPort}`,
            capabilities: [
                { name: 'backend_api', description: 'Node.js/Express APIs', version: '1.0.0' }
            ],
            status: 'active',
            supported_protocols: ['mcp/1.0']
        };

        await registerAgency(frontendProfile);
        await registerAgency(backendProfile);

        // 2. Discover Agencies
        const frontendAgencies = await discoverAgencies('frontend_dev');
        expect(frontendAgencies.length).toBe(1);
        expect(frontendAgencies[0].agency_id).toBe(frontendAgency);

        const backendAgencies = await discoverAgencies('backend_api');
        expect(backendAgencies.length).toBe(1);
        expect(backendAgencies[0].agency_id).toBe(backendAgency);

        // 3. Delegate Tasks
        const frontendTaskReq: TaskDelegationRequest = {
            task_id: `task_ui_${randomUUID()}`,
            agency_id: frontendAgency,
            task_description: 'Build a Vue 3 weather dashboard widget'
        };
        const frontendResp = await delegateTask(frontendTaskReq, 'fake_key');
        expect(frontendResp.status).toBe('completed');
        expect(frontendResp.result).toContain('Frontend Component Delivered');

        const backendTaskReq: TaskDelegationRequest = {
            task_id: `task_api_${randomUUID()}`,
            agency_id: backendAgency,
            task_description: 'Build a Node.js weather data API'
        };
        const backendResp = await delegateTask(backendTaskReq, 'fake_key');
        expect(backendResp.status).toBe('completed');
        expect(backendResp.result).toContain('Backend API Delivered');

        // 4. Memory Sharing (Collective Learning)
        const patternId = randomUUID();
        const sharedSpecs = {
            id: patternId,
            taskId: frontendTaskReq.task_id,
            request: 'Weather Dashboard Specs',
            solution: 'The frontend and backend will communicate via GraphQL endpoint at /graphql with query schema...',
            timestamp: Date.now(),
            type: 'shared_architecture_specs'
        };

        // Lead agency pushes the specs to shared federation namespace
        const syncResponse = await tools['sync_patterns_to_agency']({
            target_agency: 'federation_shared',
            patterns: [sharedSpecs]
        });
        expect(syncResponse.isError).toBeFalsy();

        // Frontend agency fetches the specs
        const fetchResponse = await tools['fetch_shared_patterns']({
            source_agency: 'federation_shared',
            query: 'Weather Dashboard Specs',
            limit: 5
        });
        expect(fetchResponse.isError).toBeFalsy();
        const fetchedPatterns = JSON.parse(fetchResponse.content[0].text);
        expect(fetchedPatterns.length).toBeGreaterThan(0);

        let targetPattern = fetchedPatterns.find((p: any) => p.id === `shared_${patternId}` || p.related_episode_id === patternId);
        if (!targetPattern) targetPattern = fetchedPatterns[0];
        expect(targetPattern).toBeDefined();

        // Frontend agency merges the shared spec into its local memory
        const mergeResponse = await tools['merge_shared_sops']({
            local_agency: frontendAgency,
            patterns: [{
                id: targetPattern.id,
                taskId: targetPattern.taskId,
                request: targetPattern.userPrompt,
                solution: targetPattern.agentResponse,
                timestamp: targetPattern.timestamp,
                type: targetPattern.type,
                related_episode_id: targetPattern.related_episode_id
            }]
        });
        expect(mergeResponse.isError).toBeFalsy();

        // 5. Distributed Ledger & Revenue Settlement
        // The lead agency collects the initial $10,000 project fee
        // We simulate the bank distributing the tokens/revenue: lead used 5k, frontend 2.5k, backend 2.5k.
        // Lead Agency "consumes" services from Backend and Frontend
        await tools['record_contribution']({
            id: randomUUID(),
            from_agency: frontendAgency,
            to_agency: leadAgency,
            resource_type: 'revenue',
            quantity: 2500,
            value: 2500, // Frontend gets 25% of 10k
            status: 'pending',
            company: companyId
        });

        await tools['record_contribution']({
            id: randomUUID(),
            from_agency: backendAgency,
            to_agency: leadAgency,
            resource_type: 'revenue',
            quantity: 2500,
            value: 2500, // Backend gets 25% of 10k
            status: 'pending',
            company: companyId
        });

        // Check Frontend's balance (Should be +2500, minus any revenue splits configured in policy.
        // Note: the `recordTransaction` uses `readStrategy()` from Brain to get split, defaulting to 100% if not set.)
        const feBalanceResp = await tools['get_agency_balance']({ agency_name: frontendAgency, company: companyId });
        expect(feBalanceResp.isError).toBeFalsy();
        const feBalances = JSON.parse(feBalanceResp.content[0].text);

        // Net Value for FE should be positive (they provided value)
        const feNetValue = feBalances.reduce((sum: number, b: any) => sum + b.value, 0);
        expect(feNetValue).toBeGreaterThan(0);

        // Check Lead Agency's balance (They owe money)
        const leadBalanceResp = await tools['get_agency_balance']({ agency_name: leadAgency, company: companyId });
        const leadBalances = JSON.parse(leadBalanceResp.content[0].text);
        const leadNetValue = leadBalances.reduce((sum: number, b: any) => sum + b.value, 0);
        expect(leadNetValue).toBeLessThan(0);

        // Print final status for validation report
        console.log('--- Phase 31 Validation End-to-End Simulation ---');
        console.log('Frontend Task Result:', frontendResp.result);
        console.log('Backend Task Result:', backendResp.result);
        console.log('Lead Agency Balances:', leadBalances);
        console.log('Frontend Agency Balances:', feBalances);
        console.log('---------------------------------------------------');
    });
});
