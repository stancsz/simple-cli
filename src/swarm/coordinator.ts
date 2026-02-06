/**
 * Swarm Coordinator - Orchestrates multiple workers executing tasks
 */

import { EventEmitter } from 'events';
import type {
  SwarmTask,
  CoordinatorOptions,
  SwarmResult,
  TaskResult,
  RetryPolicy,
  SwarmEventMap,
  WorkerResult,
} from './types.js';
import { DEFAULT_COORDINATOR_OPTIONS, DEFAULT_RETRY_POLICY } from './types.js';
import { TaskQueue } from './task.js';
import { Worker, WorkerPool } from './worker.js';
import { RemoteWorker } from './remote_worker.js';

export class SwarmCoordinator extends EventEmitter {
  private options: Required<CoordinatorOptions>;
  private taskQueue: TaskQueue;
  private workerPool: WorkerPool;
  private retryPolicy: RetryPolicy;
  private running: boolean = false;
  private startTime: number = 0;
  private aborted: boolean = false;
  private remoteWorkers: string[] = [];

  constructor(options: CoordinatorOptions = {}) {
    super();
    
    this.options = {
      ...DEFAULT_COORDINATOR_OPTIONS,
      ...options,
      retryPolicy: {
        ...DEFAULT_RETRY_POLICY,
        ...options.retryPolicy,
      },
    };

    this.retryPolicy = this.options.retryPolicy as RetryPolicy;
    this.taskQueue = new TaskQueue();

    if (process.env.SWARM_WORKERS) {
        this.remoteWorkers = process.env.SWARM_WORKERS.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    this.workerPool = new WorkerPool(this.options.concurrency, {
      cwd: this.options.cwd,
      yolo: this.options.yolo,
      timeout: this.options.timeout,
    }, this.remoteWorkers);
  }

  /**
   * Add a single task
   */
  addTask(task: SwarmTask): void {
    this.taskQueue.addTask(task);
  }

  /**
   * Add multiple tasks
   */
  addTasks(tasks: SwarmTask[]): void {
    this.taskQueue.addTasks(tasks);
  }

  /**
   * Get next task from queue
   */
  getTask(): SwarmTask | null {
    return this.taskQueue.getNextTask();
  }

  /**
   * Peek at next task
   */
  peekTask(): SwarmTask | null {
    return this.taskQueue.peekNextTask();
  }

  /**
   * Get all workers status
   */
  getAllWorkers() {
    return this.workerPool.getAllWorkers().map(w => w.getStatus());
  }

  /**
   * Get worker status by ID
   */
  getWorkerStatus(id: string) {
    return this.workerPool.getWorkerById(id)?.getStatus();
  }

  /**
   * Stop the swarm gracefully
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Abort immediately
   */
  abort(): void {
    this.aborted = true;
    this.running = false;
    this.workerPool.killAll();
  }

  /**
   * Run the swarm
   */
  async run(concurrency?: number): Promise<SwarmResult> {
    if (concurrency !== undefined) {
      this.options.concurrency = concurrency;
      this.workerPool = new WorkerPool(concurrency, {
        cwd: this.options.cwd,
        yolo: this.options.yolo,
        timeout: this.options.timeout,
      }, this.remoteWorkers);
    }

    this.running = true;
    this.aborted = false;
    this.startTime = Date.now();

    // Skip tasks blocked by failed dependencies
    const skipped = this.taskQueue.skipBlockedTasks();
    for (const taskId of skipped) {
      const task = this.taskQueue.getTask(taskId);
      if (task) {
        this.emit('task:fail', task, new Error('Blocked by failed dependency'));
      }
    }

    // Process tasks
    await this.processLoop();

    // Mark as no longer running
    this.running = false;

    // Build result
    const stats = this.taskQueue.getStats();
    const results = this.taskQueue.getResults();
    const failures = this.taskQueue.getFailures();
    const duration = Date.now() - this.startTime;

    const result: SwarmResult = {
      total: stats.total,
      completed: stats.completed,
      failed: stats.failed,
      skipped: skipped.length,
      duration,
      successRate: stats.total > 0 ? stats.completed / stats.total : 0,
      results,
      failedTasks: failures,
    };

    this.emit('swarm:complete', result);
    return result;
  }

  /**
   * Main processing loop
   */
  private async processLoop(): Promise<void> {
    const activePromises: Map<string, Promise<void>> = new Map();

    while (this.running && !this.aborted) {
      // Check if done
      if (this.taskQueue.isDone() && activePromises.size === 0) {
        break;
      }

      // Skip blocked tasks
      const skipped = this.taskQueue.skipBlockedTasks();
      for (const taskId of skipped) {
        const task = this.taskQueue.getTask(taskId);
        if (task) {
          this.emit('task:fail', task, new Error('Blocked by failed dependency'));
        }
      }

      // Try to start new tasks
      while (this.workerPool.getAvailableCount() > 0) {
        const task = this.taskQueue.getNextTask();
        if (!task) break;

        const worker = this.workerPool.getWorker();
        if (!worker) {
          // No worker available, put task back
          this.taskQueue.addTask(task);
          break;
        }

        // Start task execution
        const promise = this.executeTask(worker, task);
        activePromises.set(task.id, promise);

        promise.finally(() => {
          activePromises.delete(task.id);
        });
      }

      // Wait a bit before checking again
      if (activePromises.size > 0) {
        await Promise.race([
          ...activePromises.values(),
          this.sleep(100),
        ]);
      } else if (this.taskQueue.hasWork()) {
        // Have work but no available workers, wait
        await this.sleep(100);
      } else {
        break;
      }
    }

    // Wait for remaining tasks to complete
    if (activePromises.size > 0) {
      await Promise.all(activePromises.values());
    }
  }

  /**
   * Execute a single task on a worker
   */
  private async executeTask(worker: Worker | RemoteWorker, task: SwarmTask): Promise<void> {
    const attempt = this.taskQueue.getAttempts(task.id) + 1;
    
    this.emit('task:start', task, worker.id);
    if (attempt > 1) {
      this.emit('task:retry', task, attempt);
    }

    try {
      const result = await worker.execute(task);
      
      if (result.success) {
        const taskResult: TaskResult = {
          task,
          workerId: worker.id,
          result,
        };
        this.taskQueue.completeTask(task.id, taskResult);
        this.emit('task:complete', task, result);
      } else {
        const willRetry = this.taskQueue.failTask(
          task.id,
          result.error || 'Unknown error',
          this.retryPolicy.maxRetries
        );
        
        if (!willRetry) {
          this.emit('task:fail', task, new Error(result.error || 'Max retries exceeded'));
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const willRetry = this.taskQueue.failTask(
        task.id,
        errorMsg,
        this.retryPolicy.maxRetries
      );
      
      if (!willRetry) {
        this.emit('task:fail', task, error instanceof Error ? error : new Error(errorMsg));
      }
    } finally {
      // Release worker back to pool
      this.workerPool.releaseWorker(worker);
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return this.taskQueue.getStats();
  }

  /**
   * Check if swarm is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Type-safe event emitter methods
   */
  on<K extends keyof SwarmEventMap>(event: K, listener: SwarmEventMap[K]): this {
    return super.on(event, listener);
  }

  emit<K extends keyof SwarmEventMap>(event: K, ...args: Parameters<SwarmEventMap[K]>): boolean {
    return super.emit(event, ...args);
  }
}

/**
 * Create a swarm coordinator
 */
export function createSwarmCoordinator(options?: CoordinatorOptions): SwarmCoordinator {
  return new SwarmCoordinator(options);
}
