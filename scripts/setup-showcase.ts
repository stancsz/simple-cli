import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFile, copyFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { setupCompany } from '../src/utils/company-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
    console.log("🚀 Setting up Showcase Corp...");

    const agentDir = process.env.JULES_AGENT_DIR || join(process.cwd(), '.agent');
    const demoDir = resolve(__dirname, '../demos/simple-cli-showcase');
    const companyName = 'showcase-corp';

    // 1. Setup Company Context (Directories & Registration)
    console.log("Step 1: Initializing Company Context...");
    // We call setupCompany to create directories and register the company in config.json
    // We pass an empty context initially because we'll overwrite the file with the exact demo context later.
    await setupCompany(companyName, {});

    // Overwrite company_context.json with the one from the demo
    const contextSrc = join(demoDir, 'company_context.json');
    const contextDest = join(agentDir, 'companies', companyName, 'config', 'company_context.json');

    if (existsSync(contextSrc)) {
        await copyFile(contextSrc, contextDest);
        console.log(`  Imported company_context.json from ${contextSrc}`);
    } else {
        console.warn(`Warning: Context file not found at ${contextSrc}`);
    }

    // 2. Copy SOPs
    console.log("Step 2: Installing SOPs...");
    const sopSrc = join(demoDir, 'docs', 'sops', 'showcase_sop.md');
    const sopDestDir = join(agentDir, 'companies', companyName, 'sops');
    const sopDest = join(sopDestDir, 'showcase_sop.md');

    if (existsSync(sopSrc)) {
        await mkdir(sopDestDir, { recursive: true });
        await copyFile(sopSrc, sopDest);
        console.log(`  Copied showcase_sop.md to ${sopDest}`);
    } else {
        console.warn(`Warning: SOP file not found at ${sopSrc}`);
    }

    // 3. Update Scheduler
    console.log("Step 3: Configuring Scheduler...");
    const schedulerConfigPath = join(agentDir, 'scheduler.json');
    let schedulerConfig: any = { tasks: [] };

    if (existsSync(schedulerConfigPath)) {
        try {
            schedulerConfig = JSON.parse(await readFile(schedulerConfigPath, 'utf-8'));
        } catch (e) {
            console.warn("  Failed to parse existing scheduler config. Creating new.");
        }
    }

    if (!schedulerConfig.tasks) {
        schedulerConfig.tasks = [];
    }

    const demoSchedulerPath = join(demoDir, 'scheduler.json');
    if (existsSync(demoSchedulerPath)) {
        try {
            const demoScheduler = JSON.parse(await readFile(demoSchedulerPath, 'utf-8'));
            if (demoScheduler.tasks) {
                for (const task of demoScheduler.tasks) {
                    // Check if task exists (by ID)
                    const existingTaskIndex = schedulerConfig.tasks.findIndex((t: any) => t.id === task.id);
                    if (existingTaskIndex !== -1) {
                        console.log(`  Updating existing task: ${task.name}`);
                        schedulerConfig.tasks[existingTaskIndex] = task;
                    } else {
                        console.log(`  Adding new task: ${task.name}`);
                        schedulerConfig.tasks.push(task);
                    }
                }
            }
        } catch (e) {
             console.warn(`Warning: Failed to read demo scheduler from ${demoSchedulerPath}:`, e);
        }
    } else {
         console.warn(`Warning: Demo scheduler file not found at ${demoSchedulerPath}`);
    }

    await writeFile(schedulerConfigPath, JSON.stringify(schedulerConfig, null, 2));
    console.log(`  Updated ${schedulerConfigPath}`);

    console.log("\n✅ Showcase Corp setup complete!");
    console.log("You can now switch to the company context using:");
    console.log("  simple company switch showcase-corp");
}

main().catch(console.error);
