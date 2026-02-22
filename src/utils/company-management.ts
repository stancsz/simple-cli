import { rename, mkdir } from "fs/promises";
import { join } from "path";
import { Config, saveConfig } from "../config.js";

export async function archiveCompanyLogic(cwd: string, config: Config, name: string) {
    const companyDir = join(cwd, ".agent", "companies", name);
    const archiveDir = join(cwd, ".agent", "archive", "companies", name);

    await mkdir(join(cwd, ".agent", "archive", "companies"), { recursive: true });
    await rename(companyDir, archiveDir);

    config.companies = config.companies?.filter(c => c !== name) || [];
    if (!config.archived_companies) config.archived_companies = [];
    config.archived_companies.push(name);

    if (config.active_company === name) {
        config.active_company = undefined;
    }

    await saveConfig(config, cwd);
}
