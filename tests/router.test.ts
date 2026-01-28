/**
 * Tests for MoE router module
 */

import { describe, it, expect, vi } from 'vitest';
import {
  routeTask,
  loadTierConfig,
  formatRoutingDecision,
  RoutingResponseSchema,
  type Tier,
  type RoutingDecision
} from '../src/router.js';

describe('router', () => {
  describe('loadTierConfig', () => {
    it('should load default tier configuration', () => {
      const tiers = loadTierConfig();

      expect(tiers.size).toBe(5);
      expect(tiers.get(1)).toBeDefined();
      expect(tiers.get(2)).toBeDefined();
      expect(tiers.get(3)).toBeDefined();
      expect(tiers.get(4)).toBeDefined();
      expect(tiers.get(5)).toBeDefined();
    });

    it('should have correct roles for each tier', () => {
      const tiers = loadTierConfig();

      expect(tiers.get(1)?.role).toContain('Orchestrator');
      expect(tiers.get(2)?.role).toContain('Senior');
      expect(tiers.get(3)?.role).toContain('Junior');
      expect(tiers.get(4)?.role).toContain('Intern');
      expect(tiers.get(5)?.role).toContain('Utility');
    });

    it('should use environment variables when set', () => {
      const originalEnv = process.env.MOE_TIER_1_MODEL;
      process.env.MOE_TIER_1_MODEL = 'custom-model';

      const tiers = loadTierConfig();

      expect(tiers.get(1)?.model).toBe('custom-model');

      // Restore
      if (originalEnv) {
        process.env.MOE_TIER_1_MODEL = originalEnv;
      } else {
        delete process.env.MOE_TIER_1_MODEL;
      }
    });

    it('should detect provider from model name prefix', () => {
      const originalEnv = process.env.MOE_TIER_1_MODEL;
      process.env.MOE_TIER_1_MODEL = 'anthropic/claude-3-opus';

      const tiers = loadTierConfig();

      expect(tiers.get(1)?.provider).toBe('anthropic');

      // Restore
      if (originalEnv) {
        process.env.MOE_TIER_1_MODEL = originalEnv;
      } else {
        delete process.env.MOE_TIER_1_MODEL;
      }
    });
  });

  describe('RoutingResponseSchema', () => {
    it('should validate correct routing response', () => {
      const validResponse = {
        complexity: 7,
        contextRequired: 'high',
        risk: 'low',
        recommendedTier: 2,
        reasoning: 'Complex implementation task'
      };

      expect(() => RoutingResponseSchema.parse(validResponse)).not.toThrow();
    });

    it('should reject invalid complexity values', () => {
      const invalidResponse = {
        complexity: 15, // Out of range (1-10)
        contextRequired: 'high',
        risk: 'low',
        recommendedTier: 2,
        reasoning: 'Test'
      };

      expect(() => RoutingResponseSchema.parse(invalidResponse)).toThrow();
    });

    it('should reject invalid tier values', () => {
      const invalidResponse = {
        complexity: 5,
        contextRequired: 'high',
        risk: 'low',
        recommendedTier: 10, // Out of range (1-5)
        reasoning: 'Test'
      };

      expect(() => RoutingResponseSchema.parse(invalidResponse)).toThrow();
    });

    it('should reject invalid contextRequired values', () => {
      const invalidResponse = {
        complexity: 5,
        contextRequired: 'medium', // Should be 'high' or 'low'
        risk: 'low',
        recommendedTier: 2,
        reasoning: 'Test'
      };

      expect(() => RoutingResponseSchema.parse(invalidResponse)).toThrow();
    });
  });

  describe('routeTask', () => {
    it('should route complex architectural task to Tier 1-2', async () => {
      const mockOrchestrator = vi.fn().mockResolvedValue(JSON.stringify({
        complexity: 9,
        contextRequired: 'high',
        risk: 'high',
        recommendedTier: 1,
        reasoning: 'Major architectural change'
      }));

      const decision = await routeTask(
        'Refactor the entire authentication system to use OAuth2',
        mockOrchestrator
      );

      expect(decision.tier).toBeLessThanOrEqual(2);
      expect(decision.complexity).toBeGreaterThanOrEqual(7);
    });

    it('should route simple task to Tier 3-4', async () => {
      const mockOrchestrator = vi.fn().mockResolvedValue(JSON.stringify({
        complexity: 2,
        contextRequired: 'low',
        risk: 'low',
        recommendedTier: 4,
        reasoning: 'Simple typo fix'
      }));

      const decision = await routeTask(
        'Fix the typo in the README',
        mockOrchestrator
      );

      expect(decision.tier).toBeGreaterThanOrEqual(3);
      expect(decision.complexity).toBeLessThanOrEqual(4);
    });

    it('should fall back to heuristics on orchestrator error', async () => {
      const mockOrchestrator = vi.fn().mockRejectedValue(new Error('API error'));

      const decision = await routeTask(
        'implement a new feature',
        mockOrchestrator
      );

      // Should use fallback heuristics
      expect(decision.tier).toBeDefined();
      expect(decision.complexity).toBeDefined();
      expect(decision.reasoning).toContain('detected');
    });

    it('should fall back on invalid JSON response', async () => {
      const mockOrchestrator = vi.fn().mockResolvedValue('This is not valid JSON');

      const decision = await routeTask(
        'refactor the code',
        mockOrchestrator
      );

      // Should use fallback heuristics
      expect(decision.tier).toBeDefined();
    });

    it('should use keyword-based routing for refactor tasks', async () => {
      const mockOrchestrator = vi.fn().mockRejectedValue(new Error('Fallback test'));

      const decision = await routeTask(
        'refactor the authentication module',
        mockOrchestrator
      );

      expect(decision.tier).toBeLessThanOrEqual(2);
      expect(decision.risk).toBe('high');
    });

    it('should use keyword-based routing for test tasks', async () => {
      const mockOrchestrator = vi.fn().mockRejectedValue(new Error('Fallback test'));

      const decision = await routeTask(
        'write unit tests for the helper functions',
        mockOrchestrator
      );

      expect(decision.tier).toBe(3);
      expect(decision.risk).toBe('low');
    });

    it('should use keyword-based routing for typo fixes', async () => {
      const mockOrchestrator = vi.fn().mockRejectedValue(new Error('Fallback test'));

      const decision = await routeTask(
        'fix the typo in the config file',
        mockOrchestrator
      );

      expect(decision.tier).toBe(4);
      expect(decision.complexity).toBeLessThanOrEqual(3);
    });
  });

  describe('formatRoutingDecision', () => {
    it('should format routing decision for display', () => {
      const tiers = loadTierConfig();
      const decision: RoutingDecision = {
        tier: 2,
        complexity: 7,
        contextRequired: 'high',
        risk: 'low',
        reasoning: 'Complex implementation task'
      };

      const formatted = formatRoutingDecision(decision, tiers);

      expect(formatted).toContain('Tier 2');
      expect(formatted).toContain('Senior');
      expect(formatted).toContain('7/10');
      expect(formatted).toContain('Complex implementation task');
    });

    it('should include model name in formatted output', () => {
      const tiers = loadTierConfig();
      const decision: RoutingDecision = {
        tier: 1,
        complexity: 9,
        contextRequired: 'high',
        risk: 'high',
        reasoning: 'Architectural decision'
      };

      const formatted = formatRoutingDecision(decision, tiers);

      expect(formatted).toContain('Model:');
    });
  });

  describe('task classification scenarios', () => {
    const scenarios = [
      {
        task: 'Refactor the entire authentication system to use OAuth2',
        expectedTierRange: [1, 2],
        description: 'Complex refactoring'
      },
      {
        task: 'Write a unit test for this utility function',
        expectedTierRange: [3, 3],
        description: 'Unit test writing'
      },
      {
        task: 'Fix the typo in the README',
        expectedTierRange: [4, 4],
        description: 'Typo fix'
      },
      {
        task: 'Add a new API endpoint for user registration',
        expectedTierRange: [2, 3],
        description: 'Feature implementation'
      },
      {
        task: 'Update the import statement',
        expectedTierRange: [4, 4],
        description: 'Simple import fix'
      },
      {
        task: 'Debug the complex memory leak issue',
        expectedTierRange: [1, 2],
        description: 'Complex debugging'
      }
    ];

    for (const { task, expectedTierRange, description } of scenarios) {
      it(`should classify "${description}" appropriately`, async () => {
        // Use fallback heuristics by making orchestrator fail
        const mockOrchestrator = vi.fn().mockRejectedValue(new Error('Test'));

        const decision = await routeTask(task, mockOrchestrator);

        expect(decision.tier).toBeGreaterThanOrEqual(expectedTierRange[0]);
        expect(decision.tier).toBeLessThanOrEqual(expectedTierRange[1]);
      });
    }
  });
});
