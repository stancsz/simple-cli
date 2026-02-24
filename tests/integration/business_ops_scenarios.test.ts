
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { registerProjectManagementTools } from '../../src/mcp_servers/business_ops/project_management.js';
import { registerXeroTools } from '../../src/mcp_servers/business_ops/xero_tools.js';
import { registerTools as registerCrmTools } from '../../src/mcp_servers/crm/tools.js';

// --- Mocks ---

// Mock Linear (via fetch)
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock Xero
const mockXeroAccounting = {
    getInvoices: vi.fn(),
    createInvoices: vi.fn(),
    getContacts: vi.fn(),
    getReportBalanceSheet: vi.fn(),
    getReportProfitAndLoss: vi.fn()
};
const mockXeroUpdateTenants = vi.fn();

vi.mock('xero-node', () => {
    return {
        XeroClient: vi.fn().mockImplementation(() => ({
            readTokenSet: vi.fn().mockReturnValue({ expired: () => false, access_token: 'mock_xero_token' }),
            setTokenSet: vi.fn(),
            refreshToken: vi.fn(),
            accountingApi: mockXeroAccounting,
            updateTenants: mockXeroUpdateTenants
        }))
    };
});

// Mock HubSpot
const mockHubSpotCrm = {
    contacts: {
        basicApi: { create: vi.fn(), update: vi.fn() },
        searchApi: { doSearch: vi.fn() }
    },
    deals: { basicApi: { create: vi.fn(), update: vi.fn() } },
    companies: { searchApi: { doSearch: vi.fn() } },
    owners: { ownersApi: { getPage: vi.fn() } }
};

vi.mock('@hubspot/api-client', () => {
    return {
        Client: vi.fn().mockImplementation(() => ({
            crm: mockHubSpotCrm
        }))
    };
});

// --- Test Infrastructure ---

class MockMcpServer {
    tools: Record<string, any> = {};

    tool(name: string, description: string, argsSchema: any, handler: any) {
        this.tools[name] = {
            description,
            argsSchema: z.object(argsSchema),
            handler
        };
    }

    async call(name: string, args: any) {
        const tool = this.tools[name];
        if (!tool) throw new Error(`Tool ${name} not found`);
        const parsedArgs = tool.argsSchema.parse(args);
        return tool.handler(parsedArgs);
    }
}

describe('Business Ops - Production Scenarios', () => {
    let server: MockMcpServer;
    const originalEnv = process.env;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env = { ...originalEnv };

        // Set Environment Variables for Mocks
        process.env.LINEAR_API_KEY = 'mock_linear_key';
        process.env.XERO_CLIENT_ID = 'mock_xero_client';
        process.env.XERO_CLIENT_SECRET = 'mock_xero_secret';
        process.env.XERO_ACCESS_TOKEN = 'mock_xero_token';
        process.env.XERO_REFRESH_TOKEN = 'mock_xero_refresh';
        process.env.XERO_TENANT_ID = 'mock_xero_tenant';
        process.env.HUBSPOT_ACCESS_TOKEN = 'mock_hubspot_token';

        server = new MockMcpServer();
        registerProjectManagementTools(server as any);
        registerXeroTools(server as any);
        registerCrmTools(server as any);
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    // ==========================================
    // Scenario 1: Startup MVP (The "Lean Launch")
    // Workflow: Invoice (Xero) -> Lead (HubSpot) -> Task (Linear)
    // ==========================================
    it('Scenario 1: Startup MVP', async () => {
        console.log('Running Scenario 1: Startup MVP');

        // Step 1: Create Invoice (Xero)
        mockXeroAccounting.createInvoices.mockResolvedValue({
            body: { invoices: [{ InvoiceID: 'inv-123', InvoiceNumber: 'INV-001', Status: 'DRAFT' }] }
        });

        const invoiceRes = await server.call('xero_create_invoice', {
            contactId: 'contact-001',
            lineItems: [{ description: 'Consulting', quantity: 1, unitAmount: 1000 }],
            status: 'DRAFT'
        });
        const invoice = JSON.parse(invoiceRes.content[0].text);
        expect(invoice.InvoiceID).toBe('inv-123');
        expect(mockXeroAccounting.createInvoices).toHaveBeenCalled();


        // Step 2: Create Lead (HubSpot)
        mockHubSpotCrm.contacts.basicApi.create.mockResolvedValue({
            id: 'hub-contact-1',
            properties: { email: 'client@startup.com', firstname: 'Client', lastname: 'One' }
        });

        const contactRes = await server.call('create_contact', {
            email: 'client@startup.com',
            firstname: 'Client',
            lastname: 'One',
            company: 'Startup Inc'
        });
        const contact = JSON.parse(contactRes.content[0].text);
        expect(contact.id).toBe('hub-contact-1');
        expect(mockHubSpotCrm.contacts.basicApi.create).toHaveBeenCalledWith(expect.objectContaining({
            properties: expect.objectContaining({ email: 'client@startup.com' })
        }));


        // Step 3: Create Task (Linear) linked to Invoice
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                data: {
                    issueCreate: { success: true, issue: { id: 'lin-issue-1', title: 'Onboard Client One' } }
                }
            })
        });

        const taskRes = await server.call('linear_create_issue', {
            title: 'Onboard Client One',
            teamId: 'team-linear',
            description: `Invoice ID: ${invoice.InvoiceID} generated for contact ${contact.id}`
        });
        const task = JSON.parse(taskRes.content[0].text);
        expect(task.id).toBe('lin-issue-1');

        // Verify description contained the link
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('linear.app'),
            expect.objectContaining({
                body: expect.stringContaining(invoice.InvoiceID)
            })
        );
    });

    // ==========================================
    // Scenario 2: Enterprise Migration (The "Big Shift")
    // Workflow: Batch Invoices (Xero) -> Search/Update Contact (HubSpot) -> Update Tasks (Linear)
    // ==========================================
    it('Scenario 2: Enterprise Migration', async () => {
        console.log('Running Scenario 2: Enterprise Migration');

        // Step 1: Batch Invoices (Xero) - simulate loop
        mockXeroAccounting.createInvoices.mockResolvedValue({
            body: { invoices: [{ InvoiceID: 'inv-migrated', InvoiceNumber: 'INV-MIG' }] }
        });

        const invoiceInputs = [
            { desc: 'Legacy Inv 1', amt: 500 },
            { desc: 'Legacy Inv 2', amt: 750 }
        ];

        for (const input of invoiceInputs) {
             await server.call('xero_create_invoice', {
                 contactId: 'legacy-contact',
                 lineItems: [{ description: input.desc, quantity: 1, unitAmount: input.amt }],
                 status: 'AUTHORISED'
             });
        }
        expect(mockXeroAccounting.createInvoices).toHaveBeenCalledTimes(2);


        // Step 2: Search and Update Contact (HubSpot)
        mockHubSpotCrm.contacts.searchApi.doSearch.mockResolvedValue({
            results: [{ id: 'hub-legacy-1', properties: { email: 'legacy@corp.com' } }]
        });
        mockHubSpotCrm.contacts.basicApi.update.mockResolvedValue({
            id: 'hub-legacy-1',
            properties: { migration_status: 'complete' }
        });

        // Search
        const searchRes = await server.call('search_contacts', { query: 'legacy@corp.com' });
        const searchResults = JSON.parse(searchRes.content[0].text);
        expect(searchResults[0].id).toBe('hub-legacy-1');

        // Update
        const updateRes = await server.call('update_contact', {
            id: searchResults[0].id,
            properties: JSON.stringify({ migration_status: 'complete' })
        });
        expect(JSON.parse(updateRes.content[0].text).id).toBe('hub-legacy-1');


        // Step 3: Update Task (Linear)
        mockFetch.mockResolvedValueOnce({ // for list
            ok: true,
            json: async () => ({
                data: { issues: { nodes: [{ id: 'lin-legacy-1', title: 'Migrate Data' }] } }
            })
        }).mockResolvedValueOnce({ // for update
             ok: true,
            json: async () => ({
                data: { issueUpdate: { success: true, issue: { id: 'lin-legacy-1', state: { name: 'Done' } } } }
            })
        });

        // List
        const issuesRes = await server.call('linear_list_issues', { teamId: 'team-migration' });
        const issues = JSON.parse(issuesRes.content[0].text);
        expect(issues[0].id).toBe('lin-legacy-1');

        // Update
        const updateTaskRes = await server.call('linear_update_issue', {
            id: issues[0].id,
            stateId: 'state-done'
        });
        expect(JSON.parse(updateTaskRes.content[0].text).state.name).toBe('Done');
    });

    // ==========================================
    // Scenario 3: Agency Consulting (The "Client Retainer")
    // Workflow: P&L (Xero) -> Deal (HubSpot) -> Sprint (Linear)
    // ==========================================
    it('Scenario 3: Agency Consulting', async () => {
        console.log('Running Scenario 3: Agency Consulting');

        // Step 1: Financial Health Check (Xero P&L)
        mockXeroAccounting.getReportProfitAndLoss.mockResolvedValue({
            body: { Reports: [{ ReportID: 'rpt-pnl', ReportName: 'Profit and Loss' }] }
        });

        const pnlRes = await server.call('get_profit_and_loss', {
            fromDate: '2024-01-01',
            toDate: '2024-01-31'
        });
        const pnl = JSON.parse(pnlRes.content[0].text);
        expect(pnl.Reports[0].ReportName).toBe('Profit and Loss');


        // Step 2: Deal Pipeline (HubSpot)
        mockHubSpotCrm.deals.basicApi.create.mockResolvedValue({
            id: 'deal-retainer-1',
            properties: { dealname: 'Q1 Retainer', amount: '5000' }
        });

        const dealRes = await server.call('create_deal', {
            dealname: 'Q1 Retainer',
            amount: '5000',
            pipeline: 'agency-sales'
        });
        expect(JSON.parse(dealRes.content[0].text).id).toBe('deal-retainer-1');


        // Step 3: Sprint Planning (Linear)
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                data: { issues: { nodes: [
                    { id: 'task-1', title: 'Design Homepage' },
                    { id: 'task-2', title: 'Setup Analytics' }
                ] } }
            })
        });

        const sprintRes = await server.call('linear_list_issues', { teamId: 'team-agency' });
        const sprintTasks = JSON.parse(sprintRes.content[0].text);
        expect(sprintTasks).toHaveLength(2);
        expect(sprintTasks[0].title).toBe('Design Homepage');
    });

    // ==========================================
    // Scenario 4: Failure Handling (Rate Limiting / Auth)
    // Workflow: API Failure -> Error Response
    // ==========================================
    it('Scenario 4: Handles API Failures Gracefully', async () => {
        console.log('Running Scenario 4: Failure Handling');

        // Simulate Xero Auth Failure
        mockXeroAccounting.createInvoices.mockRejectedValue(new Error('Authentication failed'));

        const result = await server.call('xero_create_invoice', {
            contactId: 'contact-fail',
            lineItems: [{ description: 'Fail', quantity: 1, unitAmount: 100 }]
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Error creating invoice: Authentication failed');
    });
});
