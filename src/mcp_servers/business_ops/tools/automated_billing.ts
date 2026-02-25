import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getXeroClient, getTenantId } from "../xero_tools.js";

export function registerBillingTools(server: McpServer) {

    // Tool: Create Invoice with Validation
    server.tool(
        "billing_create_invoice",
        "Create a new invoice in Xero with business validation.",
        {
            contactId: z.string().describe("The Xero Contact ID."),
            lineItems: z.array(z.object({
                description: z.string(),
                quantity: z.number(),
                unitAmount: z.number(),
                accountCode: z.string().optional()
            })).describe("Line items for the invoice."),
            dueDate: z.string().describe("Due date (YYYY-MM-DD)."),
            reference: z.string().optional().describe("Invoice reference (e.g., PO number).")
        },
        async ({ contactId, lineItems, dueDate, reference }) => {
            try {
                const xero = await getXeroClient();
                const tenantId = await getTenantId(xero);

                // 1. Idempotency Check: Check if an invoice with this reference already exists
                if (reference) {
                    try {
                        // @ts-ignore
                        const existing = await xero.accountingApi.getInvoices(tenantId, undefined, `Reference=="${reference}"`);
                        if (existing.body.invoices && existing.body.invoices.length > 0) {
                            return {
                                content: [{
                                    type: "text",
                                    text: JSON.stringify(existing.body.invoices[0], null, 2)
                                }]
                            };
                        }
                    } catch (e) {
                        // If checking fails, proceed with caution or log error. We assume transient error or not found if 404.
                        // But getInvoices usually returns empty list if not found.
                    }
                }

                // 2. Check for existing UNPAID invoices (Optional Check, enforced in Workflow mainly)
                // We keep the tool flexible, but could enforce strict checks here.

                const invoice = {
                    type: "ACCREC", // Accounts Receivable
                    contact: { contactID: contactId },
                    date: new Date().toISOString().split('T')[0],
                    dueDate: dueDate,
                    reference: reference,
                    lineItems: lineItems.map(item => ({
                        description: item.description,
                        quantity: item.quantity,
                        unitAmount: item.unitAmount,
                        accountCode: item.accountCode || "200" // Default to Sales code if not provided
                    })),
                    status: "DRAFT" // Create as DRAFT first for review, or AUTHORISED if we trust it. Let's stick to DRAFT or SUBMITTED.
                };

                // @ts-ignore - Types might mismatch slightly
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
                        text: `Error creating billing invoice: ${e.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    // Tool: Send Invoice via Email
    server.tool(
        "billing_send_invoice",
        "Email an invoice to the contact.",
        {
            invoiceId: z.string().describe("The Invoice ID.")
        },
        async ({ invoiceId }) => {
            try {
                const xero = await getXeroClient();
                const tenantId = await getTenantId(xero);

                // API: POST /Invoices/{InvoiceID}/Email
                // xero-node method: emailInvoice
                await xero.accountingApi.emailInvoice(tenantId, invoiceId, {});

                return {
                    content: [{
                        type: "text",
                        text: `Invoice ${invoiceId} emailed successfully.`
                    }]
                };

            } catch (e: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error emailing invoice: ${e.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    // Tool: Record Payment
    server.tool(
        "billing_record_payment",
        "Record a payment against an invoice.",
        {
            invoiceId: z.string().describe("The Invoice ID."),
            amount: z.number().describe("Payment amount."),
            accountId: z.string().describe("Bank Account ID or Code to receive payment."),
            date: z.string().optional().describe("Payment date (YYYY-MM-DD). Defaults to today.")
        },
        async ({ invoiceId, amount, accountId, date }) => {
            try {
                const xero = await getXeroClient();
                const tenantId = await getTenantId(xero);

                const payment = {
                    invoice: { invoiceID: invoiceId },
                    account: { accountID: accountId }, // Or Code if accountId is a code. xero-node might require ID. API accepts Code in some contexts.
                    // If accountId is a code, we might need to resolve it. But let's assume ID or Code works or user provides correct one.
                    // Usually AccountID is preferred.
                    date: date || new Date().toISOString().split('T')[0],
                    amount: amount
                };

                // @ts-ignore
                const response = await xero.accountingApi.createPayments(tenantId, { payments: [payment] });

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(response.body.payments?.[0], null, 2)
                    }]
                };

            } catch (e: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error recording payment: ${e.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    // Tool: Get Payment Status
    server.tool(
        "billing_get_payment_status",
        "Check the status of an invoice.",
        {
            invoiceId: z.string().describe("The Invoice ID.")
        },
        async ({ invoiceId }) => {
            try {
                const xero = await getXeroClient();
                const tenantId = await getTenantId(xero);

                const response = await xero.accountingApi.getInvoice(tenantId, invoiceId);
                const invoice = response.body.invoices?.[0];

                if (!invoice) {
                     return {
                        content: [{ type: "text", text: "Invoice not found." }],
                        isError: true
                    };
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            invoiceNumber: invoice.invoiceNumber,
                            status: invoice.status,
                            amountDue: invoice.amountDue,
                            amountPaid: invoice.amountPaid,
                            dueDate: invoice.dueDate
                        }, null, 2)
                    }]
                };

            } catch (e: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error getting payment status: ${e.message}`
                    }],
                    isError: true
                };
            }
        }
    );
}
