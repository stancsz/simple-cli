import { describe, it, expect, vi, beforeEach } from 'vitest';
// We don't need real McpServer if we mock the registration target
// import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const mocks = vi.hoisted(() => {
    return {
        linearClient: {
            projects: vi.fn(),
            updateProject: vi.fn()
        },
        hubSpotClient: {
            crm: {
                deals: {
                    basicApi: {
                        update: vi.fn()
                    }
                },
                companies: {
                     searchApi: {
                         doSearch: vi.fn()
                     },
                     basicApi: {
                         update: vi.fn(),
                         create: vi.fn()
                     }
                }
            }
        },
        xeroClient: {
            accountingApi: {
                getContacts: vi.fn(),
                updateContact: vi.fn()
            },
            readTokenSet: vi.fn(() => ({ expired: () => false })),
            updateTenants: vi.fn().mockResolvedValue([{ tenantId: 'tenant_123' }]),
            setTokenSet: vi.fn(), // Add this
            refreshToken: vi.fn()
        },
        simpleGit: {
            checkIsRepo: vi.fn().mockResolvedValue(true),
            add: vi.fn(),
            commit: vi.fn(),
            addTag: vi.fn()
        },
        episodicMemory: {
            init: vi.fn(),
            store: vi.fn()
        },
        fs: {
            mkdir: vi.fn(),
            writeFile: vi.fn()
        }
    };
});

// Vi.mock calls
vi.mock('@linear/sdk', () => ({
    LinearClient: vi.fn(() => mocks.linearClient)
}));

vi.mock('@hubspot/api-client', () => ({
    Client: vi.fn(() => mocks.hubSpotClient)
}));

vi.mock('xero-node', () => ({
    XeroClient: vi.fn(() => mocks.xeroClient)
}));

vi.mock('simple-git', () => ({
    default: vi.fn(() => mocks.simpleGit)
}));

vi.mock('../../src/brain/episodic.js', () => ({
    EpisodicMemory: vi.fn(() => mocks.episodicMemory)
}));

vi.mock('fs', () => ({
    promises: mocks.fs,
    existsSync: vi.fn(() => false)
}));

import { registerClientOffboardingTools } from '../../src/mcp_servers/business_ops/tools/client_offboarding.js';

describe('Client Offboarding Workflow', () => {
    let mockServer: any;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.HUBSPOT_ACCESS_TOKEN = "mock_hubspot_token";
        process.env.LINEAR_API_KEY = "mock_linear_key";
        process.env.XERO_ACCESS_TOKEN = "mock_xero_token";
        process.env.XERO_TENANT_ID = "mock_tenant_id";

        mockServer = {
            tool: vi.fn()
        };
        registerClientOffboardingTools(mockServer);
    });

    it('should execute full offboarding workflow successfully', async () => {
        // Setup Mocks
        mocks.linearClient.projects.mockResolvedValue({
            nodes: [{ id: 'proj_123', name: 'Test Project' }]
        });

        mocks.xeroClient.accountingApi.getContacts.mockResolvedValue({
            body: { contacts: [{ contactID: 'cont_123', name: 'Test Client' }] }
        });

        // Get the tool implementation
        const calls = mockServer.tool.mock.calls;
        const toolCall = calls.find((c: any[]) => c[0] === "execute_client_offboarding");
        expect(toolCall).toBeDefined();

        const toolImpl = toolCall[3];

        const result = await toolImpl({
            company_id: 'Test Client',
            deal_id: 'deal_123',
            confirm_financial_closure: true
        });

        const content = JSON.parse(result.content[0].text);
        if (content.status === 'error') {
            console.error("Tool execution failed:", content);
        }

        // Log logs if Xero failed
        if (content.logs) {
             const xeroLog = content.logs.find((l: string) => l.includes("Xero"));
             if (xeroLog && xeroLog.includes("failed")) {
                 console.error("Xero Log:", xeroLog);
             }
        }

        expect(content.status).toBe('success');

        // Verify Linear
        expect(mocks.linearClient.projects).toHaveBeenCalled();
        // expect(mocks.linearClient.updateProject).toHaveBeenCalledWith('proj_123', { state: 'completed' });

        // Verify HubSpot
        expect(mocks.hubSpotClient.crm.deals.basicApi.update).toHaveBeenCalledWith('deal_123', expect.objectContaining({
            properties: expect.objectContaining({ dealstage: 'closedwon' })
        }));

        // Verify Xero
        expect(mocks.xeroClient.accountingApi.getContacts).toHaveBeenCalled();
        expect(mocks.xeroClient.accountingApi.updateContact).toHaveBeenCalledWith(expect.anything(), 'cont_123', { contactStatus: 'ARCHIVED' });

        // Verify Brain
        expect(mocks.episodicMemory.store).toHaveBeenCalledWith(
            'offboarding_event',
            expect.stringContaining('Test Client'),
            expect.anything(),
            [], undefined, undefined, false, undefined, undefined, 0, 0,
            'company_archival'
        );

        // Verify Git
        expect(mocks.simpleGit.addTag).toHaveBeenCalledWith(expect.stringContaining('offboard-test-client'));
        expect(mocks.fs.writeFile).toHaveBeenCalled();
    });
});
