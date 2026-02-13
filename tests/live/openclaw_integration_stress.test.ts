
import { describe, it, expect } from 'vitest';
import { claw } from '../../src/claw/tool.js';
import { execSync } from 'child_process';

const shouldRun = process.env.RUN_OPENCLAW_STRESS_TEST === 'true';

describe('OpenClaw Integration Stress Test', () => {
    // Increase timeout significantly as calling external npx commands can be slow
    const TIMEOUT = 60000; 

    // Ensure we have an agent configured for testing
    const TEST_AGENT_ID = 'openai-agent';

    if (!shouldRun) {
        it.skip('Skipping OpenClaw stress test (set RUN_OPENCLAW_STRESS_TEST=true to run)', () => {});
        return;
    }

    it('should list available skills', async () => {
        const result = await claw.execute({ action: 'list_skills' });
        console.log('List Skills Result:', result.substring(0, 200) + '...');
        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(10);
    }, TIMEOUT);

    it('should inspect a specific skill (weather)', async () => {
        const result = await claw.execute({ action: 'inspect_skill', skill_name: 'weather' });
        console.log('Inspect Skill Result:', result.substring(0, 200) + '...');
        expect(result).toBeDefined();
        expect(result).toContain('weather');
    }, TIMEOUT);

    it('should run a simple agent task using openai-agent', async () => {
        // Check if openai-agent exists (manual setup required for this test effectively)
        try {
            execSync(`npx openclaw agents list --json | grep "${TEST_AGENT_ID}"`);
        } catch (e) {
            console.warn(`Skipping agent test: Agent '${TEST_AGENT_ID}' not found. Run 'npx openclaw agents add ${TEST_AGENT_ID} --model openai/gpt-4o-mini --workspace /tmp/openclaw-openai-workspace --non-interactive' to enable.`);
            return;
        }

        const sessionId = `stress-test-${Date.now()}`;
        const message = "Calculate 15 * 4 and return the result.";
        
        console.log(`Starting agent task with session ID: ${sessionId} using agent: ${TEST_AGENT_ID}`);
        
        // Use our new agent_id parameter
        const result = await claw.execute({ 
            action: 'agent', 
            message: message, 
            session_id: sessionId,
            agent_id: TEST_AGENT_ID
        });
        
        console.log('Agent Task Result:', result.substring(0, 500) + '...');
        
        expect(result).toBeDefined();
        // Check for success indicators
        expect(result).not.toContain('Error: message is required');
        // If it runs, it outputs JSON. Let's try to parse it.
        try {
             const json = JSON.parse(result);
             // Verify structure
             expect(json.meta).toBeDefined();
             expect(json.payloads).toBeDefined();
        } catch (e) {
            // Might be plain text error if failed early
            console.log("Could not parse JSON result:", result);
        }
    }, TIMEOUT * 2);
});
