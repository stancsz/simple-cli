export interface VulnerabilityReport {
    vulnerabilities: {
        critical: number;
        high: number;
        moderate: number;
        low: number;
    };
    totalDependencies: number;
    summary: string;
}

export interface AnomalyReport {
    metric: string;
    agent: string;
    timestamp: string;
    value: number;
    baselineAverage: number;
    baselineStdDev: number;
    deviationMultiplier: number;
    isAnomaly: boolean;
}
