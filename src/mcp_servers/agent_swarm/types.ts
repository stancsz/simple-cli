export interface SwarmAgentConfig {
  command: string;
  args: string[];
  description: string;
  env?: Record<string, string>;
  supports_stdin?: boolean;
}

export interface SpawnRequest {
  agent_type: string;
  role_description: string;
  initial_context: string; // Context string or ID
}

export interface SpawnResult {
  swarm_agent_id: string;
  pid: number;
}

export type AgentStatus = 'active' | 'terminated' | 'failed';

export interface ManagedAgent {
  id: string;
  pid: number;
  type: string;
  status: AgentStatus;
  startTime: number;
  role_description: string;
}

export interface TaskResult {
  swarm_agent_id: string;
  result: string;
  status: 'success' | 'failure';
}
