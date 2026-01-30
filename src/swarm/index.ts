/**
 * Swarm Module - Coordinate multiple Simple-CLI agents
 * 
 * @example
 * ```typescript
 * import { SwarmCoordinator } from 'simplecli/swarm';
 * 
 * const coordinator = new SwarmCoordinator({
 *   cwd: '/path/to/repo',
 *   concurrency: 4,
 *   yolo: true,
 * });
 * 
 * coordinator.addTasks([
 *   { id: 'task1', type: 'implement', description: '...', scope: {}, priority: 1, timeout: 300000, retries: 2 },
 *   { id: 'task2', type: 'test', description: '...', scope: {}, priority: 2, timeout: 180000, retries: 1 },
 * ]);
 * 
 * const result = await coordinator.run();
 * console.log(`Completed: ${result.completed}/${result.total}`);
 * ```
 */

// Types
export type {
  SwarmTask,
  TaskScope,
  TaskType,
  Priority,
  WorkerStatus,
  WorkerState,
  WorkerResult,
  TaskResult,
  FailedTask,
  SwarmResult,
  CoordinatorOptions,
  RetryPolicy,
  SwarmEventMap,
} from './types.js';

export {
  swarmTaskSchema,
  taskScopeSchema,
  DEFAULT_RETRY_POLICY,
  DEFAULT_COORDINATOR_OPTIONS,
} from './types.js';

// Task Queue
export { TaskQueue } from './task.js';

// Worker
export { Worker, WorkerPool } from './worker.js';
export type { WorkerOptions } from './worker.js';

// Coordinator
export { SwarmCoordinator, createSwarmCoordinator } from './coordinator.js';
