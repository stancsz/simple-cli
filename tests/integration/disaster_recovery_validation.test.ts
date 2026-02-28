import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from '../../src/mcp_servers/disaster_recovery/tools.js';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import * as crypto from 'crypto';

describe('Phase 27: Disaster Recovery Validation', () => {
    let server: McpServer;
    let triggerBackupHandler: any;
    let restoreFromBackupHandler: any;

    const testDir = join(process.cwd(), '.agent');
    const backupDir = join(testDir, 'backups');
    const brainDir = join(testDir, 'brain');
    const companiesDir = join(testDir, 'companies');

    beforeEach(() => {
        // Setup environment
        process.env.DISASTER_RECOVERY_KEY = "test-recovery-key-must-be-long-enough";

        // Ensure test directories exist
        [testDir, backupDir, brainDir, companiesDir].forEach(dir => {
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
        });

        // Mock Brain Data
        writeFileSync(join(brainDir, "test_db.lance"), "mock_vector_data");

        // Mock Company Context Data
        writeFileSync(join(companiesDir, "test_docs.md"), "mock_rag_data");

        server = new McpServer({
            name: "test_dr",
            version: "1.0.0"
        });

        registerTools(server);

        const tools = (server as any)._registeredTools;
        triggerBackupHandler = tools?.trigger_backup?.handler;
        restoreFromBackupHandler = tools?.restore_from_backup?.handler;

        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        // Cleanup mock data
        if (existsSync(backupDir)) rmSync(backupDir, { recursive: true, force: true });
        if (existsSync(brainDir)) rmSync(brainDir, { recursive: true, force: true });
        if (existsSync(companiesDir)) rmSync(companiesDir, { recursive: true, force: true });
        if (existsSync(join(process.cwd(), 'scheduler.json'))) {
             rmSync(join(process.cwd(), 'scheduler.json'), { force: true });
        }

        vi.restoreAllMocks();
    });

    it('should successfully trigger an encrypted backup and generate metadata', async () => {
        expect(triggerBackupHandler).toBeDefined();

        const startTime = Date.now();
        const result = await triggerBackupHandler({});
        const endTime = Date.now();

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain("Backup created successfully");

        // Assert creation time is under 1 hour (simulate with fast local execution < 1 minute)
        expect(endTime - startTime).toBeLessThan(60 * 60 * 1000);

        // Verify backup files exist
        const { readdirSync } = await import('fs');
        const backupFiles = readdirSync(backupDir);

        const encFile = backupFiles.find(f => f.endsWith('.enc'));
        const metaFile = backupFiles.find(f => f.endsWith('.meta.json'));

        expect(encFile).toBeDefined();
        expect(metaFile).toBeDefined();

        if (metaFile) {
            const metaContent = JSON.parse(readFileSync(join(backupDir, metaFile), 'utf-8'));
            expect(metaContent.filename).toBe(encFile);
            expect(metaContent.size).toBeGreaterThan(0);
            expect(metaContent.checksum).toBeDefined();
        }
    });

    it('should successfully restore state from an encrypted backup within 1 hour', async () => {
        // 1. Create a backup
        await triggerBackupHandler({});
        const { readdirSync } = await import('fs');
        const backupFiles = readdirSync(backupDir);
        const encFile = backupFiles.find(f => f.endsWith('.enc'));

        expect(encFile).toBeDefined();

        // 2. Simulate Data Loss
        rmSync(brainDir, { recursive: true, force: true });
        rmSync(companiesDir, { recursive: true, force: true });

        expect(existsSync(join(brainDir, "test_db.lance"))).toBeFalsy();

        // 3. Perform Restore
        const startTime = Date.now();
        const restoreResult = await restoreFromBackupHandler({ filename: encFile });
        const endTime = Date.now();

        expect(restoreResult.isError).toBeFalsy();
        expect(restoreResult.content[0].text).toContain("Restored successfully");

        // Assert restore time < 1 hour
        expect(endTime - startTime).toBeLessThan(60 * 60 * 1000);

        // 4. Verify Recovery
        expect(existsSync(join(brainDir, "test_db.lance"))).toBeTruthy();
        expect(existsSync(join(companiesDir, "test_docs.md"))).toBeTruthy();

        const restoredBrainData = readFileSync(join(brainDir, "test_db.lance"), 'utf-8');
        expect(restoredBrainData).toBe("mock_vector_data");
    });

    it('should fail to restore with an invalid key', async () => {
        // 1. Create backup with valid key
        await triggerBackupHandler({});
        const { readdirSync } = await import('fs');
        const encFile = readdirSync(backupDir).find(f => f.endsWith('.enc'));

        // 2. Change Key
        process.env.DISASTER_RECOVERY_KEY = "wrong-key-that-causes-failure";

        // 3. Attempt Restore
        const restoreResult = await restoreFromBackupHandler({ filename: encFile });

        expect(restoreResult.isError).toBeTruthy();
        expect(restoreResult.content[0].text).toContain("Restore failed");
    });

    it('should fail to restore a corrupted backup', async () => {
        await triggerBackupHandler({});
        const { readdirSync } = await import('fs');
        const encFile = readdirSync(backupDir).find(f => f.endsWith('.enc'));

        // Corrupt file by appending garbage data
        if (encFile) {
            const filePath = join(backupDir, encFile);
            const data = readFileSync(filePath);
            data[data.length - 1] = data[data.length - 1] ^ 0xFF; // Flip last byte
            writeFileSync(filePath, data);
        }

        const restoreResult = await restoreFromBackupHandler({ filename: encFile });
        expect(restoreResult.isError).toBeTruthy();
        expect(restoreResult.content[0].text).toContain("Restore failed");
    });
});
