import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import { Mutex } from 'async-mutex';

export interface WorkflowEvent {
  timestamp: string;
  type: string;
  message: string;
}

export interface Workflow {
  id: string;
  client: string;
  type: string;
  status: 'active' | 'paused' | 'escalated' | 'completed';
  schedule?: string;
  next_run?: string;
  last_run?: string;
  failure_count: number;
  history: WorkflowEvent[];
}

const AGENT_DIR = join(process.cwd(), '.agent');
const DB_FILE = join(AGENT_DIR, 'agency_workflows.json');

export class WorkflowRegistry {
  private mutex = new Mutex();

  private async ensureDb() {
    if (!existsSync(AGENT_DIR)) {
      await mkdir(AGENT_DIR, { recursive: true });
    }
  }

  async load(): Promise<Workflow[]> {
    // We can read without lock if we assume atomic writes, but for consistency within a transaction...
    // The mutex protects the read-modify-write cycle.
    if (!existsSync(DB_FILE)) return [];
    try {
      const content = await readFile(DB_FILE, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  async save(workflows: Workflow[]) {
    await this.ensureDb();
    await writeFile(DB_FILE, JSON.stringify(workflows, null, 2));
  }

  async register(client: string, type: string, schedule?: string): Promise<Workflow> {
    return await this.mutex.runExclusive(async () => {
        const workflows = await this.load();
        const wf: Workflow = {
          id: randomUUID(),
          client,
          type,
          status: 'active',
          schedule,
          failure_count: 0,
          history: [{ timestamp: new Date().toISOString(), type: 'created', message: `Workflow registered for ${client}` }]
        };
        workflows.push(wf);
        await this.save(workflows);
        return wf;
    });
  }

  async list(client?: string): Promise<Workflow[]> {
    // Read does not strictly need mutex if writeFile is atomic, but let's be safe if we want strictly serializable history
    // But for performance, reading without lock is usually fine for this use case.
    const workflows = await this.load();
    if (client) return workflows.filter(w => w.client === client);
    return workflows;
  }

  async updateStatus(id: string, status: Workflow['status'], message?: string) {
    return await this.mutex.runExclusive(async () => {
        const workflows = await this.load();
        const wf = workflows.find(w => w.id === id);
        if (!wf) throw new Error(`Workflow ${id} not found`);

        wf.status = status;
        wf.history.push({
          timestamp: new Date().toISOString(),
          type: 'status_change',
          message: message || `Status changed to ${status}`
        });
        await this.save(workflows);
        return wf;
    });
  }

  async get(id: string): Promise<Workflow | undefined> {
      const workflows = await this.load();
      return workflows.find(w => w.id === id);
  }
}
