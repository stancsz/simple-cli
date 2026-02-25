import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncContactToHubSpot, syncDealToHubSpot, syncCompanyToHubSpot } from "../../src/mcp_servers/business_ops/crm.js";

// Mock HubSpot
const mockDoSearch = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

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
                }
            }
        }
    }
});

describe("CRM Synchronization Logic", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.HUBSPOT_ACCESS_TOKEN = "mock_token";
    });

    describe("Contact Sync", () => {
        it("should create contact if not found", async () => {
            // Mock not found
            mockDoSearch.mockResolvedValue({ results: [] });
            mockCreate.mockResolvedValue({ id: "new_contact_id" });

            const result = await syncContactToHubSpot({ email: "new@example.com", firstname: "Test" });

            expect(result).toEqual({ id: "new_contact_id", action: "created" });
            expect(mockDoSearch).toHaveBeenCalled();
            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                properties: expect.objectContaining({ email: "new@example.com", firstname: "Test" })
            }));
            expect(mockUpdate).not.toHaveBeenCalled();
        });

        it("should update contact if found", async () => {
            // Mock found
            mockDoSearch.mockResolvedValue({ results: [{ id: "existing_id" }] });
            mockUpdate.mockResolvedValue({ id: "existing_id" });

            const result = await syncContactToHubSpot({ email: "existing@example.com", firstname: "Jane" });

            expect(result).toEqual({ id: "existing_id", action: "updated" });
            expect(mockDoSearch).toHaveBeenCalled();
            expect(mockUpdate).toHaveBeenCalledWith("existing_id", expect.objectContaining({
                properties: { firstname: "Jane" }
            }));
        });
    });

    describe("Company Sync", () => {
        it("should create company if not found", async () => {
            mockDoSearch.mockResolvedValue({ results: [] });
            mockCreate.mockResolvedValue({ id: "new_company_id" });

            const result = await syncCompanyToHubSpot({ name: "Acme Corp", domain: "acme.com" });

            expect(result).toEqual({ id: "new_company_id", action: "created" });
            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                properties: expect.objectContaining({ name: "Acme Corp", domain: "acme.com" })
            }));
        });

        it("should update company if found", async () => {
            mockDoSearch.mockResolvedValue({ results: [{ id: "existing_company_id" }] });
            mockUpdate.mockResolvedValue({ id: "existing_company_id" });

            const result = await syncCompanyToHubSpot({ name: "Acme Corp", domain: "acme.com", city: "New York" });

            expect(result).toEqual({ id: "existing_company_id", action: "updated" });
            // In my code: const { name, domain, ...otherProps } = props;
            // So updated properties should only contain city.
            expect(mockUpdate).toHaveBeenCalledWith("existing_company_id", expect.objectContaining({
                properties: { city: "New York" }
            }));
        });
    });

    describe("Deal Sync", () => {
        it("should create deal if not found", async () => {
            mockDoSearch.mockResolvedValue({ results: [] });
            mockCreate.mockResolvedValue({ id: "new_deal_id" });

            const result = await syncDealToHubSpot({ dealname: "Big Deal", amount: "1000" });

            expect(result).toEqual({ id: "new_deal_id", action: "created" });
            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                properties: expect.objectContaining({ dealname: "Big Deal", amount: "1000" })
            }));
        });

        it("should update deal if found", async () => {
            mockDoSearch.mockResolvedValue({ results: [{ id: "existing_deal_id" }] });
            mockUpdate.mockResolvedValue({ id: "existing_deal_id" });

            const result = await syncDealToHubSpot({ dealname: "Big Deal", dealstage: "won" });

            expect(result).toEqual({ id: "existing_deal_id", action: "updated" });
            expect(mockUpdate).toHaveBeenCalledWith("existing_deal_id", expect.objectContaining({
                properties: { dealstage: "won" }
            }));
        });
    });
});
