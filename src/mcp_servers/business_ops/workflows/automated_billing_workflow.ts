import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getXeroClient, getTenantId } from "../xero_tools.js";
import { mkdir, appendFile } from "fs/promises";
import { join } from "path";

export function registerBillingWorkflow(server: McpServer) {
    server.tool(
        "automated_billing_workflow",
        "Run the automated billing cycle for a client.",
        {
            clientName: z.string().describe("Name of the client company."),
            contactEmail: z.string().email().describe("Primary contact email."),
            items: z.array(z.object({
                description: z.string(),
                quantity: z.number(),
                unitAmount: z.number(),
                accountCode: z.string().optional()
            })).describe("Line items to bill."),
            dueDate: z.string().describe("Due date (YYYY-MM-DD)."),
            sendEmail: z.boolean().default(true).describe("Whether to email the invoice immediately.")
        },
        async ({ clientName, contactEmail, items, dueDate, sendEmail }) => {
            const logs: string[] = [];
            const errors: string[] = [];
            let invoiceNumber: string | undefined;

            try {
                const xero = await getXeroClient();
                const tenantId = await getTenantId(xero);

                // 1. Resolve Contact
                let contactId: string | undefined;
                try {
                    // Search by email
                    // @ts-ignore
                    const searchResp = await xero.accountingApi.getContacts(tenantId, undefined, `EmailAddress=="${contactEmail}"`);
                    if (searchResp.body.contacts && searchResp.body.contacts.length > 0) {
                        contactId = searchResp.body.contacts[0].contactID;
                        logs.push(`Found existing Xero contact: ${contactId}`);
                    } else {
                        // Create new
                        // @ts-ignore
                        const createResp = await xero.accountingApi.createContacts(tenantId, {
                            contacts: [{
                                name: clientName,
                                emailAddress: contactEmail
                            }]
                        });
                        contactId = createResp.body.contacts?.[0]?.contactID;
                        logs.push(`Created new Xero contact: ${contactId}`);
                    }
                } catch (e: any) {
                    throw new Error(`Failed to resolve contact: ${e.message}`);
                }

                if (!contactId) {
                    throw new Error("Could not resolve or create contact.");
                }

                // 2. Check for Overdue Invoices
                try {
                     // @ts-ignore
                     const overdueResp = await xero.accountingApi.getInvoices(
                        tenantId,
                        undefined,
                        `Contact.ContactID==GUID("${contactId}") && Status=="AUTHORISED"`
                     );

                     const overdue = overdueResp.body.invoices?.filter((inv: any) => inv.amountDue > 0 && inv.dueDate && new Date(inv.dueDate) < new Date());

                     if (overdue && overdue.length > 0) {
                         const overdueTotal = overdue.reduce((sum: number, inv: any) => sum + (inv.amountDue || 0), 0);
                         logs.push(`Warning: Client has ${overdue.length} overdue invoices totaling ${overdueTotal}. Proceeding with billing.`);
                     }
                } catch (e: any) {
                    logs.push(`Warning: Failed to check overdue invoices: ${e.message}`);
                }

                // 3. Create Invoice (Idempotent)
                let invoiceId: string | undefined;
                try {
                    // Generate idempotency key based on client and current month
                    const reference = `AUTO-BILLING-${new Date().getFullYear()}-${new Date().getMonth() + 1}`;

                    // @ts-ignore
                    const existing = await xero.accountingApi.getInvoices(tenantId, undefined, `Reference=="${reference}" && Contact.ContactID==GUID("${contactId}")`);

                    if (existing.body.invoices && existing.body.invoices.length > 0) {
                        const existingInv = existing.body.invoices[0];
                        invoiceId = existingInv.invoiceID;
                        invoiceNumber = existingInv.invoiceNumber;
                        logs.push(`Idempotency: Found existing invoice ${invoiceNumber} for this cycle. Skipping creation.`);
                    } else {
                        const invoice = {
                            type: "ACCREC",
                            contact: { contactID: contactId },
                            date: new Date().toISOString().split('T')[0],
                            dueDate: dueDate,
                            reference: reference,
                            status: sendEmail ? "AUTHORISED" : "DRAFT", // Must be AUTHORISED to email? Usually yes.
                            lineItems: items.map(item => ({
                                description: item.description,
                                quantity: item.quantity,
                                unitAmount: item.unitAmount,
                                accountCode: item.accountCode || "200"
                            }))
                        };

                        // @ts-ignore
                        const invResp = await xero.accountingApi.createInvoices(tenantId, { invoices: [invoice] });
                        const createdInvoice = invResp.body.invoices?.[0];
                        invoiceId = createdInvoice?.invoiceID;
                        invoiceNumber = createdInvoice?.invoiceNumber;
                        logs.push(`Created Invoice ${invoiceNumber} (${invoiceId})`);
                    }

                } catch (e: any) {
                    throw new Error(`Failed to create invoice: ${e.message}`);
                }

                // 4. Send Email
                if (sendEmail && invoiceId) {
                    try {
                        // @ts-ignore
                        await xero.accountingApi.emailInvoice(tenantId, invoiceId, {});
                        logs.push(`Emailed invoice to ${contactEmail}`);
                    } catch (e: any) {
                        errors.push(`Failed to email invoice: ${e.message}`);
                    }
                }

                // 5. Audit Log to Company Context
                try {
                    const safeName = clientName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
                    const companyDir = join(process.cwd(), ".agent", "companies", safeName);

                    await mkdir(companyDir, { recursive: true });

                    const logEntry = `[${new Date().toISOString()}] Billing Action: Created Invoice ${invoiceNumber} for ${items.length} items. Emailed: ${sendEmail}.\n`;
                    await appendFile(join(companyDir, "billing_audit.log"), logEntry);
                    logs.push(`Logged action to ${join(companyDir, "billing_audit.log")}`);

                } catch (e: any) {
                    logs.push(`Warning: Failed to write audit log: ${e.message}`);
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: errors.length > 0 ? "partial_success" : "success",
                            invoiceNumber,
                            logs,
                            errors
                        }, null, 2)
                    }]
                };

            } catch (e: any) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: "failed",
                            error: e.message,
                            logs,
                            errors
                        }, null, 2)
                    }],
                    isError: true
                };
            }
        }
    );
}
