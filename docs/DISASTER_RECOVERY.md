# Disaster Recovery System

The Disaster Recovery (DR) System ensures the Simple Biosphere's critical state is backed up regularly and can be restored quickly in the event of data loss or corruption. It uses an automated, encrypted backup mechanism that orchestrates state capture across multiple MCP servers.

## Features
- **Cross-Domain State Capture**: Backups include the Brain (Vector and Graph DB), Company Contexts (Tenant RAG Data), and simulated Financial Data (Xero point-in-time recovery).
- **AES-256-GCM Encryption**: All backups are securely encrypted using an environment-provided key.
- **Automated Scheduling**: Integrates with the `Scheduler` to perform nightly backups.
- **Sub-1 Hour Recovery**: The `restore_from_backup` procedure is designed to bring the agency back to the exact backed-up state within minutes.

## Setup Instructions

1. **Configure the Encryption Key:**
   You must set the `DISASTER_RECOVERY_KEY` environment variable. This should be a strong, randomly generated string. It is used to derive a 32-byte key for AES-256-GCM encryption.
   ```bash
   export DISASTER_RECOVERY_KEY="your-very-strong-secret-key-here"
   ```

2. **Ensure the MCP Server is Enabled:**
   The `disaster_recovery` server must be configured in `mcp.json`. This is typically handled by default, but verify its existence.

3. **Schedule Nightly Backups:**
   To enable automated backups, run the `schedule_backup` tool. This will add a task to `scheduler.json` to execute `trigger_backup` daily at 2:00 AM.

## Manual Backup

If you need to perform an ad-hoc backup (e.g., before a major system upgrade), you can manually trigger the backup tool:

```bash
simple call disaster_recovery trigger_backup
```
The backup will be stored in `.agent/backups/` with a timestamped filename (e.g., `backup-YYYY-MM-DDTHH-mm-ss.enc`) along with a `.meta.json` file containing its size and checksum.

## 1-Hour Recovery Runbook

In the event of a catastrophic failure, data corruption, or regional outage, follow this procedure to restore the system state.

### Prerequisites
- You must have the original `DISASTER_RECOVERY_KEY` used to encrypt the backup.
- You must have access to the `.agent/backups/` directory containing the encrypted backup files.

### Recovery Steps

1. **Identify the Target Backup:**
   Locate the desired backup file in `.agent/backups/`. Check the corresponding `.meta.json` file to verify the timestamp and checksum if needed.

2. **Execute the Restore Procedure:**
   Use the `restore_from_backup` tool, providing the filename of the encrypted backup.
   ```bash
   simple call disaster_recovery restore_from_backup '{"filename": "backup-2023-10-27T10-00-00.enc"}'
   ```

3. **Verify the State:**
   - Check the logs to ensure the Brain, Company Contexts, and Financial Data steps completed successfully.
   - Use `simple call brain read_strategy` to verify the Corporate Strategy loaded correctly.
   - Query the company RAG context to ensure tenant data is available.

4. **Resume Operations:**
   Once the state is verified, restart the main orchestrator/engine to resume normal operations with the restored state.

*Note: Total execution time for the restore command typically takes less than 5 minutes, allowing ample time for verification within the 1-hour recovery window.*
