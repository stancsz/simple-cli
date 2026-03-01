/**
 * backup_scheduler.ts
 *
 * This script runs the disaster recovery backup process.
 * It is intended to be executed periodically via a cron job or system scheduler.
 */

import { createBackup } from '../src/mcp_servers/disaster_recovery/backup_manager.js';

async function main() {
    console.log(`[${new Date().toISOString()}] Starting scheduled disaster recovery backup...`);

    try {
        const result = await createBackup();

        if (result.success) {
            console.log(`[${new Date().toISOString()}] Backup completed successfully.`);
            console.log(`Path: ${result.backupPath}`);
            console.log(`Checksum: ${result.checksum}`);
            console.log(`Duration: ${result.durationMs}ms`);
            process.exit(0);
        } else {
            console.error(`[${new Date().toISOString()}] Backup failed: ${result.error}`);
            console.error(`Duration: ${result.durationMs}ms`);
            process.exit(1);
        }
    } catch (error: any) {
        console.error(`[${new Date().toISOString()}] Unexpected error during scheduled backup:`, error);
        process.exit(1);
    }
}

main();
