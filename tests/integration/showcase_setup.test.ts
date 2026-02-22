import { test, expect } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { existsSync, rmSync, readFileSync } from 'fs';

const execAsync = promisify(exec);

const TEST_AGENT_DIR = join(process.cwd(), 'temp_test_agent_showcase');

test('Showcase Setup Script Integration Test', async () => {
    // Cleanup before test
    if (existsSync(TEST_AGENT_DIR)) {
        rmSync(TEST_AGENT_DIR, { recursive: true, force: true });
    }

    console.log(`Running setup-showcase.ts with JULES_AGENT_DIR=${TEST_AGENT_DIR}`);

    try {
        const { stdout, stderr } = await execAsync('npx tsx scripts/setup-showcase.ts', {
            env: { ...process.env, JULES_AGENT_DIR: TEST_AGENT_DIR }
        });

        console.log('Script Output:', stdout);
        if (stderr) console.error('Script Error Output:', stderr);

        // Assertions
        const showcaseDir = join(TEST_AGENT_DIR, 'companies', 'showcase-corp');

        // 1. Directory Structure
        expect(existsSync(showcaseDir), 'Showcase directory should exist').toBe(true);
        expect(existsSync(join(showcaseDir, 'config')), 'Config directory should exist').toBe(true);
        expect(existsSync(join(showcaseDir, 'sops')), 'SOPs directory should exist').toBe(true);
        expect(existsSync(join(showcaseDir, 'brain')), 'Brain directory should exist').toBe(true);

        // 2. Context File
        const contextPath = join(showcaseDir, 'config', 'company_context.json');
        expect(existsSync(contextPath), 'Context file should exist').toBe(true);
        const context = JSON.parse(readFileSync(contextPath, 'utf-8'));
        expect(context.name).toBe('Showcase Corp');
        expect(context.industry).toBe('Software Development');
        expect(context.mission).toContain('autonomous AI agents');

        // 3. SOP File
        const sopPath = join(showcaseDir, 'sops', 'showcase_sop.md');
        expect(existsSync(sopPath), 'SOP file should exist').toBe(true);
        const sopContent = readFileSync(sopPath, 'utf-8');
        expect(sopContent).toContain('Showcase Corp');

        // 4. Scheduler Config
        const schedulerPath = join(TEST_AGENT_DIR, 'scheduler.json');
        expect(existsSync(schedulerPath), 'Scheduler config should exist').toBe(true);
        const scheduler = JSON.parse(readFileSync(schedulerPath, 'utf-8'));
        const tasks = scheduler.tasks;
        expect(tasks).toBeDefined();
        expect(tasks.some((t: any) => t.id === 'showcase-standup')).toBe(true);
        expect(tasks.some((t: any) => t.id === 'showcase-hr-review')).toBe(true);

        // 5. Config.json registration
        const configPath = join(TEST_AGENT_DIR, 'config.json');
        expect(existsSync(configPath), 'Global config should exist').toBe(true);
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        expect(config.companies).toContain('showcase-corp');
        expect(config.active_company).toBe('showcase-corp');

    } catch (error: any) {
        console.error('Test Failed:', error);
        throw error;
    } finally {
        // Cleanup after test
        if (existsSync(TEST_AGENT_DIR)) {
            rmSync(TEST_AGENT_DIR, { recursive: true, force: true });
        }
    }
}, 60000);
