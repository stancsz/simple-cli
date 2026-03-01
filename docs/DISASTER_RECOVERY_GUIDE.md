# Disaster Recovery System Guide

## Overview

The Disaster Recovery System provides an automated, encrypted, and compressed backup solution for the core agency components, meeting a 1-hour Recovery Time Objective (RTO). It specifically targets:

1. **The Corporate Brain:** Vector embeddings and Semantic Graphs located in `.agent/brain/`.
2. **Company Contexts:** Specific configuration and context files in `.agent/companies/`.
3. **Financial State:** Xero API dumps (invoices, contacts) fetched during the backup process.

## Key Metrics

*   **RPO (Recovery Point Objective):** 24 hours. Backups are designed to run daily via `scripts/backup_scheduler.ts`.
*   **RTO (Recovery Time Objective):** < 1 hour. The restore procedure utilizes direct memory streaming (`tar.gz` pipelined through AES-256 decryption) to write state directly to disk, ensuring recovery is primarily constrained by disk I/O speeds.

## Architecture & Security

*   **Encryption:** AES-256-CBC via Node.js native `crypto` module.
*   **Key Management:** Requires the `BACKUP_ENCRYPTION_KEY` environment variable. This key is hashed via SHA-256 to guarantee an exact 32-byte length suitable for AES-256-CBC.
*   **Storage:** Local `.agent/backups/` directory.

## Automated Backup Configuration

The backup scheduler script is located at `scripts/backup_scheduler.ts`.
To run daily, you can add it to your system crontab or use a process manager like PM2:

```bash
# Example Cron Entry (Runs every day at 3:00 AM)
0 3 * * * cd /path/to/agency && npm run tsx scripts/backup_scheduler.ts >> /var/log/agency_backup.log 2>&1
```

## Recovery Commands (Molt Phase)

When disaster strikes and you need to restore the environment, use the `disaster_recovery` MCP server. Follow the SOP located in `src/mcp_servers/disaster_recovery/recovery_procedure.md`.

You can trigger a restore operation using any MCP client connected to the `disaster_recovery` server using the following arguments:

```json
{
  "backupPath": "/path/to/.agent/backups/backup_YYYY-MM-DD.enc",
  "expectedChecksum": "optional_hex_checksum"
}
```

The server will automatically decrypt the file using the local encryption key, decompress it, and restore the state back to the `.agent/brain/` and `.agent/companies/` folders.

## Integrity Verification

The system automatically calculates a SHA-256 checksum during the backup process. You can optionally provide this checksum during the `restore_backup` tool call to verify file integrity *before* extraction occurs.
