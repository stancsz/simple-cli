export interface CorporateStrategy {
  vision: string;
  objectives: string[];
  policies: Record<string, any>;
  timestamp: number;
}

export interface CorporatePolicy {
    id: string;
    version: number;
    name: string;
    description: string;
    parameters: {
        min_margin: number;
        risk_tolerance: "low" | "medium" | "high";
        max_agents_per_swarm: number;
        [key: string]: any;
    };
    isActive: boolean;
    timestamp: number;
    author: string;
    previous_version_id?: string;
}
