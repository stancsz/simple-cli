import { describe, it, expect, vi, beforeEach } from 'vitest';
import { crossAgencyPatternRecognition } from '../../src/mcp_servers/brain/tools/pattern_analysis.js';
import { EpisodicMemory } from '../../src/brain/episodic.js';
import { LLM } from '../../src/llm.js';

vi.mock('../../src/brain/episodic.js', () => ({
  EpisodicMemory: class {
    recall = vi.fn();
    store = vi.fn();
  }
}));

vi.mock('../../src/llm.js', () => ({
  LLM: class {
    generate = vi.fn();
  }
}));

describe('cross_agency_pattern_analysis', () => {
  let mockMemory: any;
  let mockLLM: any;

  beforeEach(() => {
    mockMemory = new EpisodicMemory('/mock/path');
    mockLLM = new LLM();
  });

  it('aggregates memories across agency namespaces, synthesizes with LLM, and stores meta-analysis', async () => {
    // Mock EpisodicMemory.recall
    mockMemory.recall.mockImplementation(async (topic: string, limit: number, namespace: string) => {
      if (namespace === 'agency_a') {
        return [{
          taskId: 'task_a_1',
          query: topic,
          solution: 'Outcome: success. Standardized API responses.',
          agentResponse: 'Success'
        }];
      } else if (namespace === 'agency_b') {
        return [{
          taskId: 'task_b_1',
          query: topic,
          solution: 'Outcome: failure. Memory limit exceeded.',
          agentResponse: 'Failure'
        }];
      }
      return [];
    });

    // Mock LLM.generate
    mockLLM.generate.mockResolvedValue({
      message: JSON.stringify({
        common_successes: ['Standardized API responses'],
        recurring_failures: ['Memory limit exceeded'],
        meta_recommendation: 'Increase memory limits and standardize API responses across all child agencies.'
      })
    });

    const topic = 'API Integration';
    const namespaces = ['agency_a', 'agency_b'];

    const result = await crossAgencyPatternRecognition(topic, namespaces, mockMemory, mockLLM);

    // Verify aggregation
    expect(mockMemory.recall).toHaveBeenCalledTimes(2);
    expect(mockMemory.recall).toHaveBeenCalledWith(topic, 5, 'agency_a');
    expect(mockMemory.recall).toHaveBeenCalledWith(topic, 5, 'agency_b');

    // Verify LLM synthesis
    expect(mockLLM.generate).toHaveBeenCalledTimes(1);
    const callArgs = mockLLM.generate.mock.calls[0];
    expect(callArgs[0]).toContain('AGGREGATED EXPERIENCES:');
    expect(callArgs[0]).toContain('agency_a');
    expect(callArgs[0]).toContain('agency_b');
    expect(callArgs[0]).toContain('Standardized API responses');

    // Verify storage of meta-analysis
    expect(mockMemory.store).toHaveBeenCalledTimes(1);
    const storeArgs = mockMemory.store.mock.calls[0];
    // memory.store(taskId, request, solution, artifacts, company, simulation_attempts, resolved_via_dreaming, dreaming_outcomes, id, tokens, duration, type, ...)
    // Our implementation does:
    // await memory.store(
    //   metaTaskId,
    //   `Cross-agency pattern analysis for topic: ${topic}`,
    //   JSON.stringify(synthesisDetails),
    //   [],
    //   undefined,
    //   undefined,
    //   undefined,
    //   undefined,
    //   undefined,
    //   undefined,
    //   undefined,
    //   "cross_agency_pattern"
    // );
    expect(storeArgs[0]).toMatch(/^meta_analysis_\d+$/); // taskId
    expect(storeArgs[1]).toBe(`Cross-agency pattern analysis for topic: ${topic}`); // request
    const storedSynthesis = JSON.parse(storeArgs[2]);
    expect(storedSynthesis.meta_recommendation).toBe('Increase memory limits and standardize API responses across all child agencies.'); // solution
    expect(storeArgs[11]).toBe('cross_agency_pattern'); // type

    // Verify returned result
    expect(result.summary).toContain('Identified 2 cross-agency experiences. Meta-recommendation generated.');
    expect(result.synthesis.common_successes).toContain('Standardized API responses');
    expect(result.details.length).toBe(2);
  });

  it('handles empty results gracefully', async () => {
    mockMemory.recall.mockResolvedValue([]);

    const result = await crossAgencyPatternRecognition('Unknown Topic', ['agency_c'], mockMemory, mockLLM);

    expect(mockMemory.recall).toHaveBeenCalledTimes(1);
    expect(mockLLM.generate).not.toHaveBeenCalled();
    expect(mockMemory.store).not.toHaveBeenCalled();
    expect(result.summary).toBe("No significant cross-agency patterns found for 'Unknown Topic'.");
    expect(result.details.length).toBe(0);
  });
});
