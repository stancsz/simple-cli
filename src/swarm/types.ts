/**
 * Swarm Types - Type definitions for swarm coordination
 */

import { z } from 'zod';

// Task priority levels
export type Priority = 1 | 2 | 3;

// Task types
export type TaskType = 'implement' | 'test' | 'refactor' | 'review' | 'fix';

// Worker states
export type WorkerState = 'idle' | 'running' | 'completed' | 'failed';

// Task scope schema
export const taskScopeSchema = z.object({
  files: z.array(z.string()).optional(),
  directories: z.array(z.string()).optional(),
  pattern: z.string().optional(),
});

export type TaskScope = z.infer<typeof taskScopeSchema>;

// Task definition schema
export const swarmTaskSchema = z.object({
  id: z.string(),
  type: z.enum(['implement', 'test', 'refactor', 'review', 'fix']),
  description: z.string(),
  scope: taskScopeSchema,
  dependencies: z.array(z.string()).optional().default([]),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  timeout: z.number().default(300000),  // 5 minutes
  retries: z.number().default(2),
});

export type SwarmTask = z.infer<typeof swarmTaskSchema>;

// Worker result
export interface WorkerResult {
  success: boolean;
  filesChanged: string[];
  commitHash?: string;
  error?: string;
  duration: number;
  output?: string;
}

// Worker status
export interface WorkerStatus {
  id: string;
  pid?: number;
  state: WorkerState;
  currentTask?: string;
  startedAt?: number;
  completedAt?: number;
  result?: WorkerResult;
}

// Retry policy
export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
}

// Coordinator options
export interface CoordinatorOptions {
  cwd?: string;
  concurrency?: number;
  branch?: string;
  yolo?: boolean;
  retryPolicy?: Partial<RetryPolicy>;
  timeout?: number;
}

// Swarm result
export interface SwarmResult {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  duration: number;
  successRate: number;
  results: TaskResult[];
  failedTasks: FailedTask[];
}

// Individual task result
export interface TaskResult {
  task: SwarmTask;
  workerId: string;
  result: WorkerResult;
}

// Failed task entry
export interface FailedTask {
  task: SwarmTask;
  error: string;
  attempts: number;
}

// Event types
export type SwarmEventMap = {
  'task:start': (task: SwarmTask, workerId: string) => void;
  'task:complete': (task: SwarmTask, result: WorkerResult) => void;
  'task:fail': (task: SwarmTask, error: Error) => void;
  'task:retry': (task: SwarmTask, attempt: number) => void;
  'worker:spawn': (worker: WorkerStatus) => void;
  'worker:exit': (worker: WorkerStatus, code: number) => void;
  'swarm:complete': (result: SwarmResult) => void;
};

// Default retry policy
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  backoffMs: 1000,
  backoffMultiplier: 2,
  maxBackoffMs: 30000,
};

// Default coordinator options
export const DEFAULT_COORDINATOR_OPTIONS: Required<CoordinatorOptions> = {
  cwd: process.cwd(),
  concurrency: 4,
  branch: 'main',
  yolo: false,
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeout: 600000,  // 10 minutes
};
