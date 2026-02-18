export interface Bid {
  taskId: string;
  agentName: string;
  proposal: string;
  estimatedTime: string;
  cost: number;
  confidenceScore: number; // 0-1
}

export interface AgentRole {
  role: string;
  requiredSkills: string[];
  count: number;
}

export interface TeamFormation {
  teamName: string;
  leadAgent: string;
  roles: AgentRole[];
  objective: string;
}

export interface DelegationNode {
  agentName: string;
  role: string;
  children: DelegationNode[];
  task?: string;
  status: 'idle' | 'working' | 'completed' | 'failed';
}

export interface DelegationTree {
  id: string;
  root: DelegationNode;
  objective: string;
  status: 'active' | 'completed' | 'failed';
}
