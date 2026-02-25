import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtemp, rm, mkdir } from "fs/promises";
import { tmpdir } from "os";

// --- Hoisted Variables for LLM Mocking ---
const { mockLLMQueue, mockGenerate, mockEmbed } = vi.hoisted(() => {
    const queue: any[] = [];
    const generate = vi.fn().mockImplementation(async (system: string, history: any[]) => {
        const next = queue.shift();
        if (!next) {
            return {
                thought: "No mock response queued.",
                tool: "none",
                args: {},
                message: "End of script."
            };
        }
        if (typeof next === 'function') {
            return await next(system, history);
        }
        return next;
    });
    const embed = vi.fn().mockResolvedValue(new Array(1536).fill(0.1));

    return {
        mockLLMQueue: queue,
        mockGenerate: generate,
        mockEmbed: embed
    };
});

// --- Mock LLM ---
vi.mock("../../src/llm.js", () => {
    return {
        createLLM: () => ({
            embed: mockEmbed,
            generate: mockGenerate,
        }),
        LLM: class {
            embed = mockEmbed;
            generate = mockGenerate;
        },
    };
});

// --- Mock External APIs ---
const mockXeroCreateContacts = vi.fn();
const mockXeroGetInvoices = vi.fn();
const mockXeroCreateInvoices = vi.fn();
const mockHubSpotCreateCompany = vi.fn();
const mockHubSpotCreateContact = vi.fn();
const mockHubSpotUpdateDeal = vi.fn();
const mockLinearFetch = vi.fn(); // Assuming Linear uses global fetch

vi.mock("xero-node", () => {
    return {
        XeroClient: class {
            accountingApi = {
                createContacts: mockXeroCreateContacts,
                getInvoices: mockXeroGetInvoices,
                createInvoices: mockXeroCreateInvoices,
                getContacts: vi.fn().mockResolvedValue({ body: { contacts: [] } }),
                getReportBalanceSheet: vi.fn(),
                getReportProfitAndLoss: vi.fn()
            };
            readTokenSet = () => ({ expired: () => false, access_token: "mock_token" });
            updateTenants = async () => [{ tenantId: "mock_tenant_id" }];
        }
    };
});

vi.mock("@hubspot/api-client", () => {
    return {
        Client: class {
            crm = {
                companies: {
                    basicApi: {
                        create: mockHubSpotCreateCompany,
                        doSearch: vi.fn()
                    },
                    searchApi: {
                        doSearch: vi.fn().mockResolvedValue({ results: [] })
                    }
                },
                contacts: {
                    basicApi: {
                        create: mockHubSpotCreateContact,
                        update: vi.fn()
                    },
                    searchApi: {
                        doSearch: vi.fn().mockResolvedValue({ results: [] })
                    }
                },
                deals: {
                    basicApi: {
                        create: vi.fn(),
                        update: mockHubSpotUpdateDeal
                    }
                },
                owners: {
                    ownersApi: {
                        getPage: vi.fn().mockResolvedValue({ results: [] })
                    }
                }
            }
        }
    };
});

// Mock global fetch for Linear
global.fetch = mockLinearFetch as any;


// --- Imports for Real Logic ---
import { SOPEngine } from "../../src/sop/engine.js";
import { MockMcpServer, mockToolHandlers, resetMocks } from "./test_helpers/mock_mcp_server.js";
import { registerXeroTools } from "../../src/mcp_servers/business_ops/xero_tools.js";
import { registerProjectManagementTools } from "../../src/mcp_servers/business_ops/project_management.js";
import { registerTools as registerCrmTools } from "../../src/mcp_servers/crm/tools.js";

// --- MockSopClient Implementation ---
class MockSopClient {
    async executeTool(toolName: string, args: any) {
        const handler = mockToolHandlers.get(toolName);
        if (!handler) {
            throw new Error(`Tool '${toolName}' not found in registry.`);
        }
        return await handler(args);
    }

    getToolNames(): string[] {
        return Array.from(mockToolHandlers.keys());
    }

    async init() {}
    async close() {}
}


describe("Business Workflows Integration Test", () => {
    let testRoot: string;
    let sopEngine: SOPEngine;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockLLMQueue.length = 0;
        resetMocks();

        // 1. Register Tools to Mock Server Registry
        const mockServer = new MockMcpServer({ name: "test_server" });
        registerXeroTools(mockServer as any);
        registerProjectManagementTools(mockServer as any);
        registerCrmTools(mockServer as any);

        // 2. Setup Env Vars
        process.env.XERO_CLIENT_ID = "mock_client_id";
        process.env.XERO_CLIENT_SECRET = "mock_client_secret";
        process.env.XERO_ACCESS_TOKEN = "mock_access_token";
        process.env.HUBSPOT_ACCESS_TOKEN = "mock_hubspot_token";
        process.env.LINEAR_API_KEY = "mock_linear_key";

        // 3. Setup Filesystem
        testRoot = await mkdtemp(join(tmpdir(), "business-workflow-test-"));

        // 4. Instantiate Engine
        const client = new MockSopClient();
        // Point to the real location of playbooks
        sopEngine = new SOPEngine(client as any, join(process.cwd(), "docs", "business_playbooks"));
    });

    afterEach(async () => {
        await rm(testRoot, { recursive: true, force: true });
    });

    it("should execute Client Onboarding workflow end-to-end", async () => {
        // Setup Mock Responses for APIs
        mockHubSpotCreateCompany.mockResolvedValue({ id: "company_123", properties: { name: "New Client Corp" } });
        mockHubSpotCreateContact.mockResolvedValue({ id: "contact_456", properties: { email: "alice@example.com" } });
        mockXeroCreateContacts.mockResolvedValue({ body: { contacts: [{ contactID: "xero_contact_789" }] } });
        mockXeroCreateInvoices.mockResolvedValue({ body: { invoices: [{ invoiceID: "invoice_999", invoiceNumber: "INV-001" }] } });

        mockLinearFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                data: {
                    issueCreate: { success: true, issue: { id: "issue_abc", title: "Onboard New Client Corp" } }
                }
            })
        });

        // Queue LLM Decisions for each step
        // 1. Create Company
        mockLLMQueue.push({
            thought: "Creating company in HubSpot.",
            tool: "create_company",
            args: { name: "New Client Corp", domain: "newclient.com" }
        });

        // 2. Create Contact in CRM
        mockLLMQueue.push({
            thought: "Creating contact in HubSpot.",
            tool: "create_contact",
            args: { email: "alice@newclient.com", firstname: "Alice", company: "New Client Corp" }
        });

        // 3. Create Contact in Xero
        mockLLMQueue.push({
            thought: "Creating contact in Xero.",
            tool: "xero_create_contact",
            args: { name: "New Client Corp", email: "billing@newclient.com" }
        });

        // 4. Create Invoice
        mockLLMQueue.push({
            thought: "Creating invoice in Xero.",
            tool: "xero_create_invoice",
            args: {
                contactId: "xero_contact_789",
                lineItems: [{ description: "Onboarding Fee", quantity: 1, unitAmount: 5000 }],
                status: "DRAFT"
            }
        });

        // 5. Create Onboarding Project (Linear)
        mockLLMQueue.push({
            thought: "Creating onboarding task in Linear.",
            tool: "linear_create_issue",
            args: { title: "Onboard New Client Corp", teamId: "TEAM_1", description: "Standard onboarding" }
        });

        // Execute
        const result = await sopEngine.executeSOP("client_onboarding");

        // Verify Success
        expect(result.success).toBe(true);
        expect(result.logs.every(l => l.status === "success")).toBe(true);

        // Verify API Calls
        expect(mockHubSpotCreateCompany).toHaveBeenCalledWith(expect.objectContaining({
            properties: expect.objectContaining({ name: "New Client Corp" })
        }));

        expect(mockHubSpotCreateContact).toHaveBeenCalled();
        expect(mockXeroCreateContacts).toHaveBeenCalled();

        expect(mockXeroCreateInvoices).toHaveBeenCalledWith(
            "mock_tenant_id",
            expect.objectContaining({
                invoices: expect.arrayContaining([
                    expect.objectContaining({
                        contact: { contactID: "xero_contact_789" },
                        lineItems: expect.arrayContaining([
                            expect.objectContaining({ description: "Onboarding Fee" })
                        ])
                    })
                ])
            })
        );

        expect(mockLinearFetch).toHaveBeenCalled();
    });

    it("should execute Monthly Billing workflow end-to-end", async () => {
        // Setup Mock Responses
        mockXeroGetInvoices.mockResolvedValue({ body: { invoices: [] } }); // No recent invoices
        mockXeroCreateInvoices.mockResolvedValue({ body: { invoices: [{ invoiceID: "inv_monthly", invoiceNumber: "INV-M01" }] } });
        mockHubSpotUpdateDeal.mockResolvedValue({ id: "deal_123", properties: { dealstage: "invoiced" } });

        // Queue LLM Decisions
        // 1. Review Recent Invoices
        mockLLMQueue.push({
            thought: "Checking recent invoices.",
            tool: "xero_get_invoices",
            args: { page: 1, statuses: ["AUTHORISED"] }
        });

        // 2. Generate Monthly Invoice
        mockLLMQueue.push({
            thought: "Generating monthly invoice.",
            tool: "xero_create_invoice",
            args: {
                contactId: "xero_contact_existing",
                lineItems: [{ description: "Monthly Retainer", quantity: 1, unitAmount: 2000 }],
                status: "DRAFT"
            }
        });

        // 3. Update CRM Deal
        mockLLMQueue.push({
            thought: "Updating deal in HubSpot.",
            tool: "update_deal",
            args: { id: "deal_123", properties: JSON.stringify({ dealstage: "invoiced" }) }
        });

        // Execute
        const result = await sopEngine.executeSOP("monthly_billing");

        // Verify Success
        expect(result.success).toBe(true);

        // Verify Calls
        expect(mockXeroGetInvoices).toHaveBeenCalled();
        expect(mockXeroCreateInvoices).toHaveBeenCalled();
        expect(mockHubSpotUpdateDeal).toHaveBeenCalledWith(
            "deal_123",
            expect.objectContaining({
                properties: { dealstage: "invoiced" }
            })
        );
    });
});
