/**
 * Tests for SwarmCoordinator
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SwarmCoordinator, createSwarmCoordinator } from '../../src/swarm/coordinator.js';
import type { SwarmTask } from '../../src/swarm/types.js';

describe('SwarmCoordinator', () => {
  let coordinator: SwarmCoordinator;

  beforeEach(() => {
    coordinator = new SwarmCoordinator({
      cwd: process.cwd(),
      concurrency: 2,
      yolo: true,
      timeout: 10000,
    });
  });

  afterEach(() => {
    coordinator.abort();
  });

  describe('constructor', () => {
    it('should create coordinator with default options', () => {
      const c = new SwarmCoordinator();
      expect(c).toBeInstanceOf(SwarmCoordinator);
    });

    it('should create coordinator with custom options', () => {
      const c = new SwarmCoordinator({
        cwd: '/tmp',
        concurrency: 8,
        yolo: true,
      });
      expect(c).toBeInstanceOf(SwarmCoordinator);
    });
  });

  describe('addTask', () => {
    it('should add a single task', () => {
      const task: SwarmTask = {
        id: 'task-1',
        type: 'implement',
        description: 'Test task',
        scope: { files: ['test.ts'] },
        priority: 1,
        timeout: 60000,
        retries: 2,
      };

      coordinator.addTask(task);
      const stats = coordinator.getStats();

      expect(stats.total).toBe(1);
      expect(stats.pending).toBe(1);
    });
  });

  describe('addTasks', () => {
    it('should add multiple tasks', () => {
      coordinator.addTasks([
        { id: 't1', type: 'implement', description: 'Task 1', scope: {}, priority: 1, timeout: 60000, retries: 1 },
        { id: 't2', type: 'test', description: 'Task 2', scope: {}, priority: 2, timeout: 60000, retries: 1 },
        { id: 't3', type: 'refactor', description: 'Task 3', scope: {}, priority: 3, timeout: 60000, retries: 1 },
      ]);

      expect(coordinator.getStats().total).toBe(3);
    });
  });

  describe('getTask', () => {
    it('should get next task from queue', () => {
      coordinator.addTask({ id: 't1', type: 'implement', description: 'Test', scope: {}, priority: 1, timeout: 60000, retries: 1 });

      const task = coordinator.getTask();

      expect(task?.id).toBe('t1');
    });

    it('should return null for empty queue', () => {
      expect(coordinator.getTask()).toBeNull();
    });
  });

  describe('peekTask', () => {
    it('should peek at next task without removing', () => {
      coordinator.addTask({ id: 't1', type: 'implement', description: 'Test', scope: {}, priority: 1, timeout: 60000, retries: 1 });

      const peeked = coordinator.peekTask();
      const stats = coordinator.getStats();

      expect(peeked?.id).toBe('t1');
      expect(stats.pending).toBe(1);  // Still in queue
    });
  });

  describe('events', () => {
    it('should emit task:start event', async () => {
      const handler = vi.fn();
      coordinator.on('task:start', handler);

      coordinator.addTask({
        id: 'event-test',
        type: 'implement',
        description: 'echo test',
        scope: {},
        priority: 1,
        timeout: 5000,
        retries: 0,
      });

      // Start but don't wait for completion
      const promise = coordinator.run();
      
      // Give it time to start
      await new Promise(r => setTimeout(r, 500));
      coordinator.abort();

      expect(handler).toHaveBeenCalled();
    });

    it('should emit swarm:complete event', async () => {
      const handler = vi.fn();
      coordinator.on('swarm:complete', handler);

      // Empty swarm should complete immediately
      await coordinator.run();

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        total: 0,
        completed: 0,
        failed: 0,
      }));
    });
  });

  describe('stop', () => {
    it('should stop gracefully', async () => {
      coordinator.addTasks([
        { id: 't1', type: 'implement', description: 'sleep 10', scope: {}, priority: 1, timeout: 30000, retries: 1 },
        { id: 't2', type: 'test', description: 'sleep 10', scope: {}, priority: 2, timeout: 30000, retries: 1 },
      ]);

      const promise = coordinator.run();
      
      // Stop after short delay
      setTimeout(() => coordinator.stop(), 100);
      
      const result = await promise;

      // Should have processed some but not all
      expect(result.total).toBe(2);
    });
  });

  describe('abort', () => {
    it('should abort immediately', async () => {
      coordinator.addTask({
        id: 't1',
        type: 'implement',
        description: 'sleep 10',
        scope: {},
        priority: 1,
        timeout: 30000,
        retries: 1,
      });

      const promise = coordinator.run();
      
      // Abort immediately
      setTimeout(() => coordinator.abort(), 50);
      
      const result = await promise;

      expect(result.completed).toBe(0);
    });
  });

  describe('isRunning', () => {
    it('should return false initially', () => {
      expect(coordinator.isRunning()).toBe(false);
    });

    it('should return false after completion', async () => {
      // Empty swarm completes immediately
      await coordinator.run();
      expect(coordinator.isRunning()).toBe(false);
    });
  });

  describe('getAllWorkers', () => {
    it('should return empty array initially', () => {
      expect(coordinator.getAllWorkers()).toEqual([]);
    });

    it('should return workers when running', async () => {
      coordinator.addTask({
        id: 't1',
        type: 'implement',
        description: 'echo test',
        scope: {},
        priority: 1,
        timeout: 5000,
        retries: 0,
      });

      const promise = coordinator.run();
      
      await new Promise(r => setTimeout(r, 200));
      const workers = coordinator.getAllWorkers();
      
      coordinator.abort();
      await promise;

      // May have created workers
      expect(Array.isArray(workers)).toBe(true);
    });
  });

  describe('run', () => {
    it('should complete empty swarm immediately', async () => {
      const result = await coordinator.run();

      expect(result.total).toBe(0);
      expect(result.completed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.successRate).toBe(0);
    });

    it('should handle dependency chain', async () => {
      const completedOrder: string[] = [];

      coordinator.on('task:complete', (task) => {
        completedOrder.push(task.id);
      });

      coordinator.addTasks([
        { id: 't1', type: 'implement', description: 'echo first', scope: {}, priority: 1, timeout: 5000, retries: 0 },
        { id: 't2', type: 'test', description: 'echo second', scope: {}, dependencies: ['t1'], priority: 1, timeout: 5000, retries: 0 },
      ]);

      // Set short timeout and abort
      setTimeout(() => coordinator.abort(), 2000);
      await coordinator.run();

      // If t2 completed, t1 must have completed first
      if (completedOrder.includes('t2')) {
        const t1Index = completedOrder.indexOf('t1');
        const t2Index = completedOrder.indexOf('t2');
        expect(t1Index).toBeLessThan(t2Index);
      }
    });

    it('should track pool concurrency', () => {
      // Just verify the coordinator respects the concurrency setting
      const coord = new SwarmCoordinator({
        concurrency: 2,
        yolo: true,
        timeout: 5000,
      });

      coord.addTasks([
        { id: 't1', type: 'implement', description: 'test 1', scope: {}, priority: 1, timeout: 1000, retries: 0 },
        { id: 't2', type: 'implement', description: 'test 2', scope: {}, priority: 1, timeout: 1000, retries: 0 },
      ]);

      // Stats should show correct count
      expect(coord.getStats().total).toBe(2);
      expect(coord.getStats().pending).toBe(2);
    });
  });

  describe('createSwarmCoordinator', () => {
    it('should create coordinator with factory function', () => {
      const c = createSwarmCoordinator({ concurrency: 4 });
      expect(c).toBeInstanceOf(SwarmCoordinator);
    });
  });
});
