import { mkdir, readFile, writeFile, copyFile, readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { LanceConnector } from "../mcp_servers/brain/lance_connector.js";

async function copyDir(src: string, dest: string) {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = join(src, entry.name);
        const destPath = join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        } else {
            await copyFile(srcPath, destPath);
        }
    }
}

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

    // Copy templates
    const templateDir = join(cwd, "templates", "company_onboarding");
    if (existsSync(templateDir)) {
        console.log("Copying onboarding templates...");
        try {
            if (existsSync(join(templateDir, "default_sops"))) {
                await copyDir(join(templateDir, "default_sops"), join(companyDir, "sops"));
            }
            if (existsSync(join(templateDir, "default_brain_config.json"))) {
                await copyFile(join(templateDir, "default_brain_config.json"), join(companyDir, "brain", "config.json"));
            }
            if (existsSync(join(templateDir, "default_persona.json"))) {
                 await copyFile(join(templateDir, "default_persona.json"), join(companyDir, "config", "persona.json"));
            }
        } catch (e: any) {
            console.warn(`Warning: Failed to copy some templates: ${e.message}`);
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

    let updated = false;
    if (!config.companies.includes(name)) {
        config.companies.push(name);
        updated = true;
        console.log(`  Added ${name} to .agent/config.json`);
    }

    // Always switch to the newly created/setup company
    config.active_company = name;
    updated = true;
    console.log(`  Set active company to ${name}`);

    if (updated) {
        await writeFile(configPath, JSON.stringify(config, null, 2));
    } else {
        console.log(`  Company ${name} already in config.`);
    }

    console.log(`\nCompany ${name} setup complete!`);
}
