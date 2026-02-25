import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerBillingTools } from "../../../src/mcp_servers/business_ops/tools/automated_billing.js";
import { registerBillingWorkflow } from "../../../src/mcp_servers/business_ops/workflows/automated_billing_workflow.js";
import { getXeroClient, getTenantId } from "../../../src/mcp_servers/business_ops/xero_tools.js";

// Mock Xero Tools
vi.mock("../../../src/mcp_servers/business_ops/xero_tools.js", () => ({
    getXeroClient: vi.fn(),
    getTenantId: vi.fn()
}));

// Mock FS
vi.mock("fs/promises", () => ({
    mkdir: vi.fn().mockResolvedValue(undefined),
    appendFile: vi.fn().mockResolvedValue(undefined)
}));

describe("Automated Billing Tools & Workflow", () => {
    let mockXero: any;
    let mockServer: any;
    let registeredTools: Record<string, any> = {};

    beforeEach(() => {
        vi.clearAllMocks();
        registeredTools = {};

        // Mock Xero Client
        mockXero = {
            accountingApi: {
                createInvoices: vi.fn().mockResolvedValue({
                    body: {
                        invoices: [{
                            invoiceID: "inv_123",
                            invoiceNumber: "INV-001",
                            status: "DRAFT"
                        }]
                    }
                }),
                emailInvoice: vi.fn().mockResolvedValue({}),
                createPayments: vi.fn().mockResolvedValue({
                    body: {
                        payments: [{
                            paymentID: "pay_456",
                            status: "AUTHORISED"
                        }]
                    }
                }),
                getInvoice: vi.fn().mockResolvedValue({
                    body: {
                        invoices: [{
                            invoiceID: "inv_123",
                            invoiceNumber: "INV-001",
                            status: "AUTHORISED",
                            amountDue: 100,
                            amountPaid: 0,
                            dueDate: "2025-01-31"
                        }]
                    }
                }),
                getInvoices: vi.fn().mockResolvedValue({
                     body: {
                         invoices: []
                     }
                }),
                getContacts: vi.fn().mockResolvedValue({
                    body: {
                        contacts: []
                    }
                }),
                createContacts: vi.fn().mockResolvedValue({
                    body: {
                        contacts: [{
                            contactID: "con_789",
                            name: "Test Client"
                        }]
                    }
                })
            }
        };

        (getXeroClient as any).mockResolvedValue(mockXero);
        (getTenantId as any).mockResolvedValue("tenant_123");

        // Mock Server
        mockServer = {
            tool: (name: string, desc: string, schema: any, handler: any) => {
                registeredTools[name] = handler;
            }
        };

        // Register tools
        registerBillingTools(mockServer);
        registerBillingWorkflow(mockServer);
    });

    describe("Billing Tools", () => {
        it("should create an invoice", async () => {
            const result = await registeredTools["billing_create_invoice"]({
                contactId: "con_789",
                lineItems: [{ description: "Service", quantity: 1, unitAmount: 100 }],
                dueDate: "2025-01-31"
            });

            expect(result.content[0].text).toContain("INV-001");
            expect(mockXero.accountingApi.createInvoices).toHaveBeenCalledWith(
                "tenant_123",
                expect.objectContaining({
                    invoices: expect.arrayContaining([
                        expect.objectContaining({
                            contact: { contactID: "con_789" },
                            lineItems: expect.arrayContaining([
                                expect.objectContaining({ unitAmount: 100 })
                            ])
                        })
                    ])
                })
            );
        });

        it("should send an invoice", async () => {
            const result = await registeredTools["billing_send_invoice"]({
                invoiceId: "inv_123"
            });

            expect(result.content[0].text).toContain("emailed successfully");
            expect(mockXero.accountingApi.emailInvoice).toHaveBeenCalledWith(
                "tenant_123",
                "inv_123",
                expect.any(Object)
            );
        });

        it("should record a payment", async () => {
            const result = await registeredTools["billing_record_payment"]({
                invoiceId: "inv_123",
                amount: 100,
                accountId: "acc_999"
            });

            expect(result.content[0].text).toContain("pay_456");
            expect(mockXero.accountingApi.createPayments).toHaveBeenCalledWith(
                "tenant_123",
                expect.objectContaining({
                    payments: expect.arrayContaining([
                        expect.objectContaining({
                            invoice: { invoiceID: "inv_123" },
                            account: { accountID: "acc_999" },
                            amount: 100
                        })
                    ])
                })
            );
        });

        it("should get payment status", async () => {
            const result = await registeredTools["billing_get_payment_status"]({
                invoiceId: "inv_123"
            });

            expect(result.content[0].text).toContain("AUTHORISED");
            expect(mockXero.accountingApi.getInvoice).toHaveBeenCalledWith(
                "tenant_123",
                "inv_123"
            );
        });
    });

    describe("Billing Workflow", () => {
        it("should run the full billing cycle (new contact)", async () => {
            // Setup: getContacts returns empty -> trigger createContacts
            mockXero.accountingApi.getContacts.mockResolvedValueOnce({ body: { contacts: [] } });

            const result = await registeredTools["automated_billing_workflow"]({
                clientName: "New Client",
                contactEmail: "new@client.com",
                items: [{ description: "Consulting", quantity: 10, unitAmount: 150 }],
                dueDate: "2025-02-15",
                sendEmail: true
            });

            expect(result.isError).toBeUndefined();
            const json = JSON.parse(result.content[0].text);
            expect(json.status).toBe("success");
            expect(json.invoiceNumber).toBe("INV-001");
            expect(json.logs).toEqual(expect.arrayContaining([
                expect.stringContaining("Created new Xero contact"),
                expect.stringContaining("Created Invoice"),
                expect.stringContaining("Emailed invoice"),
                expect.stringContaining("Logged action")
            ]));

            // Verify Calls
            expect(mockXero.accountingApi.createContacts).toHaveBeenCalledWith(
                "tenant_123",
                expect.objectContaining({
                    contacts: expect.arrayContaining([
                        expect.objectContaining({ emailAddress: "new@client.com" })
                    ])
                })
            );

            expect(mockXero.accountingApi.createInvoices).toHaveBeenCalled();
            expect(mockXero.accountingApi.emailInvoice).toHaveBeenCalled();
        });

        it("should run billing cycle for existing contact", async () => {
            // Setup: getContacts returns contact
            mockXero.accountingApi.getContacts.mockResolvedValueOnce({
                body: { contacts: [{ contactID: "existing_con_123", name: "Existing Client" }] }
            });

            const result = await registeredTools["automated_billing_workflow"]({
                clientName: "Existing Client",
                contactEmail: "existing@client.com",
                items: [{ description: "Hosting", quantity: 1, unitAmount: 50 }],
                dueDate: "2025-02-15",
                sendEmail: false
            });

            const json = JSON.parse(result.content[0].text);
            expect(json.status).toBe("success");
            expect(json.logs).toEqual(expect.arrayContaining([
                expect.stringContaining("Found existing Xero contact: existing_con_123")
            ]));

            expect(mockXero.accountingApi.createContacts).not.toHaveBeenCalled();
            expect(mockXero.accountingApi.emailInvoice).not.toHaveBeenCalled(); // sendEmail false
        });

        it("should skip creation if invoice exists (idempotency)", async () => {
            // Setup: getContacts returns contact
            mockXero.accountingApi.getContacts.mockResolvedValueOnce({
                body: { contacts: [{ contactID: "con_123", name: "Client" }] }
            });

            // Setup: getInvoices for overdue check (first call) returns empty
            // Setup: getInvoices for idempotency (second call) returns existing invoice
            mockXero.accountingApi.getInvoices
                .mockResolvedValueOnce({ body: { invoices: [] } }) // overdue
                .mockResolvedValueOnce({
                    body: {
                        invoices: [{ invoiceID: "existing_inv_123", invoiceNumber: "INV-EXISTING" }]
                    }
                });

            const result = await registeredTools["automated_billing_workflow"]({
                clientName: "Client",
                contactEmail: "client@test.com",
                items: [{ description: "Item", quantity: 1, unitAmount: 100 }],
                dueDate: "2025-02-15"
            });

            const json = JSON.parse(result.content[0].text);
            expect(json.invoiceNumber).toBe("INV-EXISTING");
            expect(json.logs).toEqual(expect.arrayContaining([
                expect.stringContaining("Idempotency: Found existing invoice")
            ]));

            expect(mockXero.accountingApi.createInvoices).not.toHaveBeenCalled();
        });

        it("should warn about overdue invoices", async () => {
             // Setup: getContacts returns contact
            mockXero.accountingApi.getContacts.mockResolvedValueOnce({
                body: { contacts: [{ contactID: "con_123", name: "Client" }] }
            });

            // Setup: getInvoices for overdue check returns overdue invoice
            const pastDate = new Date();
            pastDate.setMonth(pastDate.getMonth() - 2);

            // Setup: getInvoices for idempotency (second call) returns empty
             mockXero.accountingApi.getInvoices
                .mockResolvedValueOnce({
                    body: {
                        invoices: [{
                             invoiceID: "overdue_inv",
                             amountDue: 500,
                             dueDate: pastDate.toISOString()
                        }]
                    }
                })
                .mockResolvedValueOnce({ body: { invoices: [] } });

             const result = await registeredTools["automated_billing_workflow"]({
                clientName: "Client",
                contactEmail: "client@test.com",
                items: [{ description: "Item", quantity: 1, unitAmount: 100 }],
                dueDate: "2025-02-15"
            });

             const json = JSON.parse(result.content[0].text);
             expect(json.logs).toEqual(expect.arrayContaining([
                expect.stringContaining("Warning: Client has 1 overdue invoices")
            ]));
        });
    });
});
