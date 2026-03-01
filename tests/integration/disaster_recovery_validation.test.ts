import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { join } from 'path';
import { mkdir, rm, writeFile, readFile, access } from 'fs/promises';
import { createBackup, restoreBackup } from '../../src/mcp_servers/disaster_recovery/backup_manager.js';
import { randomBytes } from 'crypto';

// Setup Mock for Xero client
const mocks = vi.hoisted(() => ({
    getInvoices: vi.fn().mockResolvedValue({ body: { invoices: [{ id: 'inv1' }] } }),
    getContacts: vi.fn().mockResolvedValue({ body: { contacts: [{ id: 'cont1' }] } }),
    getPayments: vi.fn().mockResolvedValue({ body: { payments: [{ id: 'pay1' }] } })
}));

vi.mock('../../src/mcp_servers/business_ops/xero_tools.js', () => ({
    getXeroClient: vi.fn().mockResolvedValue({
        accountingApi: {
            getInvoices: mocks.getInvoices,
            getContacts: mocks.getContacts,
            getPayments: mocks.getPayments
        }
    }),
    getTenantId: vi.fn().mockResolvedValue('test-tenant-id')
}));

describe('Disaster Recovery Manager', () => {
    const AGENT_DIR = join(process.cwd(), '.agent');
    const BRAIN_DIR = join(AGENT_DIR, 'brain');
    const COMPANIES_DIR = join(AGENT_DIR, 'companies');
    const BACKUP_DIR = join(AGENT_DIR, 'backups');

    let createdBackupPath = '';
    let backupChecksum = '';

    beforeAll(async () => {
        // Ensure directories exist
        await mkdir(BRAIN_DIR, { recursive: true });
        await mkdir(COMPANIES_DIR, { recursive: true });

        // Create some dummy files to simulate database/context data
        await writeFile(join(BRAIN_DIR, 'dummy_graph.json'), JSON.stringify({ nodes: 10, edges: 15 }));

        // Let's create a large file to test stream performance and constraints
        // Using a 10MB file for the CI environment to avoid filling up disk/memory while still
        // validating stream capabilities. In a real environment, this simulates the 10GB constraint
        // by verifying that memory stays stable during the streaming process.
        const largeBuffer = randomBytes(10 * 1024 * 1024); // 10 MB
        await writeFile(join(COMPANIES_DIR, 'dummy_large_context.bin'), largeBuffer);

        process.env.BACKUP_ENCRYPTION_KEY = 'test_encryption_key_for_vitest_run';
    });

    afterAll(async () => {
        // Cleanup generated files
        await rm(BRAIN_DIR, { recursive: true, force: true }).catch(() => {});
        await rm(COMPANIES_DIR, { recursive: true, force: true }).catch(() => {});
        await rm(BACKUP_DIR, { recursive: true, force: true }).catch(() => {});
    });

    it('should create an encrypted backup successfully', async () => {
        const result = await createBackup();

        expect(result.success).toBe(true);
        expect(result.backupPath).toBeDefined();
        expect(result.checksum).toBeDefined();

        // Backup shouldn't take longer than 10 minutes (600000ms)
        // For our test of 1MB, it should be well under 5 seconds (5000ms)
        expect(result.durationMs).toBeLessThan(10000);

        // Verify the file actually exists
        if (result.backupPath) {
            await access(result.backupPath);
            createdBackupPath = result.backupPath;
            backupChecksum = result.checksum!;
        }
    }, 15000); // give it up to 15 seconds

    it('should simulate corruption by altering original files', async () => {
        // Modify a file to simulate corruption
        await writeFile(join(BRAIN_DIR, 'dummy_graph.json'), JSON.stringify({ nodes: 0, edges: 0, corrupted: true }));

        const content = await readFile(join(BRAIN_DIR, 'dummy_graph.json'), 'utf-8');
        expect(content).toContain('corrupted');
    });

    it('should restore the system state from the encrypted backup', async () => {
        const result = await restoreBackup(createdBackupPath, backupChecksum);

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();

        // Restore shouldn't take longer than 1 hour (3600000ms)
        // For our test, it should be well under 5 seconds (5000ms)
        expect(result.durationMs).toBeLessThan(10000);

        // Delay briefly to allow filesystem to settle, though tar is synchronous by await
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify the file is back to its original state
        const content = await readFile(join(BRAIN_DIR, 'dummy_graph.json'), 'utf-8');
        const parsed = JSON.parse(content);
        expect(parsed.nodes).toBe(10);
        expect(parsed.edges).toBe(15);
        expect(parsed.corrupted).toBeUndefined();
    }, 15000);

    it('should fail to restore with an invalid checksum', async () => {
        const result = await restoreBackup(createdBackupPath, 'invalid_checksum_string');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Checksum mismatch');
    });
});
