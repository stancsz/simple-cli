import { spawn, ChildProcess } from 'child_process';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { SwarmAgentConfig, SpawnRequest, ManagedAgent, SpawnResult, AgentStatus } from './types.js';

export class SwarmManager {
  private agents: Map<string, ManagedAgent> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private mcpConfigPath: string;

  constructor() {
    this.mcpConfigPath = join(process.cwd(), 'mcp.json');
  }

  async listAgents(): Promise<Record<string, SwarmAgentConfig>> {
    try {
      const content = await readFile(this.mcpConfigPath, 'utf-8');
      const config = JSON.parse(content);
      return config.swarmCapableAgents || {};
    } catch (error) {
      console.error('Failed to load mcp.json:', error);
      return {};
    }
  }

  async spawn(req: SpawnRequest): Promise<SpawnResult> {
    const availableAgents = await this.listAgents();
    const config = availableAgents[req.agent_type];

    if (!config) {
      throw new Error(`Unknown agent type: ${req.agent_type}`);
    }

    const env = {
      ...process.env,
      ...config.env,
      // Inject context via environment variable if it looks like an ID,
      // otherwise we might need to pass it via stdin or args.
      // For now, we assume strict adherence to 'context ID' if passing via env.
      JULES_CONTEXT_ID: req.initial_context,
      JULES_ROLE: req.role_description
    };

    const child = spawn(config.command, config.args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'], // We might want to stream this later
      detached: false
    });

    const id = randomUUID();
    const agent: ManagedAgent = {
      id,
      pid: child.pid || 0,
      type: req.agent_type,
      status: 'active',
      startTime: Date.now(),
      role_description: req.role_description
    };

    this.agents.set(id, agent);
    this.processes.set(id, child);

    // Setup basic listeners
    child.on('exit', (code) => {
      const current = this.agents.get(id);
      if (current) {
        current.status = code === 0 ? 'terminated' : 'failed';
        this.processes.delete(id);
      }
    });

    child.on('error', (err) => {
      console.error(`Agent ${id} error:`, err);
      const current = this.agents.get(id);
      if (current) {
        current.status = 'failed';
      }
    });

    // If context is a string (not ID) and agent supports stdin, write it
    if (config.supports_stdin && req.initial_context && !req.initial_context.startsWith('ctx-')) {
        child.stdin?.write(`Context: ${req.initial_context}\nRole: ${req.role_description}\n`);
    }

    return {
      swarm_agent_id: id,
      pid: child.pid || 0
    };
  }

  async terminate(id: string): Promise<boolean> {
    const child = this.processes.get(id);
    if (child) {
      child.kill();
      this.processes.delete(id);
      const agent = this.agents.get(id);
      if (agent) agent.status = 'terminated';
      return true;
    }
    return false;
  }

  getAgent(id: string): ManagedAgent | undefined {
    return this.agents.get(id);
  }

  getActiveAgents(): ManagedAgent[] {
    return Array.from(this.agents.values()).filter(a => a.status === 'active');
  }
}
