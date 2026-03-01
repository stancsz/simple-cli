# Disaster Recovery Procedure

This document outlines the exact, step-by-step procedure to recover the system state within the **1-hour SLA** following a partial or complete data loss scenario.

## Prerequisites
Before initiating a recovery, ensure you have the following ready:
1. **Node.js runtime** configured.
2. The **BACKUP_ENCRYPTION_KEY** (Ensure it is either in your environment variables or in `.env.agent`). This key is mandatory as all backups are secured with AES-256-GCM encryption.
3. Access to the backup storage (Local filesystem at `.agent/backups/` or the configured S3 bucket if applicable).

## Recovery Steps

### Step 1: Locate the Target Backup (0-5 minutes)
Determine which backup archive you want to restore. Backups are named by timestamp.
If you are restoring from S3, download the archive to the host machine.
You will need the `.enc` backup file and its expected checksum (found in system logs from when the backup was created).

### Step 2: Clear Corrupted State (Optional, 0-5 minutes)
To prevent conflicts and ensure clean restoration, consider clearing the corrupted active directories if the environment was only partially compromised.
```bash
# WARNING: This deletes the active state. Only run if you are about to immediately restore.
rm -rf .agent/brain
rm -rf .agent/companies
```

### Step 3: Execute Restoration Script (5-45 minutes)
We provide an automated restoration interface via the `disaster_recovery` MCP. However, in a full loss scenario, you can trigger the restore programmatically or via a quick script:

```ts
// scripts/quick_restore.ts
import { restoreBackup } from './src/mcp_servers/disaster_recovery/backup_manager.js';

async function run() {
    const backupPath = process.argv[2];
    const expectedChecksum = process.argv[3]; // optional

    if (!backupPath) {
        console.error("Usage: tsx quick_restore.ts <path_to_backup.enc> [checksum]");
        process.exit(1);
    }

    console.log(`Starting restore from ${backupPath}...`);
    const result = await restoreBackup(backupPath, expectedChecksum);

    if (result.success) {
        console.log(`Restore completed successfully in ${result.durationMs}ms.`);
    } else {
        console.error(`Restore failed: ${result.error}`);
    }
}

run();
```

Execute it:
```bash
npx tsx scripts/quick_restore.ts .agent/backups/backup_2026-10-24T12-00-00-000Z.enc [checksum]
```

### Step 4: Verify Data Integrity (0-5 minutes)
After the script finishes, verify the systems are back online:
1. Ensure `.agent/brain/` and `.agent/companies/` directories have populated with their `tar` contents.
2. Check `.agent/backups/staging_.../xero_data/` if you need to manually inspect synced Xero financial JSON dumps.
3. Boot up the main system or health monitor to verify the integrity and connection to LanceDB and the Semantic Graph.

### SLA Compliance
The restoration process uses AES-256-GCM streaming decryption layered directly with asynchronous `tar` extraction. This pipeline is highly optimized, ensuring that even gigabytes of embeddings and graph relationships unpack well within the 1-hour mandated timeframe.
