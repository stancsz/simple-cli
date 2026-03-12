import { describe, it, expect, vi, beforeEach } from 'vitest';
import { discoverPartnerAgencies, delegateCrossAgencyTask, monitorCrossAgencyProgress } from './index.js';
import * as federationTools from '../../federation/tools.js';

// Mock EpisodicMemory
vi.mock('../../../brain/episodic.js', () => ({
  EpisodicMemory: class {
    async store() { return true; }
    async recall() { return []; }
  }
}));

// Mock Federation tools
vi.mock('../../federation/tools.js', () => ({
  discoverAgencies: vi.fn(),
  delegateTask: vi.fn()
}));

describe('Meta-Orchestrator Tools Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('discoverPartnerAgencies', () => {
    it('should return mapped agency descriptors', async () => {
      const mockAgencies = [
        { agency_id: 'agency_1', endpoint: 'http://a1.com', capabilities: [], status: 'active', supported_protocols: [] }
      ];
      vi.mocked(federationTools.discoverAgencies).mockResolvedValue(mockAgencies as any);

      const result = await discoverPartnerAgencies();
      expect(result).toHaveLength(1);
      expect(result[0].agency_id).toBe('agency_1');
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(federationTools.discoverAgencies).mockRejectedValue(new Error('Discovery failed'));
      const result = await discoverPartnerAgencies();
      expect(result).toEqual([]);
    });
  });

  describe('delegateCrossAgencyTask', () => {
    it('should delegate task, update status, and return task object', async () => {
      vi.mocked(federationTools.delegateTask).mockResolvedValue({
        task_id: 'task_1',
        status: 'completed',
        result: 'Done'
      });

      const args = {
        task_id: 'task_1',
        agency_id: 'agency_x',
        task_description: 'Do work'
      };

      const result = await delegateCrossAgencyTask(args);
      expect(result.task_id).toBe('task_1');
      expect(result.status).toBe('completed');
      expect(result.result).toBe('Done');
    });
  });

  describe('monitorCrossAgencyProgress', () => {
    it('should return "failed/Not found" for unknown tasks', async () => {
      const result = await monitorCrossAgencyProgress(['unknown_id']);
      expect(result[0].status).toBe('failed');
      expect(result[0].error).toBe('Not found');
    });
  });
});
