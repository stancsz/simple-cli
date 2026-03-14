import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runEcosystemEvolutionShowcase } from '../../demos/phase36_ecosystem_evolution_showcase.js';
import * as llmModule from '../../src/llm.js';

// Mock dependencies
vi.mock('../../src/brain/episodic.js', () => ({
  EpisodicMemory: vi.fn().mockImplementation(() => ({
    store: vi.fn().mockResolvedValue(true),
    recall: vi.fn().mockResolvedValue([])
  }))
}));

vi.mock('../../src/mcp_servers/brain/tools/pattern_analysis.js', () => ({
  analyzeEcosystemPatterns: vi.fn().mockResolvedValue({ analysis: 'mocked insights' })
}));

vi.mock('../../src/mcp_servers/brain/tools/market_shock.js', () => ({
  monitorMarketSignals: vi.fn().mockResolvedValue({ status: 'stable' })
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  return {
    Client: vi.fn().mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(true),
      callTool: vi.fn().mockResolvedValue({
        content: [{ text: JSON.stringify({ metrics: "mocked" }) }]
      }),
      close: vi.fn().mockResolvedValue(true)
    }))
  };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({}))
}));

describe('Phase 36: Showcase Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should run showcase and output expected ecosystem morphology actions', async () => {
    const mockDecisions = [
      {
        action: 'spawn',
        target_agencies: [],
        rationale: 'Overloaded frontend role detected. Spawning another.',
        expected_impact: 'Increased throughput for frontend tasks.',
        config: { role: 'frontend', resource_limit: 10000 }
      },
      {
        action: 'merge',
        target_agencies: ['child-backend-1', 'child-backend-2'],
        rationale: 'Underutilized backend agencies detected. Merging them.',
        expected_impact: 'Saved resources.',
        config: { merge_into: 'child-backend-1' }
      },
      {
        action: 'retire',
        target_agencies: ['child-database-old'],
        rationale: 'Failing database agency. Retiring.',
        expected_impact: 'Clean up ecosystem.',
      }
    ];

    vi.spyOn(llmModule, 'createLLM').mockReturnValue({
      generate: vi.fn().mockResolvedValue({
        raw: JSON.stringify(mockDecisions)
      }),
      embed: vi.fn()
    } as any);

    // Capture console output to verify log lines
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(runEcosystemEvolutionShowcase()).resolves.not.toThrow();

    // Verify key steps in the output logs
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Phase 36: Autonomous Ecosystem Evolution'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('SPAWN'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('MERGE'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('RETIRE'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('New Role: frontend'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Targets: child-backend-1, child-backend-2'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Targets: child-database-old'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Evolution Cycle Complete.'));

    consoleLogSpy.mockRestore();
  });
});
