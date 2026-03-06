import { EpisodicMemory } from "../../../brain/episodic.js";
import { createLLM } from "../../../llm.js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { globalBatchExecutor } from "../../../batch/batch_orchestrator.js";
import { TaskDefinition } from "../../../interfaces/daemon.js";
import { CronExpressionParser } from 'cron-parser';

export async function executeBatchRoutines(episodic: EpisodicMemory, company?: string) {
    // 1. Load Scheduler Config
    const scheduleFile = process.env.JULES_AGENT_DIR
      ? join(process.env.JULES_AGENT_DIR, "scheduler.json")
      : join(process.cwd(), ".agent", "scheduler.json");

    if (!existsSync(scheduleFile)) {
        return { status: "success", message: "No scheduler configuration found.", tasks_batched: 0 };
    }

    const content = readFileSync(scheduleFile, "utf-8");
    const config = JSON.parse(content);
    const tasks: TaskDefinition[] = config.tasks || [];

    // 2. Identify due routine tasks for the company
    const now = new Date();
    // A task is considered "due" if it should run within a 1-hour window (or based on last execution).
    // For simplicity, since this is manually triggered batched execution, we check if a cron interval
    // overlaps closely with the current time, or if the user forces it.
    // However, the best approach for "due" is verifying if `now` is past its next execution tick.
    const routineTasks = tasks.filter(t => {
        if (!t.is_routine) return false;
        if (company && t.company !== company) return false;

        // If it's a cron task, check if it's due
        if (t.trigger === 'cron' && t.schedule) {
            try {
                // If it was supposed to run in the last hour, we consider it due for this batch
                const interval = CronExpressionParser.parse(t.schedule, { currentDate: new Date(now.getTime() - 60 * 60 * 1000) });
                const nextDate = interval.next().toDate();
                if (nextDate.getTime() <= now.getTime()) {
                    return true;
                }
            } catch (err) {
                // Invalid cron, skip
            }
            return false;
        }

        return true;
    });

    if (routineTasks.length === 0) {
         return { status: "success", message: "No routine tasks currently due to batch.", tasks_batched: 0 };
    }

    // 3. Enqueue them into the BatchOrchestrator
    const promises = routineTasks.map(t => globalBatchExecutor.enqueue(t));

    // 4. Force processing immediately since this is explicitly requested
    await globalBatchExecutor.forceProcess();

    // 5. Await results
    const results = await Promise.all(promises);

    // Filter results to check statuses
    const successful = results.filter(r => r.status === 'success');
    const failed = results.filter(r => r.status === 'failed');

    return {
        status: failed.length === 0 ? "success" : "partial_success",
        tasks_batched: routineTasks.length,
        successful: successful.length,
        failed: failed.length,
        details: results
    };
}
