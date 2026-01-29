/**
 * Task Queue - Priority-based task queue with dependency tracking
 */

import type { SwarmTask, Priority, TaskResult, FailedTask } from './types.js';
import { swarmTaskSchema } from './types.js';

export class TaskQueue {
  private tasks: Map<string, SwarmTask> = new Map();
  private pending: Set<string> = new Set();
  private running: Set<string> = new Set();
  private completed: Set<string> = new Set();
  private failed: Set<string> = new Set();
  private results: Map<string, TaskResult> = new Map();
  private failures: Map<string, FailedTask> = new Map();
  private attempts: Map<string, number> = new Map();

  /**
   * Add a task to the queue
   */
  addTask(task: SwarmTask): void {
    const validated = swarmTaskSchema.parse(task);
    this.tasks.set(validated.id, validated);
    this.pending.add(validated.id);
    this.attempts.set(validated.id, 0);
  }

  /**
   * Add multiple tasks
   */
  addTasks(tasks: SwarmTask[]): void {
    for (const task of tasks) {
      this.addTask(task);
    }
  }

  /**
   * Get next available task (respects dependencies and priorities)
   */
  getNextTask(): SwarmTask | null {
    const available = this.getAvailableTasks();
    if (available.length === 0) return null;

    // Sort by priority (1 = highest)
    available.sort((a, b) => a.priority - b.priority);
    
    const task = available[0];
    this.pending.delete(task.id);
    this.running.add(task.id);
    
    return task;
  }

  /**
   * Get all tasks that are ready to run
   */
  getAvailableTasks(): SwarmTask[] {
    const available: SwarmTask[] = [];

    for (const taskId of this.pending) {
      const task = this.tasks.get(taskId)!;
      if (this.areDependenciesMet(task)) {
        available.push(task);
      }
    }

    return available;
  }

  /**
   * Check if a task's dependencies are all completed
   */
  areDependenciesMet(task: SwarmTask): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }

    return task.dependencies.every(depId => this.completed.has(depId));
  }

  /**
   * Mark a task as completed
   */
  completeTask(taskId: string, result: TaskResult): void {
    this.running.delete(taskId);
    this.completed.add(taskId);
    this.results.set(taskId, result);
  }

  /**
   * Mark a task as failed (may retry)
   */
  failTask(taskId: string, error: string, maxRetries: number): boolean {
    const attempts = (this.attempts.get(taskId) || 0) + 1;
    this.attempts.set(taskId, attempts);

    if (attempts < maxRetries) {
      // Retry: move back to pending
      this.running.delete(taskId);
      this.pending.add(taskId);
      return true; // Will retry
    }

    // Max retries exceeded
    this.running.delete(taskId);
    this.failed.add(taskId);
    
    const task = this.tasks.get(taskId)!;
    this.failures.set(taskId, {
      task,
      error,
      attempts,
    });
    
    return false; // No more retries
  }

  /**
   * Get number of attempts for a task
   */
  getAttempts(taskId: string): number {
    return this.attempts.get(taskId) || 0;
  }

  /**
   * Peek at next task without removing it
   */
  peekNextTask(): SwarmTask | null {
    const available = this.getAvailableTasks();
    if (available.length === 0) return null;
    available.sort((a, b) => a.priority - b.priority);
    return available[0];
  }

  /**
   * Check if all tasks are done (completed or failed)
   */
  isDone(): boolean {
    return this.pending.size === 0 && this.running.size === 0;
  }

  /**
   * Check if there's any work to do
   */
  hasWork(): boolean {
    return this.pending.size > 0 || this.running.size > 0;
  }

  /**
   * Check if any tasks are currently running
   */
  hasRunning(): boolean {
    return this.running.size > 0;
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  } {
    return {
      total: this.tasks.size,
      pending: this.pending.size,
      running: this.running.size,
      completed: this.completed.size,
      failed: this.failed.size,
    };
  }

  /**
   * Get all results
   */
  getResults(): TaskResult[] {
    return Array.from(this.results.values());
  }

  /**
   * Get all failures
   */
  getFailures(): FailedTask[] {
    return Array.from(this.failures.values());
  }

  /**
   * Get a specific task
   */
  getTask(taskId: string): SwarmTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): SwarmTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.tasks.clear();
    this.pending.clear();
    this.running.clear();
    this.completed.clear();
    this.failed.clear();
    this.results.clear();
    this.failures.clear();
    this.attempts.clear();
  }

  /**
   * Cancel a pending task
   */
  cancelTask(taskId: string): boolean {
    if (this.pending.has(taskId)) {
      this.pending.delete(taskId);
      this.tasks.delete(taskId);
      return true;
    }
    return false;
  }

  /**
   * Check if a task is blocked by failed dependencies
   */
  isBlocked(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || !task.dependencies) return false;
    
    return task.dependencies.some(depId => this.failed.has(depId));
  }

  /**
   * Skip tasks that are blocked by failed dependencies
   */
  skipBlockedTasks(): string[] {
    const skipped: string[] = [];
    
    for (const taskId of [...this.pending]) {
      if (this.isBlocked(taskId)) {
        this.pending.delete(taskId);
        this.failed.add(taskId);
        
        const task = this.tasks.get(taskId)!;
        this.failures.set(taskId, {
          task,
          error: 'Skipped due to failed dependency',
          attempts: 0,
        });
        
        skipped.push(taskId);
      }
    }
    
    return skipped;
  }
}
