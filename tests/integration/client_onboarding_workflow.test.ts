import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";

// 1. Hoist Mocks
const {
    mockExec,
    mockCreateCompany,
    mockCreateContact,
    mockXeroCreateContacts,
    mockXeroCreateInvoices,
    mockXeroUpdateTenants,
    mockFetchLinear,
    mockReadFile
} = vi.hoisted(() => {
    return {
        mockExec: vi.fn(),
        mockCreateCompany: vi.fn().mockResolvedValue({ id: "hs_company_123" }),
        mockCreateContact: vi.fn().mockResolvedValue({ id: "hs_contact_456" }),
        mockXeroCreateContacts: vi.fn().mockResolvedValue({ body: { contacts: [{ contactID: "xero_contact_789" }] } }),
        mockXeroCreateInvoices: vi.fn().mockResolvedValue({ body: { invoices: [{ invoiceNumber: "INV-001" }] } }),
        mockXeroUpdateTenants: vi.fn().mockResolvedValue([{ tenantId: "xero_tenant_id" }]),
        mockFetchLinear: vi.fn().mockResolvedValue({
            issueCreate: {
                success: true,
                issue: { id: "linear_issue_123", url: "https://linear.app/issue/123" }
            }
        }),
        mockReadFile: vi.fn().mockResolvedValue(JSON.stringify({
            serviceType: "web_dev",
            projectTemplate: {
                title: "Web Dev Template",
                phases: [{ name: "Discovery", tasks: ["Requirement Gathering"] }]
            },
            financial: { depositPercentage: 20 }
        }))
    };
});

// 2. Mock child_process
vi.mock("child_process", () => ({
    exec: (cmd: string, cb: any) => {
        mockExec(cmd);
        cb(null, "stdout", "");
    }
}));

// 3. Mock HubSpot
vi.mock("@hubspot/api-client", () => ({
    Client: class {
        crm = {
            companies: {
                basicApi: { create: mockCreateCompany, update: vi.fn() },
                searchApi: { doSearch: vi.fn().mockResolvedValue({ results: [] }) }
            },
            contacts: {
                basicApi: { create: mockCreateContact, update: vi.fn() },
                searchApi: { doSearch: vi.fn().mockResolvedValue({ results: [] }) }
            },
            deals: {
                basicApi: { create: vi.fn(), update: vi.fn() },
                searchApi: { doSearch: vi.fn().mockResolvedValue({ results: [] }) }
            }
        }
    }
}));

// 4. Mock Xero Tools
vi.mock("../../src/mcp_servers/business_ops/xero_tools.js", () => ({
    getXeroClient: vi.fn().mockResolvedValue({
        accountingApi: {
            createContacts: mockXeroCreateContacts,
            createInvoices: mockXeroCreateInvoices
        },
        updateTenants: mockXeroUpdateTenants
    }),
    getTenantId: vi.fn().mockResolvedValue("xero_tenant_id")
}));

// 5. Mock Linear (fetchLinear)
vi.mock("../../src/mcp_servers/business_ops/project_management.js", () => ({
    fetchLinear: mockFetchLinear
}));

// 6. Mock FS
vi.mock("fs/promises", async () => {
    const actual = await vi.importActual("fs/promises");
    return {
        ...actual,
        writeFile: vi.fn().mockResolvedValue(undefined),
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: mockReadFile
    };
});

// Imports
import { registerWorkflowTools } from "../../src/mcp_servers/business_ops/workflow.js";

describe("Client Onboarding Workflow", () => {
    let testDir: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        process.env.HUBSPOT_ACCESS_TOKEN = "mock_hs_token";
        process.env.LINEAR_TEAM_ID = "mock_linear_team";

        testDir = await mkdtemp(join(tmpdir(), "onboarding-test-"));
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    it("should execute the workflow successfully", async () => {
        // Mock Server Registry
        let registeredHandler: any;
        const mockServer = {
            tool: (name: string, desc: string, schema: any, handler: any) => {
                if (name === "client_onboarding_workflow") {
                    registeredHandler = handler;
                }
            }
        };

        registerWorkflowTools(mockServer as any);

        expect(registeredHandler).toBeDefined();

        // Execute the handler
        const result = await registeredHandler({
            clientName: "Test Corp",
            contactEmail: "test@testcorp.com",
            contactName: "Test User",
            serviceType: "web_dev",
            domain: "testcorp.com",
            projectValue: 5000
        });

        // Verify Result
        if (result.isError) {
             console.error("Workflow failed:", result.content[0].text);
        }
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain("success");

        // Verify External Calls

        // 1. CLI Exec
        expect(mockExec).toHaveBeenCalledWith(expect.stringContaining("onboard-company test-corp"));

        // 2. HubSpot
        expect(mockCreateCompany).toHaveBeenCalledWith(expect.objectContaining({
            properties: expect.objectContaining({ name: "Test Corp", domain: "testcorp.com" })
        }));
        expect(mockCreateContact).toHaveBeenCalledWith(expect.objectContaining({
            properties: expect.objectContaining({ email: "test@testcorp.com" })
        }));

        // 3. Linear
        expect(mockFetchLinear).toHaveBeenCalledWith(
            expect.stringContaining("IssueCreate"),
            expect.objectContaining({
                input: expect.objectContaining({
                    title: "Onboard Client: Test Corp",
                    description: expect.stringContaining("Requirement Gathering") // From Template
                })
            })
        );

        // 4. Xero
        expect(mockXeroCreateContacts).toHaveBeenCalled();
        expect(mockXeroCreateInvoices).toHaveBeenCalledWith(
            "xero_tenant_id",
            expect.objectContaining({
                invoices: expect.arrayContaining([
                    expect.objectContaining({
                        lineItems: expect.arrayContaining([
                            expect.objectContaining({
                                unitAmount: 1000, // 20% of 5000
                                description: "20% Deposit for web_dev services"
                            })
                        ])
                    })
                ])
            })
        );
    });
});
