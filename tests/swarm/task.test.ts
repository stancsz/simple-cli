/**
 * Tests for TaskQueue
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskQueue } from '../../src/swarm/task.js';
import type { SwarmTask, TaskResult } from '../../src/swarm/types.js';

describe('TaskQueue', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue();
  });

  describe('addTask', () => {
    it('should add a task to the queue', () => {
      const task: SwarmTask = {
        id: 'task-1',
        type: 'implement',
        description: 'Test task',
        scope: { files: ['test.ts'] },
        priority: 1,
        timeout: 60000,
        retries: 2,
      };

      queue.addTask(task);
      const stats = queue.getStats();

      expect(stats.total).toBe(1);
      expect(stats.pending).toBe(1);
    });

    it('should validate task schema', () => {
      expect(() => {
        queue.addTask({
          id: 'task-1',
          type: 'invalid' as any,
          description: 'Test',
          scope: {},
          priority: 1,
          timeout: 60000,
          retries: 2,
        });
      }).toThrow();
    });
  });

  describe('addTasks', () => {
    it('should add multiple tasks', () => {
      queue.addTasks([
        { id: 't1', type: 'implement', description: 'Task 1', scope: {}, priority: 1, timeout: 60000, retries: 1 },
        { id: 't2', type: 'test', description: 'Task 2', scope: {}, priority: 2, timeout: 60000, retries: 1 },
        { id: 't3', type: 'refactor', description: 'Task 3', scope: {}, priority: 3, timeout: 60000, retries: 1 },
      ]);

      expect(queue.getStats().total).toBe(3);
      expect(queue.getStats().pending).toBe(3);
    });
  });

  describe('getNextTask', () => {
    it('should return highest priority task first', () => {
      queue.addTasks([
        { id: 't1', type: 'implement', description: 'Low priority', scope: {}, priority: 3, timeout: 60000, retries: 1 },
        { id: 't2', type: 'test', description: 'High priority', scope: {}, priority: 1, timeout: 60000, retries: 1 },
        { id: 't3', type: 'refactor', description: 'Medium priority', scope: {}, priority: 2, timeout: 60000, retries: 1 },
      ]);

      const task = queue.getNextTask();

      expect(task?.id).toBe('t2');
      expect(task?.priority).toBe(1);
    });

    it('should move task to running state', () => {
      queue.addTask({ id: 't1', type: 'implement', description: 'Test', scope: {}, priority: 1, timeout: 60000, retries: 1 });
      
      queue.getNextTask();
      const stats = queue.getStats();

      expect(stats.pending).toBe(0);
      expect(stats.running).toBe(1);
    });

    it('should return null when queue is empty', () => {
      expect(queue.getNextTask()).toBeNull();
    });
  });

  describe('dependencies', () => {
    it('should respect task dependencies', () => {
      queue.addTasks([
        { id: 't1', type: 'implement', description: 'First', scope: {}, priority: 2, timeout: 60000, retries: 1 },
        { id: 't2', type: 'test', description: 'Second', scope: {}, dependencies: ['t1'], priority: 1, timeout: 60000, retries: 1 },
      ]);

      // t2 has higher priority but depends on t1
      const first = queue.getNextTask();
      expect(first?.id).toBe('t1');

      // t2 still blocked
      const second = queue.getNextTask();
      expect(second).toBeNull();

      // Complete t1
      queue.completeTask('t1', { task: first!, workerId: 'w1', result: { success: true, filesChanged: [], duration: 100 } });

      // Now t2 is available
      const third = queue.getNextTask();
      expect(third?.id).toBe('t2');
    });

    it('should block tasks when dependencies fail', () => {
      queue.addTasks([
        { id: 't1', type: 'implement', description: 'First', scope: {}, priority: 1, timeout: 60000, retries: 1 },
        { id: 't2', type: 'test', description: 'Second', scope: {}, dependencies: ['t1'], priority: 2, timeout: 60000, retries: 1 },
      ]);

      const task = queue.getNextTask();
      queue.failTask('t1', 'Error', 1); // Fail with no retries

      expect(queue.isBlocked('t2')).toBe(true);
    });
  });

  describe('completeTask', () => {
    it('should move task to completed state', () => {
      queue.addTask({ id: 't1', type: 'implement', description: 'Test', scope: {}, priority: 1, timeout: 60000, retries: 1 });
      
      const task = queue.getNextTask()!;
      const result: TaskResult = {
        task,
        workerId: 'worker-1',
        result: { success: true, filesChanged: ['file.ts'], duration: 1000 },
      };
      
      queue.completeTask('t1', result);
      const stats = queue.getStats();

      expect(stats.running).toBe(0);
      expect(stats.completed).toBe(1);
    });
  });

  describe('failTask', () => {
    it('should retry task if retries available', () => {
      queue.addTask({ id: 't1', type: 'implement', description: 'Test', scope: {}, priority: 1, timeout: 60000, retries: 2 });
      
      queue.getNextTask();
      const willRetry = queue.failTask('t1', 'Error', 3);

      expect(willRetry).toBe(true);
      expect(queue.getStats().pending).toBe(1);
      expect(queue.getStats().running).toBe(0);
    });

    it('should mark task as failed after max retries', () => {
      queue.addTask({ id: 't1', type: 'implement', description: 'Test', scope: {}, priority: 1, timeout: 60000, retries: 2 });
      
      // First attempt
      queue.getNextTask();
      queue.failTask('t1', 'Error', 2);

      // Second attempt
      queue.getNextTask();
      queue.failTask('t1', 'Error', 2);

      // Third attempt - should fail permanently
      queue.getNextTask();
      const willRetry = queue.failTask('t1', 'Error', 2);

      expect(willRetry).toBe(false);
      expect(queue.getStats().failed).toBe(1);
    });
  });

  describe('getAttempts', () => {
    it('should track attempt count', () => {
      queue.addTask({ id: 't1', type: 'implement', description: 'Test', scope: {}, priority: 1, timeout: 60000, retries: 3 });

      expect(queue.getAttempts('t1')).toBe(0);

      queue.getNextTask();
      queue.failTask('t1', 'Error', 5);

      expect(queue.getAttempts('t1')).toBe(1);

      queue.getNextTask();
      queue.failTask('t1', 'Error', 5);

      expect(queue.getAttempts('t1')).toBe(2);
    });
  });

  describe('isDone', () => {
    it('should return true when all tasks are finished', () => {
      queue.addTask({ id: 't1', type: 'implement', description: 'Test', scope: {}, priority: 1, timeout: 60000, retries: 1 });
      
      expect(queue.isDone()).toBe(false);

      const task = queue.getNextTask()!;
      expect(queue.isDone()).toBe(false);

      queue.completeTask('t1', { task, workerId: 'w1', result: { success: true, filesChanged: [], duration: 100 } });
      expect(queue.isDone()).toBe(true);
    });

    it('should return true for empty queue', () => {
      expect(queue.isDone()).toBe(true);
    });
  });

  describe('skipBlockedTasks', () => {
    it('should skip tasks blocked by failed dependencies', () => {
      queue.addTasks([
        { id: 't1', type: 'implement', description: 'First', scope: {}, priority: 1, timeout: 60000, retries: 1 },
        { id: 't2', type: 'test', description: 'Second', scope: {}, dependencies: ['t1'], priority: 2, timeout: 60000, retries: 1 },
        { id: 't3', type: 'review', description: 'Third', scope: {}, dependencies: ['t2'], priority: 3, timeout: 60000, retries: 1 },
      ]);

      // Fail t1
      queue.getNextTask();
      queue.failTask('t1', 'Error', 0);

      // Skip blocked tasks
      const skipped = queue.skipBlockedTasks();

      expect(skipped).toContain('t2');
      expect(skipped).toContain('t3');
      expect(queue.getStats().failed).toBe(3);
    });
  });

  describe('cancelTask', () => {
    it('should cancel pending task', () => {
      queue.addTask({ id: 't1', type: 'implement', description: 'Test', scope: {}, priority: 1, timeout: 60000, retries: 1 });
      
      const result = queue.cancelTask('t1');

      expect(result).toBe(true);
      expect(queue.getStats().total).toBe(0);
    });

    it('should not cancel running task', () => {
      queue.addTask({ id: 't1', type: 'implement', description: 'Test', scope: {}, priority: 1, timeout: 60000, retries: 1 });
      queue.getNextTask();

      const result = queue.cancelTask('t1');

      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all tasks', () => {
      queue.addTasks([
        { id: 't1', type: 'implement', description: 'Test 1', scope: {}, priority: 1, timeout: 60000, retries: 1 },
        { id: 't2', type: 'test', description: 'Test 2', scope: {}, priority: 2, timeout: 60000, retries: 1 },
      ]);

      queue.clear();

      expect(queue.getStats().total).toBe(0);
      expect(queue.getStats().pending).toBe(0);
    });
  });

  describe('getResults', () => {
    it('should return all completed results', () => {
      queue.addTasks([
        { id: 't1', type: 'implement', description: 'Test 1', scope: {}, priority: 1, timeout: 60000, retries: 1 },
        { id: 't2', type: 'test', description: 'Test 2', scope: {}, priority: 2, timeout: 60000, retries: 1 },
      ]);

      const task1 = queue.getNextTask()!;
      queue.completeTask('t1', { task: task1, workerId: 'w1', result: { success: true, filesChanged: ['a.ts'], duration: 100 } });

      const task2 = queue.getNextTask()!;
      queue.completeTask('t2', { task: task2, workerId: 'w1', result: { success: true, filesChanged: ['b.ts'], duration: 200 } });

      const results = queue.getResults();

      expect(results.length).toBe(2);
      expect(results[0].result.filesChanged).toContain('a.ts');
      expect(results[1].result.filesChanged).toContain('b.ts');
    });
  });

  describe('getFailures', () => {
    it('should return all failed tasks', () => {
      queue.addTask({ id: 't1', type: 'implement', description: 'Test', scope: {}, priority: 1, timeout: 60000, retries: 1 });

      queue.getNextTask();
      queue.failTask('t1', 'Test error', 0);

      const failures = queue.getFailures();

      expect(failures.length).toBe(1);
      expect(failures[0].error).toBe('Test error');
      expect(failures[0].task.id).toBe('t1');
    });
  });
});
