import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Psyche } from '../src/psyche.js';
import { join } from 'path';
import { rmSync, mkdirSync, existsSync } from 'fs';

const TEST_DIR = join(process.cwd(), '.test_psyche');

describe('Psyche', () => {
    beforeEach(() => {
        if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
        mkdirSync(TEST_DIR);
    });

    afterEach(() => {
        if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
    });

    it('should initialize with default state', () => {
        const psyche = new Psyche(TEST_DIR);
        expect(psyche.state.dna.mbti).toBe('ENTJ');
        expect(psyche.state.live_metrics.trust).toBe(0.5);
        expect(psyche.state.live_metrics.core_trauma).toEqual([]);
    });

    it('should save and load state', async () => {
        const psyche = new Psyche(TEST_DIR);
        psyche.state.live_metrics.trust = 0.9;
        await psyche.save();

        const psyche2 = new Psyche(TEST_DIR);
        await psyche2.load();
        expect(psyche2.state.live_metrics.trust).toBe(0.9);
    });

    it('should generate system instruction with monologue schema', () => {
        const psyche = new Psyche(TEST_DIR);
        const instruction = psyche.getSystemInstruction();
        expect(instruction).toContain('[INTERNAL_MONOLOGUE]');
        expect(instruction).toContain('stimulus_eval');
        expect(instruction).toContain('Current State Vector');
    });

    it('should process interaction and update metrics', async () => {
        const psyche = new Psyche(TEST_DIR);
        const monologue = {
            stimulus_eval: 'bored',
            boundary_check: 'ok',
            internal_shift: {
                trust_delta: 0.1,
                irritation_delta: -0.1,
                autonomy_delta: 0
            },
            strategic_intent: 'bond'
        };

        await psyche.processInteraction(monologue);
        expect(psyche.state.live_metrics.trust).toBe(0.6);
        expect(psyche.state.live_metrics.irritation).toBe(0.0); // clamped at 0
        expect(psyche.state.live_metrics.interaction_count).toBe(1);
    });

    it('should trigger reflection every 20 interactions', async () => {
        const psyche = new Psyche(TEST_DIR);
        psyche.state.live_metrics.interaction_count = 20;

        const mockLLM = {
            generate: vi.fn().mockResolvedValue({
                thought: JSON.stringify({
                    live_metrics: { trust: 0.8, core_trauma: ['User was rude'] }
                })
            })
        };

        const history = [{ role: 'user', content: 'hello' }];
        await psyche.reflect(history, mockLLM as any);

        // Check first call arguments
        const args = mockLLM.generate.mock.calls[0];
        expect(args[0]).toContain('Analyze');
        expect(args[1]).toEqual(history);

        expect(psyche.state.live_metrics.trust).toBe(0.8);
        expect(psyche.state.live_metrics.core_trauma).toContain('User was rude');
    });

     it('should NOT trigger reflection if not multiple of 20', async () => {
        const psyche = new Psyche(TEST_DIR);
        psyche.state.live_metrics.interaction_count = 19;

        const mockLLM = {
            generate: vi.fn()
        };

        await psyche.reflect([], mockLLM as any);
        expect(mockLLM.generate).not.toHaveBeenCalled();
    });
});
