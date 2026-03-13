import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EpisodicMemory } from '../../src/brain/episodic.js';
import { registerAgency, discoverAgencies, delegateTask } from '../../src/mcp_servers/federation/tools.js';
import { AgencyProfile, TaskDelegationRequest } from '../../src/mcp_servers/federation/protocol.js';
import { registerLedgerTools } from '../../src/mcp_servers/distributed_ledger/tools.js';
import { randomUUID } from 'crypto';
import http from 'http';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

// Simulating the logic of the spawn_new_agency tool
async function executeAgencySpawningWorkflow(
    parentMemory: EpisodicMemory,
    name: string,
    targetNiche: string,
    options: { yoloMode: boolean, resourceLimit: number }
) {
    let policy = { parameters: { token_budget: 1000, autonomous_decision_authority: { auto_approve_threshold: 50 } } };

    if (options.resourceLimit < 10 || options.resourceLimit > policy.parameters.token_budget) {
        throw new Error('Insufficient resources or policy constraint violation to spawn child agency');
    }

    const childContext = {
        niche: targetNiche,
        mission: `Dominate the ${targetNiche} market`,
        allocatedBudget: options.resourceLimit
    };

    const childDir = path.join(process.cwd(), `.agent_test_stress_spawn_${name}`);
    const brainDir = path.join(childDir, 'brain');

    if (fs.existsSync(childDir)) {
        throw new Error(`Child agency ID already exists: agency_${name}`);
    }

    await fsPromises.mkdir(childDir, { recursive: true });
    await fsPromises.mkdir(brainDir, { recursive: true });

    const contextPath = path.join(childDir, 'context.json');
    await fsPromises.writeFile(contextPath, JSON.stringify(childContext, null, 2));

    const childMemory = new EpisodicMemory(brainDir);
    await childMemory.init();
    await childMemory.store(
        `init_${name}`,
        'CorporateStrategy',
        JSON.stringify(childContext)
    );

    const childProfile: AgencyProfile = {
        agency_id: `agency_${name}`,
        endpoint: `http://127.0.0.1:0`, // Dynamically replaced
        capabilities: [
            { name: targetNiche, description: `Specialized in ${targetNiche}`, version: '1.0.0' }
        ],
        status: 'active',
        supported_protocols: ['mcp/1.0']
    };

    try {
        await registerAgency(childProfile);
    } catch (error: any) {
        throw new Error(`Network failure during spawn protocol synchronization: ${error.message}`);
    }

    await parentMemory.store(
        `spawn_${name}`,
        'autonomous_decision',
        JSON.stringify({ action: 'spawn_agency', child_id: `agency_${name}`, context: childContext })
    );

    return {
        agency_id: `agency_${name}`,
        directory: childDir,
        brain: brainDir,
        status: 'active',
        profile: childProfile
    };
}

describe('Phase 32 & 31 Validation: Agency Ecosystem Stress Test', () => {
    let mockServer: http.Server;
    let mockServerPort = 0;

    let parentMemory: EpisodicMemory;
    let server: McpServer;
    const tools: Record<string, any> = {};

    const parentAgentDir = path.join(process.cwd(), '.agent_test_stress_root');
    const parentBrainDir = path.join(parentAgentDir, 'brain');

    const spawnedDirs: string[] = [];

    beforeAll(async () => {
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
                    if (parsedBody.agency_id === 'agency_startup_a') {
                        resultMsg = 'StartupA Component Delivered';
                    } else if (parsedBody.agency_id === 'agency_enterprise_b') {
                        resultMsg = 'EnterpriseB Component Delivered';
                    } else if (parsedBody.agency_id === 'agency_agency_c') {
                        resultMsg = 'AgencyC Component Delivered';
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

        server = new McpServer({ name: 'test_stress', version: '1.0' });

        vi.spyOn(server, 'tool').mockImplementation((name, desc, schema, func) => {
            if (typeof schema === 'function') {
                tools[name] = schema;
            } else {
                tools[name] = func;
            }
            return server as any;
        });

        registerLedgerTools(server, parentMemory);
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

    it('should autonomously spawn 3 distinct child agencies', async () => {
        const agencies = [
            { name: 'startup_a', niche: 'rapid_prototyping', budget: 100 },
            { name: 'enterprise_b', niche: 'compliance_audit', budget: 200 },
            { name: 'agency_c', niche: 'creative_design', budget: 150 }
        ];

        for (const agency of agencies) {
            const result = await executeAgencySpawningWorkflow(parentMemory, agency.name, agency.niche, { yoloMode: true, resourceLimit: agency.budget });
            expect(result.status).toBe('active');
            expect(result.agency_id).toBe(`agency_${agency.name}`);

            spawnedDirs.push(result.directory);
            expect(fs.existsSync(result.directory)).toBe(true);
            expect(fs.existsSync(result.brain)).toBe(true);

            // Register with correct mock port for later task delegation
            const mockProfile: AgencyProfile = {
                agency_id: `agency_${agency.name}`,
                endpoint: `http://127.0.0.1:${mockServerPort}`,
                capabilities: [
                    { name: agency.niche, description: `Specialized in ${agency.niche}`, version: '1.0.0' }
                ],
                status: 'active',
                supported_protocols: ['mcp/1.0']
            };
            await registerAgency(mockProfile);
        }

        // Wait for lancedb writes
        await new Promise(r => setTimeout(r, 2000));

        // Verify parent memory logged the spawns
        const spawnLogs = await parentMemory.recall('spawn_agency');
        const spawnLogTexts = spawnLogs.map(r => r.solution || r.agentResponse).join(' ');

        expect(spawnLogTexts).toContain('agency_startup_a');
        expect(spawnLogTexts).toContain('agency_enterprise_b');
        expect(spawnLogTexts).toContain('agency_agency_c');
    });

    it('should coordinate a federated project and handle task delegation failures gracefully', async () => {
        const rootProjectTask = 'Build a unified ecosystem product';

        // 1. Discover capabilities
        const discoveredPrototyping = await discoverAgencies('rapid_prototyping');
        expect(discoveredPrototyping.length).toBeGreaterThan(0);

        const discoveredCompliance = await discoverAgencies('compliance_audit');
        expect(discoveredCompliance.length).toBeGreaterThan(0);

        const discoveredDesign = await discoverAgencies('creative_design');
        expect(discoveredDesign.length).toBeGreaterThan(0);

        // 2. Delegate tasks
        const prototypeTaskReq: TaskDelegationRequest = {
            task_id: `task_proto_${randomUUID()}`,
            agency_id: 'agency_startup_a',
            task_description: 'Build the rapid prototype MVP'
        };
        const prototypeResp = await delegateTask(prototypeTaskReq, 'fake_key', discoveredPrototyping);
        expect(prototypeResp.status).toBe('completed');
        expect(prototypeResp.result).toContain('StartupA Component Delivered');

        const designTaskReq: TaskDelegationRequest = {
            task_id: `task_design_${randomUUID()}`,
            agency_id: 'agency_agency_c',
            task_description: 'Design the branding and UI'
        };
        const designResp = await delegateTask(designTaskReq, 'fake_key', discoveredDesign);
        expect(designResp.status).toBe('completed');
        expect(designResp.result).toContain('AgencyC Component Delivered');

        // 3. Inject Failure & Recovery for Enterprise B
        const complianceTaskReq: TaskDelegationRequest = {
            task_id: `task_comp_${randomUUID()}`,
            agency_id: 'agency_enterprise_b',
            task_description: 'Audit the MVP for compliance'
        };

        // Mock failure first
        const toolsModule = await import('../../src/mcp_servers/federation/tools.js');
        vi.spyOn(toolsModule, 'delegateTask').mockRejectedValueOnce(new Error('Target agency unreachable: Connection Timeout'));

        let failureCaught = false;
        try {
            await delegateTask(complianceTaskReq, 'fake_key', discoveredCompliance);
        } catch (e: any) {
            failureCaught = true;
            expect(e.message).toContain('Target agency unreachable');
        }
        expect(failureCaught).toBe(true);

        // Mock recovery (restore original functionality)
        vi.mocked(toolsModule.delegateTask).mockRestore();

        // Retry delegation
        const recoveredResp = await delegateTask(complianceTaskReq, 'fake_key', discoveredCompliance);
        expect(recoveredResp.status).toBe('completed');
        expect(recoveredResp.result).toContain('EnterpriseB Component Delivered');
    });

    it('should accurately reflect inter-agency contributions in the distributed ledger', async () => {
        const rootAgency = 'agency_root';
        const startupA = 'agency_startup_a';
        const enterpriseB = 'agency_enterprise_b';
        const agencyC = 'agency_agency_c';
        const companyId = 'ecosystem_project_' + randomUUID();

        // Let's assume root agency gets a total budget of 10,000 for the project.
        // It consumes services from the 3 child agencies.

        // 1. StartupA Contribution
        await tools['record_contribution']({
            id: randomUUID(),
            from_agency: startupA,
            to_agency: rootAgency,
            resource_type: 'revenue',
            quantity: 3000,
            value: 3000,
            status: 'pending',
            company: companyId
        });

        // 2. EnterpriseB Contribution
        await tools['record_contribution']({
            id: randomUUID(),
            from_agency: enterpriseB,
            to_agency: rootAgency,
            resource_type: 'revenue',
            quantity: 4000,
            value: 4000,
            status: 'pending',
            company: companyId
        });

        // 3. AgencyC Contribution
        await tools['record_contribution']({
            id: randomUUID(),
            from_agency: agencyC,
            to_agency: rootAgency,
            resource_type: 'revenue',
            quantity: 2000,
            value: 2000,
            status: 'pending',
            company: companyId
        });

        // Wait for LanceDB to process transactions
        await new Promise(r => setTimeout(r, 2000));

        // Assert balances
        const rootBalanceResp = await tools['get_agency_balance']({ agency_name: rootAgency, company: companyId });
        expect(rootBalanceResp.isError).toBeFalsy();
        const rootBalances = JSON.parse(rootBalanceResp.content[0].text);

        // Root agency is the consumer, so its net value should be negative
        const rootNetValue = rootBalances.reduce((sum: number, b: any) => sum + b.value, 0);
        expect(rootNetValue).toBe(-9000);

        const startupABalanceResp = await tools['get_agency_balance']({ agency_name: startupA, company: companyId });
        expect(startupABalanceResp.isError).toBeFalsy();
        const startupABalances = JSON.parse(startupABalanceResp.content[0].text);
        const startupANetValue = startupABalances.reduce((sum: number, b: any) => sum + b.value, 0);
        expect(startupANetValue).toBe(3000);

        const enterpriseBBalanceResp = await tools['get_agency_balance']({ agency_name: enterpriseB, company: companyId });
        expect(enterpriseBBalanceResp.isError).toBeFalsy();
        const enterpriseBBalances = JSON.parse(enterpriseBBalanceResp.content[0].text);
        const enterpriseBNetValue = enterpriseBBalances.reduce((sum: number, b: any) => sum + b.value, 0);
        expect(enterpriseBNetValue).toBe(4000);

        const agencyCBalanceResp = await tools['get_agency_balance']({ agency_name: agencyC, company: companyId });
        expect(agencyCBalanceResp.isError).toBeFalsy();
        const agencyCBalances = JSON.parse(agencyCBalanceResp.content[0].text);
        const agencyCNetValue = agencyCBalances.reduce((sum: number, b: any) => sum + b.value, 0);
        expect(agencyCNetValue).toBe(2000);

        // Final sanity check output for the run
        console.log('--- Ecosystem Stress Test Balances ---');
        console.log('Root Net Value:', rootNetValue);
        console.log('StartupA Net Value:', startupANetValue);
        console.log('EnterpriseB Net Value:', enterpriseBNetValue);
        console.log('AgencyC Net Value:', agencyCNetValue);
        console.log('---------------------------------------');
    });
});
