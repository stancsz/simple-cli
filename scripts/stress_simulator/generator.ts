
// Helper functions for generating realistic multi-tenant workload patterns
// Used by tests/stress/long_running_stress.test.ts

export interface Metric {
    agent: string;
    metric: string;
    value: number;
    tags?: Record<string, any>;
}

export interface SOPLog {
    timestamp: string;
    company: string;
    sop: string;
    status: 'success' | 'failure';
    duration: number;
    error?: string;
}

export class StressGenerator {
    private companies: string[];
    private agents: string[] = ['job-delegator', 'sop-engine', 'reviewer', 'dreaming'];
    private metrics: string[] = ['latency', 'tokens', 'memory_usage', 'error_count'];
    private seed: number;

    constructor(companies: string[] = ['client-a', 'client-b', 'client-c'], seed: number = 12345) {
        this.companies = companies;
        this.seed = seed;
    }

    /**
     * Simple seeded random number generator (Linear Congruential Generator)
     * Returns a number between 0 and 1
     */
    private random(): number {
        const a = 1664525;
        const c = 1013904223;
        const m = 4294967296;
        this.seed = (a * this.seed + c) % m;
        return this.seed / m;
    }

    /**
     * Generate a random metric for tracking
     */
    generateRandomMetric(): Metric {
        const agent = this.agents[Math.floor(this.random() * this.agents.length)];
        const metric = this.metrics[Math.floor(this.random() * this.metrics.length)];
        let value = 0;

        // Realistic value ranges
        if (metric === 'latency') value = Math.floor(this.random() * 500) + 50; // 50-550ms
        else if (metric === 'tokens') value = Math.floor(this.random() * 2000) + 100;
        else if (metric === 'memory_usage') value = Math.floor(this.random() * 100) + 200; // MB
        else if (metric === 'error_count') value = this.random() > 0.95 ? 1 : 0; // 5% error rate

        const tags: Record<string, any> = {
            company: this.companies[Math.floor(this.random() * this.companies.length)]
        };

        return { agent, metric, value, tags };
    }

    /**
     * Generate a batch of metrics
     */
    generateMetricBatch(size: number = 10): Metric[] {
        return Array.from({ length: size }, () => this.generateRandomMetric());
    }

    /**
     * Generate a mock SOP execution log
     */
    generateSOPLog(): SOPLog {
        const company = this.companies[Math.floor(this.random() * this.companies.length)];
        const sop = ['onboarding', 'deployment', 'incident-response'][Math.floor(this.random() * 3)];
        const isSuccess = this.random() > 0.1; // 90% success rate
        const duration = Math.floor(this.random() * 5000) + 1000;

        return {
            timestamp: new Date().toISOString(),
            company,
            sop,
            status: isSuccess ? 'success' : 'failure',
            duration,
            error: isSuccess ? undefined : 'Timeout waiting for deployment'
        };
    }

    /**
     * Determine if a chaos event (failure) should occur
     */
    shouldTriggerChaos(): boolean {
        return this.random() > 0.9; // Increased to 10% for test visibility
    }

    /**
     * Get a type of failure to simulate
     */
    getChaosType(): 'timeout' | 'api_error' | 'db_connection_lost' {
        const types = ['timeout', 'api_error', 'db_connection_lost'] as const;
        return types[Math.floor(this.random() * types.length)];
    }
}
