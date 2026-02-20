import { Scheduler } from '../scheduler.js';
import { join } from 'path';

// This script runs from project root usually
const AGENT_DIR = process.env.JULES_AGENT_DIR || join(process.cwd(), '.agent');

async function main() {
    console.log('[SchedulerService] Starting Scheduler process...');
    try {
        const scheduler = new Scheduler(AGENT_DIR);
        await scheduler.start();
        console.log('[SchedulerService] Scheduler started.');

        // Keep process alive (scheduler creates cron jobs but main loop might exit if nothing else)
        // Cron jobs use setTimeout which keeps event loop alive, but having a setInterval is safe.
        setInterval(() => {}, 1000 * 60);

        // Handle graceful shutdown
        const shutdown = async () => {
             console.log('[SchedulerService] Stopping...');
             await scheduler.stop();
             process.exit(0);
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);

    } catch (e) {
        console.error('[SchedulerService] Fatal error:', e);
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
