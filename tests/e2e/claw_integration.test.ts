import { test, expect } from 'vitest';
import { claw } from '../../src/claw/tool.js';
import { loadConfig } from '../../src/config.js';

test('Claw tool: list_skills should return available skills', async () => {
    // This executes 'npx openclaw skills list' which we verified works
    const result = await claw.execute({ action: 'list_skills' });
    expect(typeof result).toBe('string');
    console.log('Claw list_skills output length:', result.length);
    expect(result).toContain('openclaw-bundled');
    expect(result.length).toBeGreaterThan(0);
}, 60000); // 60s timeout for npx

test('Config: claw agent default should be present', async () => {
    const config = await loadConfig();
    expect(config.agents).toBeDefined();
    expect(config.agents?.claw).toBeDefined();
    expect(config.agents?.claw?.command).toBe('npx');
    expect(config.agents?.claw?.args).toContain('openclaw');
    expect(config.agents?.claw?.args).toContain('agent');
});
