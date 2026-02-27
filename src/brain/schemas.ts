export interface CorporateStrategy {
  vision: string;
  objectives: string[];
  policies: Record<string, any>;
  timestamp: number;
}

export interface CorporatePolicy {
  swarmId?: string;
  policy: Record<string, any>;
  effectiveFrom: string;
  issuedBy: string;
  timestamp: number;
}
