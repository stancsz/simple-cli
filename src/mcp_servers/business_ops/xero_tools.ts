import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { XeroClient } from "xero-node";

const getXeroClient = () => {
  const token = process.env.XERO_ACCESS_TOKEN;
  if (!token) {
    throw new Error("XERO_ACCESS_TOKEN environment variable is not set.");
  }
  const xero = new XeroClient();
  xero.setTokenSet({ access_token: token });
  return xero;
};

const getTenantId = async (xero: XeroClient) => {
    // If tenant ID is provided in env, use it. Otherwise fetch connected tenants.
    if (process.env.XERO_TENANT_ID) {
        return process.env.XERO_TENANT_ID;
    }
    // Fallback: fetch tenants and use the first one
    try {
        const response = await xero.updateTenants();
        if (response.body.length > 0) {
            return response.body[0].tenantId;
        }
    } catch (e) {
        console.error("Failed to fetch tenants", e);
    }
    throw new Error("XERO_TENANT_ID environment variable is not set and no connected tenants found.");
}

export function registerXeroTools(server: McpServer) {
  // Tool: List Invoices
  server.tool(
    "list_invoices",
    "List invoices from Xero.",
    {
      statuses: z.array(z.string()).optional().describe("Filter by status (e.g., AUTHORISED, DRAFT)."),
      page: z.number().optional().default(1).describe("Page number."),
      updatedAfter: z.string().optional().describe("Filter by updated date (ISO string)."),
      where: z.string().optional().describe("Filter by where clause (e.g., 'Type==\"ACCREC\"').")
    },
    async ({ statuses, page, updatedAfter, where }) => {
      try {
        const xero = getXeroClient();
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

  // Tool: Create Invoice
  server.tool(
    "create_invoice",
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
            const xero = getXeroClient();
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

  // Tool: Get Balance Sheet
  server.tool(
      "get_balance_sheet",
      "Get the Balance Sheet report.",
      {
          date: z.string().optional().describe("Report date (YYYY-MM-DD).")
      },
      async ({ date }) => {
          try {
              const xero = getXeroClient();
              const tenantId = await getTenantId(xero);

              const response = await xero.accountingApi.getReportBalanceSheet(
                  tenantId,
                  date,
                  undefined, // periods
                  undefined, // timeframe
                  undefined, // trackingCategoryID1
                  undefined, // trackingCategoryID2
                  undefined, // trackingOptionID1
                  undefined, // trackingOptionID2
                  true // standardLayout
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
              const xero = getXeroClient();
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
                  true // standardLayout
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
