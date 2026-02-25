import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerWorkflowTools } from "../../src/mcp_servers/business_ops/workflow.js";
import { z } from "zod";

// --- Mocks ---

// Mock child_process
vi.mock("child_process", () => ({
    exec: (cmd: string, cb: any) => cb(null, "stdout", "stderr")
}));

// Mock fs/promises (Partial mock to allow reading templates but capture writes)
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
// We need real readFile for templates, so we don't mock the whole module or we implement a fake.
// But verifying strict FS interactions is secondary to API interactions.
// Let's just spy on them if possible, or Mock them and provide a fake implementation for readFile.
// Since we only read specific files, we can just mock readFile to return a default template.
vi.mock("fs/promises", () => ({
    readFile: vi.fn().mockResolvedValue(JSON.stringify({
        projectTemplate: {
            title: "Test Template",
            phases: [{ name: "Phase 1", tasks: ["Task A"] }]
        },
        financial: {
            depositPercentage: 20
        }
    })),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    // re-export other needed things if any? join is in path.
}));


// Mock Xero
const mockCreateContacts = vi.fn();
const mockCreateInvoices = vi.fn();

vi.mock("xero-node", () => {
    return {
        XeroClient: class {
            accountingApi = {
                createContacts: mockCreateContacts,
                createInvoices: mockCreateInvoices
            };
            readTokenSet = () => ({ expired: () => false, access_token: "mock_token" });
            updateTenants = async () => [{ tenantId: "mock_tenant_id" }];
        }
    };
});

// Mock HubSpot
const mockHubSpotSearch = vi.fn();
const mockHubSpotCreate = vi.fn();
const mockHubSpotUpdate = vi.fn();

vi.mock("@hubspot/api-client", () => {
    return {
        Client: class {
            crm = {
                companies: {
                    basicApi: { create: mockHubSpotCreate, update: mockHubSpotUpdate },
                    searchApi: { doSearch: mockHubSpotSearch }
                },
                contacts: {
                    basicApi: { create: mockHubSpotCreate, update: mockHubSpotUpdate },
                    searchApi: { doSearch: mockHubSpotSearch }
                },
                deals: {
                    basicApi: { create: mockHubSpotCreate, update: mockHubSpotUpdate },
                    searchApi: { doSearch: mockHubSpotSearch }
                }
            }
        }
    };
});

// Mock Linear SDK
const mockLinearCreateProject = vi.fn();
const mockLinearCreateIssue = vi.fn();
const mockLinearTeams = vi.fn();
const mockLinearProjects = vi.fn();
const mockLinearProject = vi.fn(); // Returns project query builder

vi.mock("@linear/sdk", () => {
    return {
        LinearClient: class {
            // teams()
            teams = mockLinearTeams;
            // projects()
            projects = mockLinearProjects;
            // createProject()
            createProject = mockLinearCreateProject;
            // createIssue()
            createIssue = mockLinearCreateIssue;
            // project()
            project = mockLinearProject;
        }
    };
});


describe("Agency Workflow Validation", () => {
    let server: McpServer;
    let clientOnboardingTool: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup MCP Server and register tools
        server = new McpServer({ name: "test_ops", version: "1.0.0" });

        // We need to capture the tool handler.
        // McpServer.tool() registers it. We can spy on server.tool or just inspect the internal registry if accessible.
        // Or simpler: We can just use the server instance to list tools? No, the SDK structure is a bit opaque.
        // But `registerWorkflowTools` calls `server.tool`. We can mock `server.tool` to capture the callback.
    });

    it("should orchestrate the full client onboarding lifecycle", async () => {
        // 1. Capture the tool implementation
        let toolHandler: any;
        const mockTool = vi.fn((name, desc, schema, handler) => {
            if (name === "client_onboarding_workflow") {
                toolHandler = handler;
            }
        });
        // @ts-ignore
        server.tool = mockTool;

        registerWorkflowTools(server);

        expect(toolHandler).toBeDefined();

        // 2. Setup Mock Responses

        // Env Vars
        process.env.LINEAR_API_KEY = "mock_linear_key";
        process.env.LINEAR_TEAM_ID = "team_123";
        process.env.HUBSPOT_ACCESS_TOKEN = "mock_hub_token";
        process.env.XERO_CLIENT_ID = "mock_xero_id";
        process.env.XERO_CLIENT_SECRET = "mock_xero_secret";

        // HubSpot: Assume no existing records (Create path)
        mockHubSpotSearch.mockResolvedValue({ results: [] });
        mockHubSpotCreate.mockImplementation((payload) => {
            // Determine type based on payload
            if (payload.properties.email) return Promise.resolve({ id: "contact_123" }); // Contact
            if (payload.properties.dealname) return Promise.resolve({ id: "deal_456" }); // Deal
            return Promise.resolve({ id: "company_789" }); // Company
        });

        // Xero
        mockCreateContacts.mockResolvedValue({ body: { contacts: [{ contactID: "xero_contact_abc" }] } });
        mockCreateInvoices.mockResolvedValue({ body: { invoices: [{ invoiceNumber: "INV-001" }] } });

        // Linear
        // createProject
        mockLinearProjects.mockResolvedValue({ nodes: [] }); // No existing project
        mockLinearCreateProject.mockResolvedValue({
            success: true,
            project: Promise.resolve({ id: "proj_xyz", url: "https://linear.app/proj_xyz", name: "Client Project" })
        });

        // createIssue
        // We need mockLinearProject to return an object that has teams() method
        const mockProjectQuery = {
            teams: vi.fn().mockResolvedValue({ nodes: [{ id: "team_123" }] })
        };
        mockLinearProject.mockReturnValue(mockProjectQuery);

        mockLinearCreateIssue.mockResolvedValue({
            success: true,
            issue: Promise.resolve({ id: "issue_1", identifier: "ABC-1", url: "https://linear.app/issue_1", title: "Task 1" })
        });


        // 3. Execute Workflow
        const input = {
            clientName: "TechCorp",
            contactEmail: "john@techcorp.com",
            contactName: "John Doe",
            serviceType: "web_dev",
            projectValue: 10000
        };

        const result = await toolHandler(input);

        // 4. Assertions

        // Check Result Content
        const content = JSON.parse(result.content[0].text);
        if (content.status !== "success") {
            console.error(content.errors);
            console.log(content.logs);
        }
        expect(content.status).toBe("success");

        // Logs should contain key steps
        const logs = content.logs.join("\n");
        expect(logs).toContain("HubSpot Company: company_789");
        expect(logs).toContain("HubSpot Contact: contact_123");
        expect(logs).toContain("HubSpot Deal: deal_456");
        expect(logs).toContain("Linear Project Synced: https://linear.app/proj_xyz");
        expect(logs).toContain("Created Xero Invoice: INV-001");

        // Verify API Calls

        // HubSpot
        expect(mockHubSpotCreate).toHaveBeenCalledTimes(3); // Company, Contact, Deal
        expect(mockHubSpotCreate).toHaveBeenCalledWith(expect.objectContaining({
            properties: expect.objectContaining({ dealname: "TechCorp - web_dev", amount: "10000" })
        }));

        // Linear
        expect(mockLinearCreateProject).toHaveBeenCalledWith(expect.objectContaining({
            name: "Client Project: TechCorp",
            description: expect.stringContaining("Linked HubSpot Deal: deal_456")
        }));

        // Should create milestones (4 milestones in syncDeal logic)
        expect(mockLinearCreateIssue).toHaveBeenCalledTimes(4);
        expect(mockLinearCreateIssue).toHaveBeenCalledWith(expect.objectContaining({
            projectId: "proj_xyz",
            title: "Discovery Phase"
        }));

        // Xero
        expect(mockCreateInvoices).toHaveBeenCalledWith(
            "mock_tenant_id",
            expect.objectContaining({
                invoices: expect.arrayContaining([
                    expect.objectContaining({
                        lineItems: expect.arrayContaining([
                            expect.objectContaining({ unitAmount: 2000 }) // 20% of 10000 (from mock template)
                        ])
                    })
                ])
            })
        );
    });
});
