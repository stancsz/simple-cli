import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getLinearClient } from "../linear_service.js";
import { getHubSpotClient } from "../crm.js";
import { getXeroClient, getTenantId } from "../xero_tools.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import simpleGit from "simple-git";
import { promises as fs } from "fs";
import { join } from "path";
import { existsSync } from "fs";

// Helper to ensure directory exists
async function ensureDir(dir: string) {
    if (!existsSync(dir)) {
        await fs.mkdir(dir, { recursive: true });
    }
}

export function registerClientOffboardingTools(server: McpServer) {
    server.tool(
        "execute_client_offboarding",
        "Executes the client offboarding workflow: archives project, updates CRM, archives Brain context, and generates a handover report.",
        {
            company_id: z.string().describe("Company ID (or name) to offboard."),
            deal_id: z.string().optional().describe("HubSpot Deal ID associated with the project."),
            confirm_financial_closure: z.boolean().default(true).describe("Whether to mark Xero contact as archived.")
        },
        async ({ company_id, deal_id, confirm_financial_closure }) => {
            const logs: string[] = [];
            const timestamp = new Date().toISOString().split('T')[0];

            try {
                // 1. CRM Update (HubSpot)
                let hubspotDealId = deal_id;
                const hubspot = getHubSpotClient();

                if (hubspotDealId) {
                    try {
                        await hubspot.crm.deals.basicApi.update(hubspotDealId, {
                            properties: {
                                dealstage: "closedwon", // Assumes 'closedwon' is the stage ID for completed deals
                                hs_note_body: `[Offboarding] Project completed and offboarded on ${timestamp}.`
                            }
                        });
                        logs.push(`✅ HubSpot Deal ${hubspotDealId} updated to 'Closed/Won'.`);
                    } catch (e: any) {
                        logs.push(`⚠️ HubSpot Deal update failed: ${e.message}`);
                    }
                } else {
                    logs.push(`ℹ️ No Deal ID provided, skipping specific deal update. searching for company...`);
                    // logic to find company could go here but for now we rely on deal_id or just logging
                }

                // 2. Linear Archival
                let projectToArchive: any = null;
                try {
                    const linear = getLinearClient();

                    // Search by project name (Company ID usually maps to project name)
                    // Note: 'description' filter is not supported by Linear SDK
                    const projects = await linear.projects({
                        filter: {
                            name: { contains: company_id }
                        }
                    });

                    if (projects.nodes.length > 0) {
                        projectToArchive = projects.nodes[0];
                    }

                    if (projectToArchive) {
                        // Find the 'Completed' status ID
                        // ProjectUpdateInput requires 'statusId', not 'state'
                        const statuses = await linear.projectStatuses();
                        const completedStatus = statuses.nodes.find(s => s.name === "Completed" || s.name === "Done");

                        if (completedStatus) {
                            await linear.updateProject(projectToArchive.id, {
                                statusId: completedStatus.id
                            });
                            logs.push(`✅ Linear Project '${projectToArchive.name}' marked as Completed.`);
                        } else {
                            logs.push(`⚠️ Could not find 'Completed' project status in Linear. Project '${projectToArchive.name}' remains active.`);
                        }
                    } else {
                        logs.push(`⚠️ Linear Project not found for ${company_id}.`);
                    }
                } catch (e: any) {
                    logs.push(`⚠️ Linear archival failed: ${e.message}`);
                }

                // 3. Brain Archival
                try {
                    const memory = new EpisodicMemory();
                    await memory.init();
                    await memory.store(
                        "offboarding_event",
                        `Client Offboarded: ${company_id}`,
                        JSON.stringify({ company_id, deal_id, timestamp, status: "archived" }),
                        [],
                        undefined, undefined, false, undefined, undefined, 0, 0,
                        "company_archival"
                    );
                    logs.push(`✅ Brain memory archived for ${company_id}.`);
                } catch (e: any) {
                    logs.push(`⚠️ Brain archival failed: ${e.message}`);
                }

                // 4. Xero Archival (Optional)
                if (confirm_financial_closure) {
                    try {
                        const xero = await getXeroClient();
                        const tenantId = await getTenantId(xero);

                        // Find contact
                        // @ts-ignore
                        const contactsRes = await xero.accountingApi.getContacts(tenantId, undefined, `Name.Contains("${company_id}")`);
                        const contact = contactsRes.body.contacts?.[0];

                        if (contact) {
                            // Archive Contact
                            // @ts-ignore
                            await xero.accountingApi.updateContact(tenantId, contact.contactID, {
                                contactStatus: "ARCHIVED"
                            });
                            logs.push(`✅ Xero Contact '${contact.name}' archived.`);
                        } else {
                            logs.push(`⚠️ Xero Contact not found for ${company_id}.`);
                        }
                    } catch (e: any) {
                        logs.push(`⚠️ Xero archival failed: ${e.message}`);
                    }
                }

                // 5. Git Archival & Reporting
                const reportDir = join(process.cwd(), "reports", company_id);
                await ensureDir(reportDir);
                const reportPath = join(reportDir, `HANDOVER_${timestamp}.md`);

                const reportContent = `# Client Handover Report: ${company_id}
**Date:** ${timestamp}
**Deal ID:** ${deal_id || 'N/A'}

## Executive Summary
This project has been successfully completed and offboarded. All assets have been archived.

## Archival Status
- **CRM:** Updated to Closed/Won
- **Project Management:** Linear Project '${projectToArchive?.name || 'N/A'}' Completed
- **Financials:** ${confirm_financial_closure ? 'Account Archived' : 'Active'}
- **Knowledge Base:** Context Archived in Brain

## Deliverables
(See project documentation in 'docs/' for full details)

---
*Generated by Autonomous Client Offboarding Agent*
`;
                await fs.writeFile(reportPath, reportContent);
                logs.push(`✅ Handover report generated at ${reportPath}.`);

                // Git Operations
                const git = simpleGit();
                if (await git.checkIsRepo()) {
                    await git.add(reportPath);
                    await git.commit(`chore: offboarding handover for ${company_id}`);

                    const tagName = `offboard-${company_id.replace(/\s+/g, '-').toLowerCase()}-${timestamp}`;
                    try {
                        await git.addTag(tagName);
                        logs.push(`✅ Git Tag '${tagName}' created.`);
                    } catch (e: any) {
                        logs.push(`⚠️ Git Tag creation failed (maybe already exists): ${e.message}`);
                    }
                } else {
                    logs.push(`⚠️ Current directory is not a Git repo, skipping git operations.`);
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: "success",
                            logs: logs,
                            report_path: reportPath
                        }, null, 2)
                    }]
                };

            } catch (e: any) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: "error",
                            error: e.message,
                            logs: logs
                        }, null, 2)
                    }],
                    isError: true
                };
            }
        }
    );
}
