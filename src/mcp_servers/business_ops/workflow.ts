import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getXeroClient, getTenantId } from "./xero_tools.js";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir, readFile } from "fs/promises";
import { join } from "path";
import { syncCompanyToHubSpot, syncContactToHubSpot, syncDealToHubSpot } from "./crm.js";
import { syncDeal } from "./linear_service.js";

const execAsync = promisify(exec);

export function registerWorkflowTools(server: McpServer) {
    server.tool(
        "client_onboarding_workflow",
        "Orchestrates the end-to-end onboarding workflow for a new client.",
        {
            clientName: z.string().describe("Name of the client company."),
            contactEmail: z.string().email().describe("Primary contact email."),
            contactName: z.string().describe("Primary contact name."),
            serviceType: z.enum(["web_dev", "consulting", "marketing"]).describe("Type of service provided."),
            domain: z.string().optional().describe("Client domain name."),
            projectValue: z.number().optional().default(1000).describe("Total project value for calculating deposit.")
        },
        async ({ clientName, contactEmail, contactName, serviceType, domain, projectValue }) => {
            const logs: string[] = [];
            const errors: string[] = [];

            // Read Template
            let template: any;
            try {
                const templatePath = join(process.cwd(), "docs", "business_playbooks", "client_onboarding_templates", `${serviceType}.json`);
                const content = await readFile(templatePath, "utf-8");
                template = JSON.parse(content);
                logs.push(`Loaded configuration for ${serviceType}`);
            } catch (e) {
                logs.push(`Warning: Could not load template for ${serviceType}, using defaults.`);
            }

            try {
                // 1. Intake & Company Context Creation
                logs.push(`Starting onboarding for ${clientName} (${serviceType})...`);

                // Use the CLI to onboard the company (creates folders, settings, etc.)
                const safeName = clientName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
                try {
                    // Assuming running from root.
                    // We use npx tsx to ensure we can run TS files.
                    logs.push(`Executing: npx tsx src/cli.ts onboard-company ${safeName}`);
                    await execAsync(`npx tsx src/cli.ts onboard-company ${safeName}`);
                    logs.push("Company context created successfully.");
                } catch (e: any) {
                    throw new Error(`Failed to create company context: ${e.message}`);
                }

                // 2. CRM Creation (HubSpot)
                let companyId: string | undefined;
                let contactId: string | undefined;
                let dealId: string | undefined;

                try {
                    // Sync Company
                    const companyProps: any = { name: clientName };
                    if (domain) companyProps.domain = domain;

                    const companyResult = await syncCompanyToHubSpot(companyProps);
                    companyId = companyResult.id;
                    logs.push(`${companyResult.action === 'created' ? 'Created' : 'Updated'} HubSpot Company: ${companyId}`);

                    // Sync Contact
                    const nameParts = contactName.split(' ');
                    const firstname = nameParts[0];
                    const lastname = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;

                    const contactProps: any = {
                        email: contactEmail,
                        firstname,
                        company: clientName
                    };
                    if (lastname) contactProps.lastname = lastname;

                    const contactResult = await syncContactToHubSpot(contactProps);
                    contactId = contactResult.id;
                    logs.push(`${contactResult.action === 'created' ? 'Created' : 'Updated'} HubSpot Contact: ${contactId}`);

                    // Sync Deal
                    const dealProps: any = {
                        dealname: `${clientName} - ${serviceType}`,
                        amount: projectValue.toString(),
                        pipeline: "default",
                        dealstage: "appointmentscheduled"
                    };
                    const dealResult = await syncDealToHubSpot(dealProps);
                    dealId = dealResult.id;
                    logs.push(`${dealResult.action === 'created' ? 'Created' : 'Updated'} HubSpot Deal: ${dealId}`);

                } catch (e: any) {
                    errors.push(`CRM Error: ${e.message}`);
                    throw e;
                }

                // 3. Project Setup (Linear)
                try {
                    if (dealId) {
                        const syncResult = await syncDeal(
                            dealId,
                            clientName, // Using Client Name as Deal Name proxy for Project Name
                            projectValue,
                            "appointmentscheduled"
                        );

                        syncResult.logs.forEach(log => logs.push(log));
                        logs.push(`Linear Project Synced: ${syncResult.project.url}`);
                    } else {
                        logs.push("Skipping Linear setup: No Deal ID available.");
                    }
                } catch (e: any) {
                    errors.push(`Linear Error: ${e.message}`);
                }

                // 4. Financial Setup (Xero)
                try {
                    const xero = await getXeroClient();
                    const tenantId = await getTenantId(xero);

                    // Create Contact
                    const xeroContactResp = await xero.accountingApi.createContacts(tenantId, {
                        contacts: [{
                            name: clientName,
                            emailAddress: contactEmail
                        }]
                    });

                    const xeroContactId = xeroContactResp.body.contacts?.[0]?.contactID;
                    logs.push(`Created Xero Contact: ${xeroContactId}`);

                    if (xeroContactId) {
                        let depositAmount = projectValue;
                        let desc = `Initial Deposit for ${serviceType} services`;

                        if (template && template.financial) {
                            const percent = template.financial.depositPercentage !== undefined ? template.financial.depositPercentage : 50;
                            depositAmount = (projectValue * percent) / 100;
                            desc = `${percent}% Deposit for ${serviceType} services`;
                        }

                        // Create Draft Invoice
                        const invoiceResp = await xero.accountingApi.createInvoices(tenantId, {
                            invoices: [{
                                type: "ACCREC" as any,
                                contact: { contactID: xeroContactId },
                                date: new Date().toISOString().split('T')[0],
                                status: "DRAFT" as any,
                                lineItems: [{
                                    description: desc,
                                    quantity: 1,
                                    unitAmount: depositAmount
                                }]
                            }]
                        });
                         logs.push(`Created Xero Invoice: ${invoiceResp.body.invoices?.[0]?.invoiceNumber}`);
                    }

                } catch (e: any) {
                     errors.push(`Xero Error: ${e.message}`);
                }

                // 5. Documentation
                try {
                    // Create a welcome file in the company folder
                    const companyDir = join(process.cwd(), ".agent", "companies", safeName);
                    // Ensure dir exists
                    await mkdir(companyDir, { recursive: true });

                    const welcomeContent = `# Welcome ${clientName}\n\nService: ${serviceType}\nContact: ${contactName}\n\n## Onboarding Checklist\n- [x] Context Created\n- [x] CRM Record\n- [ ] Kickoff Call`;

                    await writeFile(join(companyDir, "welcome.md"), welcomeContent);
                    logs.push(`Created welcome.md in ${companyDir}`);

                } catch (e: any) {
                    errors.push(`Docs Error: ${e.message}`);
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: "success",
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
