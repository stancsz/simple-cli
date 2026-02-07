import { describe, it, expect, vi } from 'vitest';
import { routeTaskStrategy, StrategyDecision } from '../src/router.js';

describe('router', () => {
  describe('routeTaskStrategy', () => {
    it('should route to simple model for simple tasks', async () => {
      const mockOrchestrator = vi.fn().mockResolvedValue(JSON.stringify({
        model: 'openai:gpt-5.1-codex-mini',
        reasoning: 'Simple task'
      }));

      const decision = await routeTaskStrategy('Fix typo', mockOrchestrator);
      expect(decision.model).toBe('openai:gpt-5.1-codex-mini');
    });

    it('should route to complex model for complex tasks', async () => {
      const mockOrchestrator = vi.fn().mockResolvedValue(JSON.stringify({
        model: 'openai:gpt-5.2-codex',
        reasoning: 'Complex task'
      }));

      const decision = await routeTaskStrategy('Refactor entire system', mockOrchestrator);
      expect(decision.model).toBe('openai:gpt-5.2-codex');
    });

    it('should fall back to heuristics on error', async () => {
      const mockOrchestrator = vi.fn().mockRejectedValue(new Error('API Error'));

      const decision = await routeTaskStrategy('Refactor system', mockOrchestrator);
      expect(decision.model).toBe('openai:gpt-5.2-codex'); // complex heuristic
    });

    it('should default to simple model on fallback for simple tasks', async () => {
        const mockOrchestrator = vi.fn().mockRejectedValue(new Error('API Error'));
        const decision = await routeTaskStrategy('hello', mockOrchestrator);
        expect(decision.model).toBe('openai:gpt-5.1-codex-mini');
    });

    it('should support gemini via heuristics', async () => {
        const mockOrchestrator = vi.fn().mockRejectedValue(new Error('API Error'));
        const decision = await routeTaskStrategy('use gemini to explain', mockOrchestrator);
        expect(decision.model).toBe('google:gemini-pro');
    });

     it('should support claude via heuristics', async () => {
        const mockOrchestrator = vi.fn().mockRejectedValue(new Error('API Error'));
        const decision = await routeTaskStrategy('ask claude to help', mockOrchestrator);
        expect(decision.model).toBe('anthropic:claude-3-opus');
    });
  });
});
