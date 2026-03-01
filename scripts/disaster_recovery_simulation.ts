import { createBackup, restoreBackup } from '../src/mcp_servers/disaster_recovery/backup_manager.js';
import { join } from 'path';
import { mkdir, rm, writeFile, readFile, access } from 'fs/promises';
import { logMetric } from '../src/logger.js';
import { randomBytes } from 'crypto';

const AGENT_DIR = process.env.JULES_AGENT_DIR || join(process.cwd(), '.agent');
const BRAIN_DIR = join(AGENT_DIR, 'brain');
const COMPANIES_DIR = join(AGENT_DIR, 'companies');
const BACKUP_DIR = join(AGENT_DIR, 'backups');
const MAX_RECOVERY_TIME_MS = 3600000; // 1 hour SLA

async function setupMockData() {
    console.log('\n[1/5] Setting up mock data for simulation...');
    await mkdir(BRAIN_DIR, { recursive: true });
    await mkdir(COMPANIES_DIR, { recursive: true });

    // Mock LanceDB vector embeddings and semantic graph
    await writeFile(join(BRAIN_DIR, 'semantic_graph.json'), JSON.stringify({ nodes: 1500, edges: 4500, _source: 'simulation' }));

    // Mock Company Context (RAG Storage) - representing multi-tenant data
    const tenantA = Buffer.from('Tenant A Data: ' + randomBytes(1024).toString('hex'));
    const tenantB = Buffer.from('Tenant B Data: ' + randomBytes(1024).toString('hex'));
    await writeFile(join(COMPANIES_DIR, 'tenant_a_rag.bin'), tenantA);
    await writeFile(join(COMPANIES_DIR, 'tenant_b_rag.bin'), tenantB);

    console.log('✓ Mock data successfully generated in Brain and Companies directories.');
}

async function simulateDisaster() {
    console.log('\n[3/5] Simulating total data loss (Disaster Scenario)...');

    await rm(BRAIN_DIR, { recursive: true, force: true }).catch(() => {});
    await rm(COMPANIES_DIR, { recursive: true, force: true }).catch(() => {});

    try {
        await access(join(BRAIN_DIR, 'semantic_graph.json'));
        console.error('X Disaster simulation failed, data still exists.');
        process.exit(1);
    } catch {
        console.log('✓ Total data loss simulated. Critical directories wiped.');
    }
}

async function validateIntegrity() {
    console.log('\n[5/5] Validating data integrity...');

    try {
        const graphData = JSON.parse(await readFile(join(BRAIN_DIR, 'semantic_graph.json'), 'utf-8'));
        if (graphData.nodes !== 1500) throw new Error('Graph nodes mismatch');

        const tenantA = await readFile(join(COMPANIES_DIR, 'tenant_a_rag.bin'), 'utf-8');
        if (!tenantA.startsWith('Tenant A Data:')) throw new Error('Tenant A data corrupted');

        console.log('✓ Data integrity validated across all systems.');
        return true;
    } catch (e: any) {
        console.error(`X Data validation failed: ${e.message}`);
        return false;
    }
}

async function runSimulation() {
    console.log('================================================');
    console.log('  Disaster Recovery Simulation & Validation   ');
    console.log('================================================');

    // Enforce vitest fallback key for simulation script if none provided
    if (!process.env.BACKUP_ENCRYPTION_KEY) {
        process.env.BACKUP_ENCRYPTION_KEY = 'test_encryption_key_for_simulation';
    }

    try {
        await setupMockData();

        console.log('\n[2/5] Triggering automated encrypted backup...');
        const backupResult = await createBackup();
        if (!backupResult.success || !backupResult.backupPath) {
            throw new Error(`Backup failed: ${backupResult.error}`);
        }
        console.log(`✓ Backup successful. Created at: ${backupResult.backupPath}`);
        console.log(`✓ Checksum: ${backupResult.checksum}`);
        console.log(`✓ Backup duration: ${backupResult.durationMs}ms`);

        await simulateDisaster();

        console.log('\n[4/5] Executing recovery procedure...');
        const restoreStartTime = Date.now();
        const restoreResult = await restoreBackup(backupResult.backupPath, backupResult.checksum);
        const actualRecoveryTime = Date.now() - restoreStartTime;

        if (!restoreResult.success) {
            throw new Error(`Restore failed: ${restoreResult.error}`);
        }

        const metSla = actualRecoveryTime < MAX_RECOVERY_TIME_MS;

        // Log to health_monitor
        logMetric('health_monitor', 'dr_recovery_time_ms', actualRecoveryTime, {
            met_sla: metSla.toString(),
            scenario: 'total_data_loss'
        });

        console.log(`✓ Restore successful.`);
        console.log(`✓ Recovery Time: ${actualRecoveryTime}ms`);
        console.log(`✓ SLA Met (< 1 hour): ${metSla ? 'YES' : 'NO'}`);

        if (!metSla) {
            console.error('\n[CRITICAL] Recovery Time exceeded the 1-hour SLA.');
            process.exit(1);
        }

        const isValid = await validateIntegrity();
        if (!isValid) process.exit(1);

        console.log('\n================================================');
        console.log('  Simulation Complete: All Systems Operational  ');
        console.log('================================================\n');

    } catch (e: any) {
        console.error(`\nSimulation aborted due to error: ${e.message}`);
        process.exit(1);
    }
}

runSimulation();
