import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerLeadGenerationTools } from "../../src/mcp_servers/business_ops/tools/lead_generation.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Mock HubSpot
const mockDoSearch = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockNoteCreate = vi.fn();

vi.mock("@hubspot/api-client", () => {
    return {
        Client: class {
            crm = {
                contacts: {
                    searchApi: { doSearch: mockDoSearch },
                    basicApi: { create: mockCreate, update: mockUpdate }
                },
                companies: {
                    searchApi: { doSearch: mockDoSearch },
                    basicApi: { create: mockCreate, update: mockUpdate }
                },
                deals: {
                    searchApi: { doSearch: mockDoSearch },
                    basicApi: { create: mockCreate, update: mockUpdate }
                },
                objects: {
                    notes: {
                        basicApi: { create: mockNoteCreate }
                    }
                }
            }
        }
    }
});

// Mock EpisodicMemory
const mockStore = vi.fn();
const mockInit = vi.fn();

vi.mock("../../src/brain/episodic.js", () => {
    return {
        EpisodicMemory: class {
            async init() { return mockInit(); }
            async store(...args: any[]) { return mockStore(...args); }
        }
    }
});

// Mock Server
const mockServer = {
    tool: vi.fn()
};

describe("Lead Generation Workflow Validation", () => {
    let discoverTool: any;
    let qualifyTool: any;
    let outreachTool: any;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.HUBSPOT_ACCESS_TOKEN = "mock_token";
        process.env.GITHUB_TOKEN = "mock_gh_token";

        // Register tools to capture their implementation
        registerLeadGenerationTools(mockServer as any);

        // Extract tool implementations
        const calls = (mockServer.tool as any).mock.calls;
        discoverTool = calls.find((c: any) => c[0] === "discover_leads")?.[3];
        qualifyTool = calls.find((c: any) => c[0] === "qualify_lead")?.[3];
        outreachTool = calls.find((c: any) => c[0] === "initiate_outreach")?.[3];
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should discover leads using GitHub API", async () => {
        // Mock fetch
        const mockFetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes("search/users")) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        items: [
                            { login: "testuser", url: "https://api.github.com/users/testuser", html_url: "https://github.com/testuser" }
                        ]
                    })
                });
            }
            if (url.includes("users/testuser")) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        name: "Test User",
                        email: "test@example.com",
                        company: "Test Co",
                        html_url: "https://github.com/testuser",
                        blog: "https://test.com"
                    })
                });
            }
            return Promise.reject("Unknown URL");
        });
        vi.stubGlobal("fetch", mockFetch);

        const result = await discoverTool({
            target_audience: "Devs",
            criteria: { source: "github", keywords: ["react"] }
        });

        const content = JSON.parse(result.content[0].text);
        expect(content).toHaveLength(1);
        expect(content[0].name).toBe("Test User");
        expect(content[0].email).toBe("test@example.com");
    });

    it("should qualify lead and store in Brain", async () => {
        const result = await qualifyTool({
            company_url: "https://github.com/testuser",
            contact_email: "test@example.com"
        });

        const profile = JSON.parse(result.content[0].text);
        expect(profile.score).toBeGreaterThan(0);
        expect(profile.qualified).toBeDefined();

        expect(mockInit).toHaveBeenCalled();
        expect(mockStore).toHaveBeenCalledWith(
            "lead_qualification",
            expect.stringContaining("qualify_lead"),
            expect.any(String), // solution (json)
            [],
            undefined,
            undefined,
            false,
            undefined,
            undefined,
            0,
            0,
            "lead_profile"
        );
    });

    it("should initiate outreach and log to HubSpot", async () => {
        // Mock contact sync (not found -> create)
        mockDoSearch.mockResolvedValue({ results: [] });
        mockCreate.mockResolvedValue({ id: "new_contact_id" });

        // Mock note create
        mockNoteCreate.mockResolvedValue({ id: "note_123" });

        const result = await outreachTool({
            lead_id: "test@example.com",
            template_name: "intro",
            custom_message: "Hi there"
        });

        expect(result.content[0].text).toContain("Outreach initiated successfully");
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            properties: expect.objectContaining({ email: "test@example.com" })
        }));
        expect(mockNoteCreate).toHaveBeenCalledWith(expect.objectContaining({
            properties: expect.objectContaining({
                hs_note_body: expect.stringContaining("Hi there")
            }),
            associations: expect.arrayContaining([
                expect.objectContaining({
                    to: { id: "new_contact_id" }
                })
            ])
        }));
    });
});
