/**
 * Worker - Spawns and manages Simple-CLI worker processes
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { SwarmTask, WorkerStatus, WorkerResult, WorkerState } from './types.js';

export interface WorkerOptions {
  cwd: string;
  yolo: boolean;
  timeout: number;
  env?: Record<string, string>;
}

export class Worker extends EventEmitter {
  readonly id: string;
  private process: ChildProcess | null = null;
  private state: WorkerState = 'idle';
  private currentTask: SwarmTask | null = null;
  private startedAt: number = 0;
  private output: string = '';
  private options: WorkerOptions;
  private isTerminating: boolean = false;
  private onUnexpectedExit = (code: number | null) => {
    if (!this.isTerminating) {
      this.emit('error', new Error(`Worker process exited unexpectedly with code ${code}`));
    }
  };

  constructor(options: WorkerOptions) {
    super();
    this.id = `worker-${randomUUID().slice(0, 8)}`;
    this.options = options;
  }

  /**
   * Get current worker status
   */
  getStatus(): WorkerStatus {
    return {
      id: this.id,
      pid: this.process?.pid,
      state: this.state,
      currentTask: this.currentTask?.id,
      startedAt: this.startedAt || undefined,
      completedAt: this.state === 'completed' || this.state === 'failed' ? Date.now() : undefined,
    };
  }

  /**
   * Execute a task
   */
  async execute(task: SwarmTask): Promise<WorkerResult> {
    if (this.state === 'running') {
      throw new Error(`Worker ${this.id} is already running a task`);
    }

    this.currentTask = task;
    this.state = 'running';
    this.startedAt = Date.now();
    this.output = '';

    return new Promise((resolve, reject) => {
      const timeout = task.timeout || this.options.timeout;
      let timeoutId: NodeJS.Timeout | null = null;
      let resolved = false;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        this.process = null;
      };

      const finish = (result: WorkerResult) => {
        if (resolved) return;
        resolved = true;
        cleanup();

        this.state = result.success ? 'completed' : 'failed';
        this.emit('complete', result);
        resolve(result);
      };

      // Build the prompt from task
      const prompt = this.buildPrompt(task);

      // Spawn Simple-CLI process
      const args = ['--yolo'];
      if (this.options.yolo) args.push('--yolo');
      args.push(prompt);

      // Use node to run the CLI directly
      const cliPath = new URL('../index.js', import.meta.url).pathname;

      this.process = spawn('node', [cliPath, ...args], {
        cwd: this.options.cwd,
        env: {
          ...process.env,
          ...this.options.env,
          SIMPLE_CLI_WORKER: this.id,
          SIMPLE_CLI_TASK: task.id,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.emit('spawn', this.getStatus());

      // Collect output
      this.process.stdout?.on('data', (data) => {
        this.output += data.toString();
      });

      this.process.stderr?.on('data', (data) => {
        this.output += data.toString();
      });

      // Handle process exit
      this.process.on('close', (code) => {
        const duration = Date.now() - this.startedAt;
        const success = code === 0;

        // Parse output for changed files (simplified)
        const filesChanged = this.parseChangedFiles(this.output);
        const commitHash = this.parseCommitHash(this.output);

        finish({
          success,
          filesChanged,
          commitHash,
          error: success ? undefined : `Process exited with code ${code}`,
          duration,
          output: this.output,
        });
      });

      this.process.on('error', (err) => {
        finish({
          success: false,
          filesChanged: [],
          error: err.message,
          duration: Date.now() - this.startedAt,
          output: this.output,
        });
      });

      // Set timeout
      timeoutId = setTimeout(() => {
        if (!resolved) {
          (async () => {
            try {
              await this.kill();
            } catch (e) { /* best-effort */ }
            finish({
              success: false,
              filesChanged: [],
              error: `Task timed out after ${timeout}ms`,
              duration: timeout,
              output: this.output,
            });
          })();
        }
      }, timeout);

      // Send task to stdin and close
      this.process.stdin?.write(prompt);
      this.process.stdin?.end();
    });
  }

  /**
   * Build prompt from task
   */
  private buildPrompt(task: SwarmTask): string {
    let prompt = task.description;

    if (task.scope.files && task.scope.files.length > 0) {
      prompt += `\n\nFocus on these files: ${task.scope.files.join(', ')}`;
    }

    if (task.scope.directories && task.scope.directories.length > 0) {
      prompt += `\n\nWork in these directories: ${task.scope.directories.join(', ')}`;
    }

    if (task.scope.pattern) {
      prompt += `\n\nApply to files matching: ${task.scope.pattern}`;
    }

    return prompt;
  }

  /**
   * Parse changed files from output
   */
  private parseChangedFiles(output: string): string[] {
    const files: string[] = [];

    // Look for common patterns indicating file changes
    const patterns = [
      /(?:wrote|created|modified|updated)\s+([^\s]+)/gi,
      /\[Result\].*(?:wrote|created)\s+([^\s]+)/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const file = match[1].replace(/['"`,]/g, '');
        if (file && !files.includes(file)) {
          files.push(file);
        }
      }
    }

    return files;
  }

  /**
   * Parse commit hash from output
   */
  private parseCommitHash(output: string): string | undefined {
    const match = output.match(/commit\s+([a-f0-9]{7,40})/i);
    return match ? match[1] : undefined;
  }

  /**
   * Kill the worker process
   */
  kill(): void {
    // Keep backwards-compatible signature: return a Promise but allow callers to ignore it.
    const graceMs = 5000;
    const promise = (async () => {
      if (!this.process) return;
      if (this.process.killed) return;
      this.isTerminating = true;
      // stop reporting unexpected-exit while we intentionally terminate
      try { this.process.off('exit', this.onUnexpectedExit); } catch (e) { }

      // If IPC is available, politely ask the child to shutdown
      try {
        if ((this.process as any).connected) {
          try { (this.process as any).send({ type: 'shutdown' }); } catch (e) { }
        }
      } catch (e) { }

      try {
        this.process.kill('SIGTERM');
      } catch (e) {
        // ignore
      }

      // wait for exit up to graceMs, otherwise force-kill
      await new Promise((resolve) => {
        let resolved = false;
        const onExit = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          resolve(undefined);
        };
        const timer = setTimeout(() => {
          try { if (this.process && !this.process.killed) this.process.kill('SIGKILL'); } catch (e) { }
          // still wait for exit event
        }, graceMs);
        try { if (this.process) this.process.once('exit', onExit); } catch (e) { resolve(undefined); }
      });

      try { this.process = null; } catch (e) { }
    })();
    // Log kill action for auditing
    try {
      const fs = require('fs');
      const path = require('path');
      fs.appendFileSync(path.join(process.cwd(), '.worker_kill.log'), `${new Date().toISOString()} kill requested for worker ${this.id}\n`);
    } catch (e) { }
    return promise as unknown as void;
  }

  /**
   * Check if worker is busy
   */
  isBusy(): boolean {
    return this.state === 'running';
  }

  /**
   * Check if worker is available
   */
  isAvailable(): boolean {
    return this.state === 'idle' || this.state === 'completed' || this.state === 'failed';
  }

  /**
   * Reset worker for reuse
   */
  reset(): void {
    this.state = 'idle';
    this.currentTask = null;
    this.startedAt = 0;
    this.output = '';
    this.process = null;
  }

  /**
   * Get task output
   */
  getOutput(): string {
    return this.output;
  }
}

/**
 * Worker pool for managing multiple workers
 */
export class WorkerPool {
  private workers: Worker[] = [];
  private inUse: Set<string> = new Set();
  private options: WorkerOptions;
  private maxWorkers: number;

  constructor(maxWorkers: number, options: WorkerOptions) {
    this.maxWorkers = maxWorkers;
    this.options = options;
  }

  /**
   * Get an available worker (or create one if pool not full)
   */
  getWorker(): Worker | null {
    // Create new worker if pool not full
    if (this.workers.length < this.maxWorkers) {
      const worker = new Worker(this.options);
      this.workers.push(worker);
      this.inUse.add(worker.id);
      return worker;
    }

    // Try to find an available worker that's not in use
    const available = this.workers.find(w => w.isAvailable() && !this.inUse.has(w.id));
    if (available) {
      available.reset();
      this.inUse.add(available.id);
      return available;
    }

    return null;
  }

  /**
   * Release a worker back to the pool
   */
  releaseWorker(worker: Worker): void {
    this.inUse.delete(worker.id);
  }

  /**
   * Get all workers
   */
  getAllWorkers(): Worker[] {
    return [...this.workers];
  }

  /**
   * Get worker by ID
   */
  getWorkerById(id: string): Worker | undefined {
    return this.workers.find(w => w.id === id);
  }

  /**
   * Get number of busy workers
   */
  getBusyCount(): number {
    return this.workers.filter(w => w.isBusy()).length;
  }

  /**
   * Get number of available workers
   */
  getAvailableCount(): number {
    return Math.max(0, this.maxWorkers - this.getBusyCount());
  }

  /**
   * Kill all workers
   */
  killAll(): void {
    for (const worker of this.workers) {
      worker.kill();
    }
  }

  /**
   * Get pool status
   */
  getStatus(): { total: number; busy: number; available: number } {
    return {
      total: this.workers.length,
      busy: this.getBusyCount(),
      available: this.getAvailableCount(),
    };
  }
}
