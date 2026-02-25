import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Client as HubSpotClient } from "@hubspot/api-client";

// Initialize HubSpot Client
export const getHubSpotClient = () => {
    const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!accessToken) {
        throw new Error("HUBSPOT_ACCESS_TOKEN environment variable is not set.");
    }
    return new HubSpotClient({ accessToken });
};

export interface ContactProperties {
    email: string;
    firstname?: string;
    lastname?: string;
    company?: string;
    phone?: string;
    website?: string;
    lifecyclestage?: string;
    [key: string]: any;
}

export interface DealProperties {
    dealname: string;
    amount?: string;
    pipeline?: string;
    dealstage?: string;
    closedate?: string;
    [key: string]: any;
}

export interface CompanyProperties {
    name: string;
    domain?: string;
    city?: string;
    state?: string;
    phone?: string;
    description?: string;
    industry?: string;
    [key: string]: any;
}

// Helper to sanitize properties by removing undefined/null values
function sanitizeProperties(props: Record<string, any>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(props)) {
        if (value !== undefined && value !== null) {
            sanitized[key] = String(value);
        }
    }
    return sanitized;
}

/**
 * Syncs a company to HubSpot (Create or Update).
 * Idempotent based on domain or name.
 */
export async function syncCompanyToHubSpot(props: CompanyProperties): Promise<{ id: string; action: "created" | "updated" }> {
    const hubspot = getHubSpotClient();
    const { name, domain, ...otherProps } = props;

    // 1. Search for existing company by domain (preferred) or name
    const filters = [];
    if (domain) {
        filters.push({
            propertyName: "domain",
            operator: "EQ",
            value: domain
        });
    } else {
        filters.push({
            propertyName: "name",
            operator: "EQ",
            value: name
        });
    }

    const publicObjectSearchRequest = {
        filterGroups: [
            {
                filters
            }
        ],
        sorts: ["name"],
        properties: ["name", "domain"],
        limit: 1,
        after: 0
    };

    try {
        // @ts-ignore
        const searchResult = await hubspot.crm.companies.searchApi.doSearch(publicObjectSearchRequest);

        if (searchResult.results.length > 0) {
            // Update existing
            const companyId = searchResult.results[0].id;
            await hubspot.crm.companies.basicApi.update(companyId, {
                properties: sanitizeProperties(otherProps)
            });
            return { id: companyId, action: "updated" };
        } else {
            // Create new
            const createResult = await hubspot.crm.companies.basicApi.create({
                properties: sanitizeProperties({ name, domain, ...otherProps }),
                associations: []
            });
            return { id: createResult.id, action: "created" };
        }
    } catch (e: any) {
        throw new Error(`HubSpot Company Sync Failed: ${e.message}`);
    }
}

/**
 * Syncs a contact to HubSpot (Create or Update).
 * Idempotent based on email.
 */
export async function syncContactToHubSpot(props: ContactProperties): Promise<{ id: string; action: "created" | "updated" }> {
    const hubspot = getHubSpotClient();
    const { email, ...otherProps } = props;

    // 1. Search for existing contact by email
    const publicObjectSearchRequest = {
        filterGroups: [
            {
                filters: [
                    {
                        propertyName: "email",
                        operator: "EQ",
                        value: email
                    }
                ]
            }
        ],
        sorts: ["email"],
        properties: ["email", "firstname", "lastname", "company"],
        limit: 1,
        after: 0
    };

    try {
        // @ts-ignore
        const searchResult = await hubspot.crm.contacts.searchApi.doSearch(publicObjectSearchRequest);

        if (searchResult.results.length > 0) {
            // Update existing
            const contactId = searchResult.results[0].id;
            await hubspot.crm.contacts.basicApi.update(contactId, {
                properties: sanitizeProperties(otherProps)
            });
            return { id: contactId, action: "updated" };
        } else {
            // Create new
            const createResult = await hubspot.crm.contacts.basicApi.create({
                properties: sanitizeProperties({ email, ...otherProps }),
                associations: []
            });
            return { id: createResult.id, action: "created" };
        }
    } catch (e: any) {
        throw new Error(`HubSpot Contact Sync Failed: ${e.message}`);
    }
}

/**
 * Syncs a deal to HubSpot (Create or Update).
 * Idempotent based on dealname.
 */
export async function syncDealToHubSpot(props: DealProperties): Promise<{ id: string; action: "created" | "updated" }> {
    const hubspot = getHubSpotClient();
    const { dealname, ...otherProps } = props;

    // 1. Search for existing deal by name
    const publicObjectSearchRequest = {
        filterGroups: [
            {
                filters: [
                    {
                        propertyName: "dealname",
                        operator: "EQ",
                        value: dealname
                    }
                ]
            }
        ],
        sorts: ["dealname"],
        properties: ["dealname", "amount", "dealstage"],
        limit: 1,
        after: 0
    };

    try {
        // @ts-ignore
        const searchResult = await hubspot.crm.deals.searchApi.doSearch(publicObjectSearchRequest);

        if (searchResult.results.length > 0) {
            // Update existing
            const dealId = searchResult.results[0].id;
            await hubspot.crm.deals.basicApi.update(dealId, {
                properties: sanitizeProperties(otherProps)
            });
            return { id: dealId, action: "updated" };
        } else {
            // Create new
            const createResult = await hubspot.crm.deals.basicApi.create({
                properties: sanitizeProperties({ dealname, ...otherProps }),
                associations: []
            });
            return { id: createResult.id, action: "created" };
        }
    } catch (e: any) {
        throw new Error(`HubSpot Deal Sync Failed: ${e.message}`);
    }
}

/**
 * Logs a note to a contact in HubSpot.
 */
export async function logNoteToHubSpot(contactId: string, noteBody: string): Promise<string> {
    const hubspot = getHubSpotClient();
    try {
        // @ts-ignore
        const createResult = await hubspot.crm.objects.notes.basicApi.create({
            properties: {
                hs_note_body: noteBody,
                hs_timestamp: Date.now().toString()
            },
            associations: [
                {
                    to: { id: contactId },
                    types: [
                        {
                            associationCategory: "HUBSPOT_DEFINED" as any,
                            associationTypeId: 202 // Note to Contact
                        }
                    ]
                }
            ]
        });
        return createResult.id;
    } catch (e: any) {
        throw new Error(`HubSpot Log Note Failed: ${e.message}`);
    }
}

export function registerCrmTools(server: McpServer) {
    // Tool: Sync Company
    server.tool(
        "sync_company_to_crm",
        "Syncs a company to HubSpot. Creates if not exists (by domain/name), updates otherwise.",
        {
            name: z.string().describe("Company name."),
            domain: z.string().optional().describe("Company domain."),
            city: z.string().optional().describe("City."),
            state: z.string().optional().describe("State."),
            phone: z.string().optional().describe("Phone number."),
            description: z.string().optional().describe("Description."),
            industry: z.string().optional().describe("Industry.")
        },
        async (args) => {
            try {
                const result = await syncCompanyToHubSpot(args as CompanyProperties);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (e: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error syncing company: ${e.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    // Tool: Sync Contact
    server.tool(
        "sync_contact_to_crm",
        "Syncs a contact to HubSpot. Creates if not exists (by email), updates otherwise.",
        {
            email: z.string().email().describe("Email address (primary key)."),
            firstname: z.string().optional().describe("First name."),
            lastname: z.string().optional().describe("Last name."),
            company: z.string().optional().describe("Company name."),
            phone: z.string().optional().describe("Phone number."),
            website: z.string().optional().describe("Website URL."),
            lifecyclestage: z.string().optional().describe("Lifecycle stage.")
        },
        async (args) => {
            try {
                const result = await syncContactToHubSpot(args as ContactProperties);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (e: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error syncing contact: ${e.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    // Tool: Sync Deal
    server.tool(
        "sync_deal_to_crm",
        "Syncs a deal to HubSpot. Creates if not exists (by dealname), updates otherwise.",
        {
            dealname: z.string().describe("Deal name (primary key)."),
            amount: z.string().optional().describe("Deal amount."),
            pipeline: z.string().optional().default("default").describe("Pipeline ID."),
            dealstage: z.string().optional().default("appointmentscheduled").describe("Deal stage ID."),
            closedate: z.string().optional().describe("Close date (ISO string).")
        },
        async (args) => {
            try {
                const result = await syncDealToHubSpot(args as DealProperties);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (e: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error syncing deal: ${e.message}`
                    }],
                    isError: true
                };
            }
        }
    );
}
