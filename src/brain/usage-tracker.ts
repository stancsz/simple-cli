export interface BrainStats {
  queries: number;
  hits: number;
  misses: number;
  writes: number;
}

export class BrainUsageTracker {
  private static instance: BrainUsageTracker;
  private stats: Record<string, BrainStats> = {};

  private constructor() {}

  static getInstance(): BrainUsageTracker {
    if (!BrainUsageTracker.instance) {
      BrainUsageTracker.instance = new BrainUsageTracker();
    }
    return BrainUsageTracker.instance;
  }

  trackQuery(agentId: string, hit: boolean) {
    if (!this.stats[agentId]) {
      this.stats[agentId] = { queries: 0, hits: 0, misses: 0, writes: 0 };
    }
    this.stats[agentId].queries++;
    if (hit) {
      this.stats[agentId].hits++;
    } else {
      this.stats[agentId].misses++;
    }
  }

  trackWrite(agentId: string) {
    if (!this.stats[agentId]) {
      this.stats[agentId] = { queries: 0, hits: 0, misses: 0, writes: 0 };
    }
    this.stats[agentId].writes++;
  }

  getStats(): Record<string, BrainStats> {
    // Return a deep copy to prevent external modification
    return JSON.parse(JSON.stringify(this.stats));
  }
}
