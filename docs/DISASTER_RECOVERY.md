# Disaster Recovery System Guide

## Overview

The Disaster Recovery System provides an automated, encrypted, and compressed backup solution for the core agency components, meeting a 1-hour Recovery Time Objective (RTO). It specifically targets:

1. **The Corporate Brain:** Vector embeddings and Semantic Graphs located in `.agent/brain/`.
2. **Company Contexts:** Specific configuration and context files in `.agent/companies/`.
3. **Financial State:** Xero API dumps (invoices, contacts) fetched during the backup process.

## Key Metrics

*   **RPO (Recovery Point Objective):** 24 hours. Backups are designed to run daily at 2 AM via the system cron and `schedule_regular_backups` tool.
*   **RTO (Recovery Time Objective):** < 1 hour. The restore procedure utilizes direct memory streaming (`tar.gz` pipelined through AES-256 decryption) to write state directly to disk, ensuring recovery is primarily constrained by disk I/O speeds.

## Architecture & Security

*   **Encryption:** AES-256-GCM via Node.js native `crypto` module.
*   **Key Management:** Requires the `DISASTER_RECOVERY_ENCRYPTION_KEY` environment variable. This key is hashed via SHA-256 to guarantee an exact 32-byte length suitable for AES-256.
*   **Storage:** Local `.agent/backups/` directory.

## Automated Backup Configuration

The system provides an MCP tool `schedule_regular_backups` to schedule daily backups. Behind the scenes, the backup scheduler script is located at `scripts/backup_scheduler.ts` and triggered by a crontab entry:

```bash
# Added via the disaster_recovery MCP server
0 2 * * * cd /app && npx tsx scripts/backup_scheduler.ts >> /var/log/cron/backup.log 2>&1
```

## 1-Hour State Restoration Procedure (Molt Phase)

When disaster strikes and you need to restore the environment within the 1-hour RTO, execute the following steps:

### 1. Identify the Backup Archive
Locate the specific `.enc` file in the `.agent/backups/` directory that you wish to restore. You will need its absolute path and ideally its SHA-256 checksum (logged during creation).

### 2. Verify Encryption Key
Ensure the environment contains the exact `DISASTER_RECOVERY_ENCRYPTION_KEY` that was used to create the selected backup archive. Without it, the GCM decryption will immediately fail authentication.

### 3. Halt Active Swarms
Suspend all active task processing to prevent new data from being written during the restoration phase. If using PM2 or Kubernetes, stop or scale down the worker pods/processes.

### 4. Execute Restore Tool
Invoke the `restore_backup` tool via the `disaster_recovery` MCP server:

```json
{
  "name": "restore_backup",
  "arguments": {
    "backupPath": "/path/to/.agent/backups/backup_YYYY-MM-DD.enc",
    "expectedChecksum": "optional_hex_checksum"
  }
}
```

The server will automatically stream the decryption process, decompress the `tar.gz` archive in memory, and safely overwrite `.agent/brain/` and `.agent/companies/`.

### 5. Validate Health
Restart the core platform. Monitor the dashboard and `health_monitor` MCP. Check if the newly written Brain vectors can be queried. The system should be back to full autonomous operation.

## Integrity Verification

The system automatically calculates a SHA-256 checksum during the backup process. You can optionally provide this checksum during the `restore_backup` tool call to verify file integrity *before* extraction occurs.
