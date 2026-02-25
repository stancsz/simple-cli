export interface ScalingMetrics {
    pendingTasks: number;
    totalAgents: number;
    activeAgents: number; // For now same as total, unless we track busy
    idleAgents: number;
}

export interface SwarmMetrics {
    total_agents: number;
    active_agents: number;
    agents: Array<{
        id: string;
        role: string;
        parentId?: string;
        lastActive?: number;
        idleSeconds: number;
    }>;
}

export interface SchedulerState {
  pendingTasks: any[]; // TaskDefinition[]
}
