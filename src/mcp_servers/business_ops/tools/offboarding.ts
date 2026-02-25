import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { createLLM } from "../../../llm.js";
import { getHubSpotClient, logNoteToHubSpot, syncDealToHubSpot } from "../crm.js";
import { join } from "path";
import { rename, mkdir, writeFile, rm, readFile, readdir } from "fs/promises";
import { existsSync } from "fs";

// Initialize Brain components
const llm = createLLM();
const episodicMemory = new EpisodicMemory(process.cwd(), llm);

interface ClientConfig {
    clientId: string;
    dealName: string;
}

async function getClientConfig(clientId: string): Promise<ClientConfig> {
    // In a real scenario, we might query HubSpot or a local DB.
    // For now, we assume a convention or try to infer.
    // We can try to read the deal name from the company context if stored.
    // Or just default to clientId.
    return {
        clientId,
        dealName: clientId // Fallback
    };
}

async function updateHubSpotStatus(clientId: string, dealName: string) {
    // 1. Update Deal Stage to Closed Won
    try {
        const result = await syncDealToHubSpot({
            dealname: dealName,
            dealstage: "closedwon",
            closedate: new Date().toISOString()
        });

        // 2. Add Note
        // We need the contact ID. We might need to search for contacts associated with the company.
        // For simplicity, we'll skip the note on contact for now unless we have the contact ID.
        // Or we can search for the deal and add a note to it if the API supports it.
        // syncDealToHubSpot returns the deal ID.

        // However, logNoteToHubSpot takes a contactId.
        // We can't easily add a note to a deal with the current tool unless we modify it.
        // But we can update the deal description or properties.

        return result;
    } catch (e: any) {
        throw new Error(`HubSpot update failed: ${e.message}`);
    }
}

async function archiveData(clientId: string) {
    const companyDir = join(process.cwd(), ".agent", "companies", clientId);
    const archiveDir = join(process.cwd(), ".agent", "archives", clientId);
    const contextArchiveDir = join(archiveDir, "context");

    if (!existsSync(companyDir)) {
        return { status: "skipped", message: `No company directory found for ${clientId}` };
    }

    await mkdir(contextArchiveDir, { recursive: true });

    // Move content
    // We can't just rename if across partitions, but here it's likely same FS.
    // However, rename might fail if directory not empty? No, rename works on directories.
    // But we want to keep the structure in archives.

    // We will rename the company dir to the archive dir/context
    // Note: if contextArchiveDir already exists, we might need to merge or fail.
    // For now, let's assume clean archive or overwrite.

    // Actually, we created `contextArchiveDir`. rename to that path will put the source INSIDE it if it exists?
    // Node fs.rename(old, new) renames `old` to `new`.
    // If `new` exists and is a directory, it might fail or replace.

    // Let's use a safer approach: copy and delete, or rename the parent if possible.
    // We want `.agent/companies/clientId` -> `.agent/archives/clientId/context`

    // If we simply rename `companyDir` to `contextArchiveDir`, it should work if `contextArchiveDir` doesn't exist.
    // But we just created it with mkdir.
    // So we should remove `contextArchiveDir` before rename, or not create it.

    // Let's just create parent `archiveDir` and rename `companyDir` to `contextArchiveDir`.

    // Ensure parent archive dir exists
    await mkdir(archiveDir, { recursive: true });

    // If contextArchiveDir exists, remove it first (overwrite)
    if (existsSync(contextArchiveDir)) {
        await rm(contextArchiveDir, { recursive: true, force: true });
    }

    await rename(companyDir, contextArchiveDir);

    return { status: "success", path: contextArchiveDir };
}

async function generateHandover(clientId: string) {
    const archiveDir = join(process.cwd(), ".agent", "archives", clientId);
    const contextDir = join(archiveDir, "context");

    if (!existsSync(contextDir)) {
         throw new Error("Client data must be archived before generating handover docs.");
    }

    // Initialize CompanyContext on the ARCHIVED directory?
    // CompanyContext usually looks in `.agent/companies/{id}`.
    // We just moved it to `.agent/archives/{id}/context`.
    // We can't use standard CompanyContext class easily unless we mock the path or move it back temporarily?
    // Or we just instantiate LLM and read files manually.

    const docsDir = join(contextDir, "docs");
    let contextText = "";

    if (existsSync(docsDir)) {
        const files = await readdir(docsDir);
        for (const file of files) {
            if (file.endsWith(".md") || file.endsWith(".txt")) {
                const content = await readFile(join(docsDir, file), "utf-8");
                contextText += `\n--- ${file} ---\n${content}\n`;
            }
        }
    }

    if (!contextText) {
        contextText = "No documentation found.";
    }

    // Generate Handover Doc
    const prompt = `
    You are generating a handover document for client '${clientId}'.
    Based on the following project documentation, create a comprehensive 'Handover.md' file.
    Include:
    1. Project Summary
    2. Key Features
    3. Maintenance Guide
    4. Credentials (placeholder - warn to share securely)
    5. Support Contacts

    Context:
    ${contextText.substring(0, 10000)}
    `;

    const response = await llm.generate("You are a professional technical writer.", [{ role: "user", content: prompt }]);
    const handoverContent = response.message;

    const handoverPath = join(archiveDir, "HANDOVER.md");
    await writeFile(handoverPath, handoverContent);

    return { path: handoverPath };
}

export function registerOffboardingTools(server: McpServer) {
    server.tool(
        "initiate_offboarding",
        "Starts the offboarding process: updates CRM status and logs the event.",
        {
            clientId: z.string().describe("Client ID (e.g., 'client-a')."),
            dealName: z.string().optional().describe("HubSpot Deal Name (if different from Client ID).")
        },
        async ({ clientId, dealName }) => {
            try {
                const config = await getClientConfig(clientId);
                const finalDealName = dealName || config.dealName;

                // Update CRM
                const crmResult = await updateHubSpotStatus(clientId, finalDealName);

                // Log to Brain
                await episodicMemory.store(
                    `offboarding-${clientId}`,
                    `Initiate offboarding for ${clientId}`,
                    `Updated HubSpot deal ${finalDealName} to Closed-Won. ID: ${crmResult.id}`,
                    [],
                    clientId
                );

                return {
                    content: [{
                        type: "text",
                        text: `Offboarding initiated for ${clientId}. CRM Updated: ${JSON.stringify(crmResult)}`
                    }]
                };
            } catch (e: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error initiating offboarding: ${e.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    server.tool(
        "archive_client_data",
        "Moves client company context and files to the archive directory.",
        {
            clientId: z.string().describe("Client ID.")
        },
        async ({ clientId }) => {
            try {
                const result = await archiveData(clientId);
                return {
                    content: [{
                        type: "text",
                        text: `Client data archived: ${JSON.stringify(result)}`
                    }]
                };
            } catch (e: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error archiving data: ${e.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    server.tool(
        "generate_handover_documentation",
        "Generates handover documentation based on archived client context.",
        {
            clientId: z.string().describe("Client ID.")
        },
        async ({ clientId }) => {
            try {
                const result = await generateHandover(clientId);
                return {
                    content: [{
                        type: "text",
                        text: `Handover documentation generated at: ${result.path}`
                    }]
                };
            } catch (e: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error generating handover: ${e.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    server.tool(
        "offboarding_workflow",
        "Orchestrates the complete offboarding sequence.",
        {
            clientId: z.string().describe("Client ID."),
            dealName: z.string().optional().describe("HubSpot Deal Name.")
        },
        async ({ clientId, dealName }) => {
            const logs: string[] = [];
            try {
                logs.push(`Starting offboarding for ${clientId}...`);

                // 1. Initiate
                const initResult = await updateHubSpotStatus(clientId, dealName || clientId);
                logs.push(`CRM Updated: ${initResult.id}`);

                // 2. Archive
                const archiveResult = await archiveData(clientId);
                logs.push(`Data Archived: ${JSON.stringify(archiveResult)}`);

                // 3. Generate Handover
                const handoverResult = await generateHandover(clientId);
                logs.push(`Handover Generated: ${handoverResult.path}`);

                // 4. Final Log
                await episodicMemory.store(
                    `offboarding-${clientId}`,
                    `Complete Offboarding Workflow`,
                    `Completed all steps for ${clientId}.`,
                    [handoverResult.path],
                    clientId
                );

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: "success",
                            logs
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
                            logs
                        }, null, 2)
                    }],
                    isError: true
                };
            }
        }
    );
}
