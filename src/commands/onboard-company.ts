import { intro, outro, text, isCancel, cancel } from "@clack/prompts";
import { MCP } from "../mcp.js";
import { createLLM } from "../llm.js";
import { SOPExecutor } from "../mcp_servers/sop_engine/executor.js";
import { join } from "path";
import { readFile } from "fs/promises";
import { parseSOP } from "../mcp_servers/sop_engine/sop_parser.js";
import { existsSync } from "fs";

export async function onboardCompany(companyName?: string) {
    intro(`Simple CLI - Company Onboarding Automation`);

    let name = companyName;

    if (!name) {
        const nameInput = await text({
            message: 'What is the company name?',
            placeholder: 'acme-corp',
            validate(value) {
                if (value.length === 0) return `Value is required!`;
                if (!/^[a-zA-Z0-9_-]+$/.test(value)) return `Only letters, numbers, dashes, and underscores are allowed.`;
            },
        });

        if (isCancel(nameInput)) {
            cancel('Operation cancelled.');
            return;
        }
        name = nameInput as string;
    }

    try {
        console.log(`Starting onboarding for company: ${name}...`);

        const llm = createLLM();
        const mcp = new MCP();
        await mcp.init();

        // Pre-start essential servers for onboarding to ensure tools are available
        // 'company' provides init_company, validate_onboarding
        // 'scheduler' provides scheduler_add_task
        // 'brain' provides brain_store
        // 'sop_engine' provides sop_create
        const serversToStart = ["company", "scheduler", "brain", "sop_engine", "health_monitor"];
        for (const s of serversToStart) {
            try {
                if (!mcp.isServerRunning(s)) {
                    await mcp.startServer(s);
                }
            } catch (e) {
                console.warn(`Warning: Failed to auto-start server '${s}':`, e);
            }
        }

        // Find the SOP file
        const sopName = "onboarding_new_company.md";
        let sopPath = join(process.cwd(), "sops", sopName);
        if (!existsSync(sopPath)) {
            sopPath = join(process.cwd(), "docs", "sops", sopName);
        }

        if (!existsSync(sopPath)) {
            cancel(`SOP file '${sopName}' not found.`);
            return;
        }

        const content = await readFile(sopPath, "utf-8");
        const sop = parseSOP(content);

        const executor = new SOPExecutor(llm, mcp);
        const result = await executor.execute(sop, name as string);

        console.log("\nOnboarding SOP execution completed.");
        // console.log(result); // Result is already logged by executor or effectively summarized

        outro(`Company '${name}' onboarding process finished! Check the report in .agent/companies/${name}/onboarding_report.md`);

    } catch (e: any) {
        cancel(`Failed to onboard company: ${e.message}`);
    }
}
