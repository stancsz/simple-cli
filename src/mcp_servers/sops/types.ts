export interface SOPStep {
    name: string;
    instruction: string;
}

export interface SOP {
    name: string;
    goal: string;
    prerequisites: string[];
    steps: SOPStep[];
}

export interface StepLog {
    step_index: number;
    instruction: string;
    tool?: string;
    args?: any;
    output?: any;
    status: "success" | "failure" | "skipped";
    error?: string;
    timestamp: string;
}

export interface SOPProgress {
    sop_name: string;
    current_step_index: number;
    status: "pending" | "in_progress" | "completed" | "failed";
    history: StepLog[];
}
