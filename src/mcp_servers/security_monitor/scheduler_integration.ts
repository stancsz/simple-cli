import { existsSync } from "fs";
import { join, dirname } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import lockfile from "proper-lockfile";

export async function addScheduledScan() {
    const scheduleFile = process.env.JULES_AGENT_DIR
      ? join(process.env.JULES_AGENT_DIR, "scheduler.json")
      : join(process.cwd(), ".agent", "scheduler.json");

    try {
        const dir = dirname(scheduleFile);
        if (!existsSync(dir)) {
            await mkdir(dir, { recursive: true });
        }

        let release: (() => Promise<void>) | undefined;
        try {
            if (existsSync(scheduleFile)) {
                release = await lockfile.lock(scheduleFile, { retries: 5 });
            }
        } catch (e) {
            // Lock failed, continue
        }

        let config: any = { tasks: [] };
        if (existsSync(scheduleFile)) {
            try {
                const content = await readFile(scheduleFile, "utf-8");
                config = JSON.parse(content);
            } catch {
                // corrupted, start fresh
            }
        }

        if (!config.tasks) config.tasks = [];

        const scanTaskId = "security-scan-daily";
        const idx = config.tasks.findIndex((t: any) => t.id === scanTaskId);

        const task = {
            id: scanTaskId,
            name: "Daily Security Dependency Scan",
            trigger: "cron",
            schedule: "0 0 * * *", // midnight
            prompt: "Scan dependencies for vulnerabilities and monitor API activity for anomalies."
        };

        if (idx >= 0) {
            config.tasks[idx] = task;
        } else {
            config.tasks.push(task);
        }

        await writeFile(scheduleFile, JSON.stringify(config, null, 2));

        if (release) await release();
    } catch (e: any) {
        console.error("Failed to add scheduled scan task:", e);
    }
}