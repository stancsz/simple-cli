import { intro, outro, text, confirm, isCancel, cancel, select } from "@clack/prompts";
import { readFile, writeFile, rename, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { loadConfig, Config, saveConfig } from "../config.js";
import pc from "picocolors";

export async function companyCommand(subcommand: string, ...args: string[]) {
    intro(`Simple CLI - Company Management`);
    const cwd = process.cwd();
    let config = await loadConfig(cwd);

    if (!config.companies) config.companies = [];
    if (!config.archived_companies) config.archived_companies = [];

    switch (subcommand) {
        case "list":
            await listCompanies(config);
            break;
        case "switch":
            await switchCompany(cwd, config, args[0]);
            break;
        case "archive":
            await archiveCompany(cwd, config, args[0]);
            break;
        case "status":
            await showStatus(config, args[0]);
            break;
        default:
            cancel(`Unknown subcommand: ${subcommand}`);
            break;
    }
    outro("Done.");
}

async function listCompanies(config: Config) {
    console.log(pc.bold("\nActive Companies:"));
    if (config.companies && config.companies.length > 0) {
        for (const c of config.companies) {
            const active = c === config.active_company ? pc.green(" (active)") : "";
            console.log(`  - ${c}${active}`);
        }
    } else {
        console.log(pc.dim("  No active companies."));
    }

    if (config.archived_companies && config.archived_companies.length > 0) {
        console.log(pc.bold("\nArchived Companies:"));
        for (const c of config.archived_companies) {
            console.log(pc.dim(`  - ${c}`));
        }
    }
}

async function switchCompany(cwd: string, config: Config, name?: string) {
    if (!name) {
        const options = (config.companies || []).map(c => ({ value: c, label: c }));
        if (options.length === 0) {
            cancel("No companies available to switch to.");
            return;
        }

        const selected = await select({
            message: "Select a company to switch to:",
            options,
        });

        if (isCancel(selected)) {
            cancel("Operation cancelled.");
            return;
        }
        name = selected as string;
    }

    if (!config.companies?.includes(name)) {
        cancel(`Company '${name}' not found.`);
        return;
    }

    config.active_company = name;
    await saveConfig(config, cwd);
    console.log(pc.green(`Switched active company to: ${name}`));
}

async function archiveCompany(cwd: string, config: Config, name?: string) {
     if (!name) {
        const options = (config.companies || []).map(c => ({ value: c, label: c }));
        if (options.length === 0) {
            cancel("No companies available to archive.");
            return;
        }

        const selected = await select({
            message: "Select a company to archive:",
            options,
        });

        if (isCancel(selected)) {
            cancel("Operation cancelled.");
            return;
        }
        name = selected as string;
    }

    if (!config.companies?.includes(name)) {
        cancel(`Company '${name}' not found.`);
        return;
    }

    if (name === config.active_company) {
        const confirmArchive = await confirm({
            message: `Company '${name}' is currently active. Are you sure you want to archive it?`,
        });
        if (isCancel(confirmArchive) || !confirmArchive) {
            cancel("Operation cancelled.");
            return;
        }
        config.active_company = undefined;
    }

    const companyDir = join(cwd, ".agent", "companies", name);
    const archiveDir = join(cwd, ".agent", "archive", "companies", name);

    // Ensure archive parent dir exists
    await mkdir(join(cwd, ".agent", "archive", "companies"), { recursive: true });

    try {
        await rename(companyDir, archiveDir);
    } catch (e: any) {
        cancel(`Failed to move company directory: ${e.message}`);
        return;
    }

    config.companies = config.companies.filter(c => c !== name);
    if (!config.archived_companies) config.archived_companies = [];
    config.archived_companies.push(name);

    await saveConfig(config, cwd);
    console.log(pc.green(`Archived company '${name}' to ${archiveDir}`));
}

async function showStatus(config: Config, name?: string) {
    const target = name || config.active_company;
    if (!target) {
        console.log("No active company.");
        return;
    }

    const isActive = config.companies?.includes(target);
    const isArchived = config.archived_companies?.includes(target);

    if (!isActive && !isArchived) {
        console.log(`Company '${target}' not found.`);
        return;
    }

    console.log(pc.bold(`Company: ${target}`));
    console.log(`Status: ${isActive ? pc.green("Active") : pc.dim("Archived")}`);
    if (target === config.active_company) {
        console.log(pc.cyan("Currently selected context."));
    }
}
