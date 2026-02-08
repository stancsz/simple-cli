import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';
import { writeFile, rm, mkdir } from 'fs/promises';
import { join } from 'path';

const TEST_DIR = 'tests/tmp_config';
const AGENT_DIR = join(TEST_DIR, '.agent');

describe('Config Loader', () => {
    beforeEach(async () => {
        await mkdir(AGENT_DIR, { recursive: true });
    });

    afterEach(async () => {
        await rm(TEST_DIR, { recursive: true, force: true });
    });

    it('should load config from .agent/config.json', async () => {
        const config = {
            agents: {
                test: { command: 'echo', args: ['hello'], description: 'test' }
            }
        };
        await writeFile(join(AGENT_DIR, 'config.json'), JSON.stringify(config));

        const loaded = await loadConfig(TEST_DIR);
        expect(loaded.agents?.test.command).toBe('echo');
    });

    it('should return empty object if no config found', async () => {
        const loaded = await loadConfig(TEST_DIR);
        expect(loaded).toEqual({});
    });

    it('should prioritize mcp.json', async () => {
        const mcpConfig = { mcpServers: { s1: {} } };
        const agentConfig = { agents: { a1: {} } };

        await writeFile(join(TEST_DIR, 'mcp.json'), JSON.stringify(mcpConfig));
        await writeFile(join(AGENT_DIR, 'config.json'), JSON.stringify(agentConfig));

        const loaded = await loadConfig(TEST_DIR);
        expect(loaded.mcpServers).toBeDefined();
        expect(loaded.agents).toBeUndefined(); // Prioritizes mcp.json completely (first found) based on my implementation
    });
});
