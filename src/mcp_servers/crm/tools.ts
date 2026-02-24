import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Client } from "@hubspot/api-client";

// Initialize HubSpot Client
// We will initialize it lazily or check env vars when tools are called
// to allow the server to start even if credentials are missing (for help/docs),
// but fail on tool execution.
const getHubSpotClient = () => {
  const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("HUBSPOT_ACCESS_TOKEN environment variable is not set.");
  }
  return new Client({ accessToken });
};

export function registerTools(server: McpServer) {
  // Tool: Create Contact
  server.tool(
    "create_contact",
    "Create a new contact in HubSpot.",
    {
      email: z.string().email().describe("Email address of the contact."),
      firstname: z.string().optional().describe("First name."),
      lastname: z.string().optional().describe("Last name."),
      company: z.string().optional().describe("Company name."),
      phone: z.string().optional().describe("Phone number."),
      website: z.string().optional().describe("Website URL."),
      lifecyclestage: z.string().optional().describe("Lifecycle stage (e.g., lead, subscriber, customer).")
    },
    async ({ email, firstname, lastname, company, phone, website, lifecyclestage }) => {
      const hubspotClient = getHubSpotClient();

      const properties: any = {
        email,
        firstname,
        lastname,
        company,
        phone,
        website,
        lifecyclestage
      };

      // Filter out undefined properties
      Object.keys(properties).forEach(key => properties[key] === undefined && delete properties[key]);

      try {
        const apiResponse = await hubspotClient.crm.contacts.basicApi.create({
          properties,
          associations: []
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify(apiResponse, null, 2)
          }]
        };
      } catch (e: any) {
        return {
          content: [{
            type: "text",
            text: `Error creating contact: ${e.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool: Update Contact
  server.tool(
    "update_contact",
    "Update an existing contact in HubSpot.",
    {
      id: z.string().describe("The HubSpot Contact ID."),
      properties: z.string().describe("JSON string of properties to update (e.g., '{\"firstname\": \"John\"}').")
    },
    async ({ id, properties }) => {
      const hubspotClient = getHubSpotClient();
      let parsedProps;
      try {
        parsedProps = JSON.parse(properties);
      } catch {
        return {
          content: [{ type: "text", text: "Error: Invalid JSON in properties." }],
          isError: true
        };
      }

      try {
        const apiResponse = await hubspotClient.crm.contacts.basicApi.update(id, {
          properties: parsedProps
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify(apiResponse, null, 2)
          }]
        };
      } catch (e: any) {
         return {
          content: [{
            type: "text",
            text: `Error updating contact: ${e.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool: Search Contacts
  server.tool(
    "search_contacts",
    "Search for contacts by email, name, or other properties.",
    {
      query: z.string().describe("The search term."),
      limit: z.number().optional().default(10).describe("Max number of results.")
    },
    async ({ query, limit }) => {
      const hubspotClient = getHubSpotClient();

      const publicObjectSearchRequest = {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "email",
                operator: "CONTAINS_TOKEN",
                value: query
              }
            ]
          },
          {
            filters: [
                {
                    propertyName: "firstname",
                    operator: "CONTAINS_TOKEN",
                    value: query
                }
            ]
          },
          {
            filters: [
                {
                    propertyName: "lastname",
                    operator: "CONTAINS_TOKEN",
                    value: query
                }
            ]
          }
        ],
        sorts: ["email"],
        properties: ["email", "firstname", "lastname", "company"],
        limit,
        after: 0
      };

      try {
        // @ts-ignore - The SDK types might be strict about enums, but strings work
        const apiResponse = await hubspotClient.crm.contacts.searchApi.doSearch(publicObjectSearchRequest);

        return {
          content: [{
            type: "text",
            text: JSON.stringify(apiResponse.results, null, 2)
          }]
        };
      } catch (e: any) {
        return {
          content: [{
            type: "text",
            text: `Error searching contacts: ${e.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool: Create Deal
  server.tool(
    "create_deal",
    "Create a new deal in the CRM.",
    {
      dealname: z.string().describe("Name of the deal."),
      amount: z.string().optional().describe("Amount of the deal."),
      pipeline: z.string().optional().default("default").describe("Pipeline ID."),
      dealstage: z.string().optional().default("appointmentscheduled").describe("Deal stage ID."),
      closedate: z.string().optional().describe("Close date (ISO string).")
    },
    async ({ dealname, amount, pipeline, dealstage, closedate }) => {
      const hubspotClient = getHubSpotClient();

      const properties: any = {
        dealname,
        amount,
        pipeline,
        dealstage,
        closedate
      };
       // Filter out undefined properties
       Object.keys(properties).forEach(key => properties[key] === undefined && delete properties[key]);

      try {
        const apiResponse = await hubspotClient.crm.deals.basicApi.create({
          properties,
          associations: []
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify(apiResponse, null, 2)
          }]
        };
      } catch (e: any) {
        return {
          content: [{
            type: "text",
            text: `Error creating deal: ${e.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool: Update Deal
  server.tool(
    "update_deal",
    "Update a deal's stage or properties.",
    {
      id: z.string().describe("The Deal ID."),
      properties: z.string().describe("JSON string of properties to update.")
    },
    async ({ id, properties }) => {
      const hubspotClient = getHubSpotClient();
      let parsedProps;
      try {
        parsedProps = JSON.parse(properties);
      } catch {
        return {
          content: [{ type: "text", text: "Error: Invalid JSON in properties." }],
          isError: true
        };
      }

      try {
        const apiResponse = await hubspotClient.crm.deals.basicApi.update(id, {
          properties: parsedProps
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify(apiResponse, null, 2)
          }]
        };
      } catch (e: any) {
        return {
          content: [{
            type: "text",
            text: `Error updating deal: ${e.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool: Search Companies
  server.tool(
    "search_companies",
    "Search for companies by domain or name.",
    {
      query: z.string().describe("The search term (name or domain)."),
      limit: z.number().optional().default(10).describe("Max number of results.")
    },
    async ({ query, limit }) => {
        const hubspotClient = getHubSpotClient();

        const publicObjectSearchRequest = {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "name",
                  operator: "CONTAINS_TOKEN",
                  value: query
                }
              ]
            },
            {
              filters: [
                  {
                      propertyName: "domain",
                      operator: "CONTAINS_TOKEN",
                      value: query
                  }
              ]
            }
          ],
          sorts: ["name"],
          properties: ["name", "domain", "city", "state"],
          limit,
          after: 0
        };

        try {
          // @ts-ignore
          const apiResponse = await hubspotClient.crm.companies.searchApi.doSearch(publicObjectSearchRequest);

          return {
            content: [{
              type: "text",
              text: JSON.stringify(apiResponse.results, null, 2)
            }]
          };
        } catch (e: any) {
          return {
            content: [{
              type: "text",
              text: `Error searching companies: ${e.message}`
            }],
            isError: true
          };
        }
    }
  );

  // Tool: Get Unread Conversations
  server.tool(
    "get_unread_conversations",
    "Get the count of unread/recent conversations.",
    {},
    async () => {
        const hubspotClient = getHubSpotClient();
        try {
            // Attempt to access conversations API
            // Note: The client structure might vary by version. We attempt safe access.
            const conversationsApi = (hubspotClient as any).conversations?.threads?.threadsApi || (hubspotClient as any).conversations?.threads;

            if (!conversationsApi) {
                return {
                    content: [{ type: "text", text: "Conversations API not supported by this client version." }],
                    isError: true
                };
            }

            // Fetch recent threads
            const response = await conversationsApi.getPage();

            // In a real implementation, we would filter by 'unread' status if available in the response objects.
            // For now, returning the count of recent threads serves as a proxy for volume.
            const count = response.results ? response.results.length : 0;

            return {
                content: [{ type: "text", text: JSON.stringify(count) }]
            };
        } catch (e: any) {
             return {
                content: [{ type: "text", text: `Error fetching conversations: ${e.message}` }],
                isError: true
            };
        }
    }
  );

  // Tool: Sync Status
  server.tool(
    "sync_status",
    "Check the connectivity and sync status with HubSpot.",
    {},
    async () => {
        // Simple connectivity check by listing owners or similar lightweight call
        const hubspotClient = getHubSpotClient();
        try {
            const apiResponse = await hubspotClient.crm.owners.ownersApi.getPage(undefined, undefined, 1);
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        status: "connected",
                        message: "Successfully connected to HubSpot API.",
                        owner_count_sample: apiResponse.results.length
                    }, null, 2)
                }]
            };
        } catch (e: any) {
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        status: "error",
                        message: `Failed to connect: ${e.message}`
                    }, null, 2)
                }],
                isError: true
            };
        }
    }
  );
}
