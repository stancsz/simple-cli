import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { XeroClient } from "xero-node";

// Global client instance to maintain token state across calls in memory
let xeroClientInstance: XeroClient | null = null;

export const getXeroClient = async () => {
  // If we have an instance and the token is valid, return it.
  if (xeroClientInstance) {
      const tokenSet = xeroClientInstance.readTokenSet();
      // @ts-ignore - .expired() exists on TokenSet
      if (tokenSet && !tokenSet.expired()) {
          return xeroClientInstance;
      }
      // If expired, we will try to refresh below.
  }

  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const accessToken = process.env.XERO_ACCESS_TOKEN;
  const refreshToken = process.env.XERO_REFRESH_TOKEN;

  if (!clientId || !clientSecret) {
      // Fallback to just access token if client/secret not provided (legacy/simple mode)
      if (!accessToken) {
         throw new Error("XERO_ACCESS_TOKEN or (XERO_CLIENT_ID and XERO_CLIENT_SECRET) must be set.");
      }
      // If we only have access token, we can't refresh.
      if (!xeroClientInstance) {
          xeroClientInstance = new XeroClient();
          xeroClientInstance.setTokenSet({ access_token: accessToken });
      }
      return xeroClientInstance;
  }

  // Full OAuth2 mode
  if (!xeroClientInstance) {
      xeroClientInstance = new XeroClient({
          clientId,
          clientSecret,
          grantType: 'authorization_code'
      });
  }

  // Initialize token set if needed
  let currentTokenSet = xeroClientInstance.readTokenSet();
  if (!currentTokenSet || !currentTokenSet.access_token) {
      if (accessToken) {
          // We set the token set. Note: if we don't have expiry info, .expired() might return false or true depending on implementation.
          // Usually we should have saved the full token set. For now we assume env vars.
          xeroClientInstance.setTokenSet({
              access_token: accessToken,
              refresh_token: refreshToken
          });
          currentTokenSet = xeroClientInstance.readTokenSet();
      }
  }

  // Check expiration and refresh if needed
  // @ts-ignore - .expired() exists on TokenSet
  if ((currentTokenSet.expired() || !currentTokenSet.access_token) && refreshToken) {
       console.error("Xero token expired or missing, attempting refresh...");
       try {
           // If we don't have a valid token set but have a refresh token in env, we might need to manually trigger refresh
           // But xero-node usually needs a loaded token set to refresh.
           // If currentTokenSet is empty but we have refreshToken in env, we set it above.

           const validTokenSet = await xeroClientInstance.refreshToken();
           xeroClientInstance.setTokenSet(validTokenSet);

           // Update process.env so subsequent calls in this session use the new token
           if (validTokenSet.access_token) process.env.XERO_ACCESS_TOKEN = validTokenSet.access_token;
           if (validTokenSet.refresh_token) process.env.XERO_REFRESH_TOKEN = validTokenSet.refresh_token;

           console.error("Xero token refreshed successfully.");
       } catch (e: any) {
           console.error("Failed to refresh Xero token:", e);
           throw new Error(`Xero token expired and refresh failed: ${e.message}`);
       }
  }

  return xeroClientInstance;
};

export const getTenantId = async (xero: XeroClient) => {
    // If tenant ID is provided in env, use it. Otherwise fetch connected tenants.
    if (process.env.XERO_TENANT_ID) {
        return process.env.XERO_TENANT_ID;
    }
    // Fallback: fetch tenants and use the first one
    try {
        const response = await xero.updateTenants();
        // @ts-ignore - xero-node types might return the array directly or in a body property
        const tenants = response.body || response;
        if (tenants && tenants.length > 0) {
            return tenants[0].tenantId;
        }
    } catch (e) {
        console.error("Failed to fetch tenants", e);
    }
    throw new Error("XERO_TENANT_ID environment variable is not set and no connected tenants found.");
}

export function registerXeroTools(server: McpServer) {
  // Tool: List Invoices (xero_get_invoices)
  server.tool(
    "xero_get_invoices",
    "List invoices from Xero with optional filtering.",
    {
      statuses: z.array(z.string()).optional().describe("Filter by status (e.g., AUTHORISED, DRAFT)."),
      page: z.number().optional().default(1).describe("Page number."),
      updatedAfter: z.string().optional().describe("Filter by updated date (ISO string)."),
      where: z.string().optional().describe("Filter by where clause (e.g., 'Type==\"ACCREC\"').")
    },
    async ({ statuses, page, updatedAfter, where }) => {
      try {
        const xero = await getXeroClient();
        const tenantId = await getTenantId(xero);

        const response = await xero.accountingApi.getInvoices(
            tenantId,
            updatedAfter ? new Date(updatedAfter) : undefined,
            where,
            undefined, // order
            undefined, // ids
            undefined, // invoiceNumbers
            undefined, // contactIDs
            statuses,
            page,
            undefined, // includeArchived
            undefined, // createdByMyApp
            undefined // unitdp
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify(response.body.invoices, null, 2)
          }]
        };
      } catch (e: any) {
        return {
          content: [{
            type: "text",
            text: `Error listing invoices: ${e.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool: Create Invoice (xero_create_invoice)
  server.tool(
    "xero_create_invoice",
    "Create a new invoice in Xero.",
    {
      contactId: z.string().describe("The Contact ID."),
      lineItems: z.array(z.object({
          description: z.string(),
          quantity: z.number(),
          unitAmount: z.number(),
          accountCode: z.string().optional()
      })).describe("Line items for the invoice."),
      date: z.string().optional().describe("Invoice date (YYYY-MM-DD)."),
      dueDate: z.string().optional().describe("Due date (YYYY-MM-DD)."),
      status: z.enum(["DRAFT", "SUBMITTED", "AUTHORISED"]).default("DRAFT").describe("Invoice status.")
    },
    async ({ contactId, lineItems, date, dueDate, status }) => {
        try {
            const xero = await getXeroClient();
            const tenantId = await getTenantId(xero);

            const invoice = {
                type: "ACCREC", // Accounts Receivable
                contact: { contactID: contactId },
                date: date,
                dueDate: dueDate,
                lineItems: lineItems.map(item => ({
                    description: item.description,
                    quantity: item.quantity,
                    unitAmount: item.unitAmount,
                    accountCode: item.accountCode
                })),
                status: status
            };

            // @ts-ignore - Types might mismatch slightly on deep partials but structure is correct
            const response = await xero.accountingApi.createInvoices(tenantId, { invoices: [invoice] });

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(response.body.invoices?.[0], null, 2)
                }]
            };

        } catch (e: any) {
             return {
                content: [{
                    type: "text",
                    text: `Error creating invoice: ${e.message}`
                }],
                isError: true
            };
        }
    }
  );

  // Tool: Get Contacts (xero_get_contacts)
  server.tool(
      "xero_get_contacts",
      "Retrieve contacts from Xero with pagination.",
      {
          page: z.number().optional().default(1).describe("Page number."),
          where: z.string().optional().describe("Filter by where clause (e.g., 'Name.Contains(\"ABC\")').")
      },
      async ({ page, where }) => {
          try {
              const xero = await getXeroClient();
              const tenantId = await getTenantId(xero);

              const response = await xero.accountingApi.getContacts(
                  tenantId,
                  undefined, // ifModifiedSince
                  where,
                  undefined, // order
                  undefined, // ids
                  page,
                  undefined // includeArchived
              );

              return {
                  content: [{
                      type: "text",
                      text: JSON.stringify(response.body.contacts, null, 2)
                  }]
              };
          } catch (e: any) {
              return {
                  content: [{
                      type: "text",
                      text: `Error getting contacts: ${e.message}`
                  }],
                  isError: true
              };
          }
      }
  );

  // Tool: Create Contact (xero_create_contact)
  server.tool(
    "xero_create_contact",
    "Create a new contact in Xero.",
    {
        name: z.string().describe("Contact name."),
        email: z.string().optional().describe("Email address."),
        accountNumber: z.string().optional().describe("Account number."),
        taxNumber: z.string().optional().describe("Tax number.")
    },
    async ({ name, email, accountNumber, taxNumber }) => {
        try {
            const xero = await getXeroClient();
            const tenantId = await getTenantId(xero);

            const contact: any = {
                name
            };
            if (email) contact.emailAddress = email;
            if (accountNumber) contact.accountNumber = accountNumber;
            if (taxNumber) contact.taxNumber = taxNumber;

            const response = await xero.accountingApi.createContacts(tenantId, { contacts: [contact] });

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(response.body.contacts?.[0], null, 2)
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

  // Tool: Get Balance Sheet
  server.tool(
      "get_balance_sheet",
      "Get the Balance Sheet report.",
      {
          date: z.string().optional().describe("Report date (YYYY-MM-DD).")
      },
      async ({ date }) => {
          try {
              const xero = await getXeroClient();
              const tenantId = await getTenantId(xero);

              const response = await xero.accountingApi.getReportBalanceSheet(
                  tenantId,
                  date,
                  undefined, // periods
                  undefined, // timeframe
                  undefined, // trackingOptionID1
                  undefined, // trackingOptionID2
              );

              return {
                  content: [{
                      type: "text",
                      text: JSON.stringify(response.body, null, 2)
                  }]
              };
          } catch (e: any) {
              return {
                  content: [{
                      type: "text",
                      text: `Error getting balance sheet: ${e.message}`
                  }],
                  isError: true
              };
          }
      }
  );

  // Tool: Get Profit and Loss
  server.tool(
      "get_profit_and_loss",
      "Get the Profit and Loss report.",
      {
          fromDate: z.string().describe("Start date (YYYY-MM-DD)."),
          toDate: z.string().describe("End date (YYYY-MM-DD).")
      },
      async ({ fromDate, toDate }) => {
          try {
              const xero = await getXeroClient();
              const tenantId = await getTenantId(xero);

              const response = await xero.accountingApi.getReportProfitAndLoss(
                  tenantId,
                  fromDate,
                  toDate,
                  undefined, // periods
                  undefined, // timeframe
                  undefined, // trackingCategoryID1
                  undefined, // trackingCategoryID2
                  undefined, // trackingOptionID1
                  undefined, // trackingOptionID2
              );

               return {
                  content: [{
                      type: "text",
                      text: JSON.stringify(response.body, null, 2)
                  }]
              };
          } catch (e: any) {
               return {
                  content: [{
                      type: "text",
                      text: `Error getting profit and loss: ${e.message}`
                  }],
                  isError: true
              };
          }
      }
  );
}
