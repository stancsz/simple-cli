import { readFile, writeFile, rename, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';

export interface TaskState {
  id: string;
  name: string;
  startTime: number;
  pid?: number;
}

export interface DaemonState {
  daemonStartedAt: number;
  lastHeartbeat: number;
  restarts: number;
  schedulerPid: number | null;
  schedulerStatus: 'running' | 'stopped' | 'crashed' | 'starting';
  activeTasks: TaskState[];
}

export class StateManager {
  private stateFile: string;
  private tempFile: string;

  constructor(agentDir: string) {
    this.stateFile = join(agentDir, 'daemon_state.json');
    this.tempFile = join(agentDir, 'daemon_state.tmp');
  }

  async loadState(): Promise<DaemonState> {
    if (!existsSync(this.stateFile)) {
      return this.getDefaultState();
    }
    try {
      const content = await readFile(this.stateFile, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      console.error(`[StateManager] Failed to load state: ${e}. Resetting.`);
      return this.getDefaultState();
    }
  }

  async saveState(state: DaemonState): Promise<void> {
    try {
      const content = JSON.stringify(state, null, 2);
      // Atomic write: write to temp then rename
      await writeFile(this.tempFile, content);
      await rename(this.tempFile, this.stateFile);
    } catch (e) {
      console.error(`[StateManager] Failed to save state: ${e}`);
    }
  }

  async update(updater: (state: DaemonState) => void): Promise<void> {
    const state = await this.loadState();
    updater(state);
    await this.saveState(state);
  }

  private getDefaultState(): DaemonState {
    return {
      daemonStartedAt: Date.now(),
      lastHeartbeat: Date.now(),
      restarts: 0,
      schedulerPid: null,
      schedulerStatus: 'stopped',
      activeTasks: []
    };
  }
}
