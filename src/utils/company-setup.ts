import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { LanceConnector } from "../mcp_servers/brain/lance_connector.js";

export async function setupCompany(name: string, context?: any): Promise<void> {
    const cwd = process.cwd();
    const companyDir = join(cwd, ".agent", "companies", name);
    const dirs = [
        join(companyDir, "brain"),
        join(companyDir, "sops"),
        join(companyDir, "config"),
        join(companyDir, "docs")
    ];

    console.log(`Creating directory structure for company: ${name}...`);
    for (const dir of dirs) {
        if (!existsSync(dir)) {
            await mkdir(dir, { recursive: true });
            console.log(`  Created ${dir}`);
        }
    }

    // Generate company_context.json
    const contextPath = join(companyDir, "config", "company_context.json");
    if (!existsSync(contextPath)) {
        console.log("Generating company_context.json...");
        const templatePath = join(cwd, "templates", "company_context.json.template");
        let content = "";

        if (existsSync(templatePath)) {
            content = await readFile(templatePath, "utf-8");
        } else {
             // Fallback if template missing
             content = JSON.stringify({
                name: "{{COMPANY_NAME}}",
                brand_voice: "Professional",
                key_contacts: [],
                project_goals: [],
                tech_stack: []
             }, null, 2);
        }

        if (context) {
            // If context provided (interactive), merge it
            // Simple replace for now or JSON parse/stringify
             const templateObj = JSON.parse(content.replace("{{COMPANY_NAME}}", name));
             Object.assign(templateObj, context);
             content = JSON.stringify(templateObj, null, 2);
        } else {
             content = content.replace("{{COMPANY_NAME}}", name);
        }

        await writeFile(contextPath, content);
        console.log(`  Created ${contextPath}`);
    }

    // Initialize LanceDB
    console.log("Initializing LanceDB vector store...");
    const brainDir = join(companyDir, "brain");
    try {
        const connector = new LanceConnector(brainDir);
        await connector.connect();
        console.log(`  LanceDB initialized at ${brainDir}`);
    } catch (e: any) {
        console.error(`  Failed to initialize LanceDB: ${e.message}`);
        // Don't fail the whole process? Or maybe should?
        // Let's rethrow to inform caller
        throw e;
    }

    // Update global config
    console.log("Updating global config...");
    const configPath = join(cwd, ".agent", "config.json");
    let config: any = {};
    if (existsSync(configPath)) {
        try {
            config = JSON.parse(await readFile(configPath, "utf-8"));
        } catch (e) {
            console.warn("  Failed to parse existing config. Creating new.");
        }
    } else {
        // Ensure .agent dir exists
        if (!existsSync(join(cwd, ".agent"))) {
             await mkdir(join(cwd, ".agent"), { recursive: true });
        }
    }

    if (!config.companies) {
        config.companies = [];
    }

    if (!config.companies.includes(name)) {
        config.companies.push(name);
        await writeFile(configPath, JSON.stringify(config, null, 2));
        console.log(`  Added ${name} to .agent/config.json`);
    } else {
        console.log(`  Company ${name} already in config.`);
    }

    console.log(`\nCompany ${name} setup complete!`);
}
