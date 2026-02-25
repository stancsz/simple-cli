import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Client as HubSpotClient } from "@hubspot/api-client";
import { fetchLinear } from "./project_management.js";
import { getXeroClient, getTenantId } from "./xero_tools.js";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir, readFile } from "fs/promises";
import { join } from "path";

const execAsync = promisify(exec);

// Helper to get HubSpot Client
const getHubSpotClient = () => {
    const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!accessToken) {
        throw new Error("HUBSPOT_ACCESS_TOKEN environment variable is not set.");
    }
    return new HubSpotClient({ accessToken });
};

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
                try {
                    const hubspot = getHubSpotClient();

                    // Create Company
                    const companyProps: any = { name: clientName };
                    if (domain) companyProps.domain = domain;

                    const companyResp = await hubspot.crm.companies.basicApi.create({
                        properties: companyProps,
                        associations: []
                    });
                    companyId = companyResp.id;
                    logs.push(`Created HubSpot Company: ${companyId}`);

                    // Create Contact
                    const nameParts = contactName.split(' ');
                    const firstname = nameParts[0];
                    const lastname = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;

                    const contactProps: any = {
                        email: contactEmail,
                        firstname,
                        company: clientName
                    };
                    if (lastname) contactProps.lastname = lastname;

                    const contactResp = await hubspot.crm.contacts.basicApi.create({
                        properties: contactProps,
                        associations: []
                    });
                    contactId = contactResp.id;
                    logs.push(`Created HubSpot Contact: ${contactId}`);

                } catch (e: any) {
                    errors.push(`CRM Error: ${e.message}`);
                    throw e;
                }

                // 3. Project Setup (Linear)
                try {
                    const teamId = process.env.LINEAR_TEAM_ID;
                    if (!teamId) {
                        logs.push("Skipping Linear setup: LINEAR_TEAM_ID not set.");
                    } else {
                        const title = `Onboard Client: ${clientName}`;
                        let description = `Service Type: ${serviceType}\nContact: ${contactName} <${contactEmail}>\nProject Value: $${projectValue}\n\n**Phases & Tasks:**\n`;

                        if (template && template.projectTemplate && template.projectTemplate.phases) {
                             description += `**Template: ${template.projectTemplate.title}**\n`;
                             template.projectTemplate.phases.forEach((phase: any) => {
                                description += `\n### ${phase.name}\n`;
                                phase.tasks.forEach((task: string) => {
                                    description += `- [ ] ${task}\n`;
                                });
                            });
                        } else {
                            description += `- [ ] Initial Meeting\n- [ ] Contract Signed\n- [ ] Access Grant`;
                        }

                        const issueData = await fetchLinear(`
                            mutation IssueCreate($input: IssueCreateInput!) {
                                issueCreate(input: $input) {
                                    success
                                    issue {
                                        id
                                        title
                                        url
                                    }
                                }
                            }
                        `, { input: { title, teamId, description } });

                        if (issueData.issueCreate.success) {
                             logs.push(`Created Linear Issue: ${issueData.issueCreate.issue.url}`);
                        }
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
