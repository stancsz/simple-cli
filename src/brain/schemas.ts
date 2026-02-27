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

export interface BoardResolution {
    id: string;
    timestamp: number;
    decision: string;
    strategic_direction: string;
    policy_updates?: {
        min_margin?: number;
        risk_tolerance?: "low" | "medium" | "high";
        max_agents_per_swarm?: number;
    };
    rationale: string;
    vote_count: {
        for: number;
        against: number;
        abstain: number;
    };
}

export interface BoardMeetingMinutes {
    meeting_id: string;
    date: string;
    attendees: string[]; // ["CEO", "CFO", "CSO"]
    agenda_items: string[];
    discussion_summary: string;
    resolutions: BoardResolution[];
    next_meeting_date?: string;
}
