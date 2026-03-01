# Disaster Recovery Procedure (SOP)

## Objective
To safely and swiftly restore the system state (Corporate Brain, Company Contexts, and Financial Data) using encrypted `.enc` backups from the `.agent/backups/` directory.

## Metaphor: Claw & Molt
Backups are immutable artifacts. Recovery initiates a system 'Molt'—restoring state as a pristine 'Claw' instance.

## Prerequisites
- The system must have the **exact** `BACKUP_ENCRYPTION_KEY` used to generate the backup in `.env.agent`.
- All running worker swarms and active MCP connections should be paused to prevent data conflict during the overwrite phase.
- Ensure the selected `.enc` backup file is present in `.agent/backups/` or downloaded from off-site storage.

## Procedure Steps

### 1. Identify Backup
Locate the desired backup file and its checksum (usually logged during the backup phase).
```bash
ls -la .agent/backups/*.enc
```
*Note the full absolute path of the backup file.*

### 2. Prepare System (Molt Phase)
Halt active processes to ensure a clean restoration state.
```bash
npm run pm2:stop # Example: adjust for actual supervisor usage
```

### 3. Execute Restore
Using the `disaster_recovery` MCP Server, execute the `restore_backup` tool.

**MCP Tool Call (Example):**
```json
{
  "name": "restore_backup",
  "arguments": {
    "backupPath": "/absolute/path/to/.agent/backups/backup_YYYY-MM-DD.enc",
    "expectedChecksum": "<optional_known_checksum>"
  }
}
```
*If running manually without an MCP client, you can use a script to invoke `restoreBackup` directly from `src/mcp_servers/disaster_recovery/backup_manager.ts`.*

### 4. Verification
The restore tool will automatically decrypt the file, verify the checksum, and extract the files directly over `.agent/brain/`, `.agent/companies/`, and the Xero local dump.
- Ensure the command outputs success.
- Check `.agent/brain/` for restored vectors/graphs.
- Check `.agent/metrics/` to confirm that `restore_success` was logged as `1`.

### 5. Resume Operations (New Claw)
Restart the core platform and verify it starts correctly with the restored memory.
```bash
npm run start
```
Run `npm run test` or check the health monitor dashboard to ensure zero degradation.
