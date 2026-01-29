/**
 * Tests for Worker and WorkerPool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Worker, WorkerPool } from '../../src/swarm/worker.js';
import type { SwarmTask } from '../../src/swarm/types.js';

describe('Worker', () => {
  let worker: Worker;

  beforeEach(() => {
    worker = new Worker({
      cwd: process.cwd(),
      yolo: true,
      timeout: 10000,
    });
  });

  afterEach(() => {
    worker.kill();
  });

  describe('constructor', () => {
    it('should create worker with unique ID', () => {
      const w1 = new Worker({ cwd: '.', yolo: true, timeout: 10000 });
      const w2 = new Worker({ cwd: '.', yolo: true, timeout: 10000 });

      expect(w1.id).not.toBe(w2.id);
      expect(w1.id).toMatch(/^worker-[a-f0-9]+$/);
    });
  });

  describe('getStatus', () => {
    it('should return idle status initially', () => {
      const status = worker.getStatus();

      expect(status.id).toBe(worker.id);
      expect(status.state).toBe('idle');
      expect(status.pid).toBeUndefined();
      expect(status.currentTask).toBeUndefined();
    });
  });

  describe('isBusy', () => {
    it('should return false when idle', () => {
      expect(worker.isBusy()).toBe(false);
    });
  });

  describe('isAvailable', () => {
    it('should return true when idle', () => {
      expect(worker.isAvailable()).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset worker to idle state', () => {
      // Manually set some state
      (worker as any).state = 'completed';
      (worker as any).output = 'some output';

      worker.reset();

      expect(worker.getStatus().state).toBe('idle');
      expect(worker.getOutput()).toBe('');
    });
  });

  describe('kill', () => {
    it('should not throw when called on idle worker', () => {
      expect(() => worker.kill()).not.toThrow();
    });
  });

  describe('getOutput', () => {
    it('should return empty string initially', () => {
      expect(worker.getOutput()).toBe('');
    });
  });
});

describe('WorkerPool', () => {
  let pool: WorkerPool;

  beforeEach(() => {
    pool = new WorkerPool(3, {
      cwd: process.cwd(),
      yolo: true,
      timeout: 10000,
    });
  });

  afterEach(() => {
    pool.killAll();
  });

  describe('getWorker', () => {
    it('should create new worker if pool not full', () => {
      const w1 = pool.getWorker();
      const w2 = pool.getWorker();
      const w3 = pool.getWorker();

      expect(w1).toBeInstanceOf(Worker);
      expect(w2).toBeInstanceOf(Worker);
      expect(w3).toBeInstanceOf(Worker);
      // Each call creates a unique worker until pool is full
      expect(w1!.id).not.toBe(w2!.id);
      expect(w2!.id).not.toBe(w3!.id);
    });

    it('should reuse released workers when pool is full', () => {
      // Fill the pool
      const w1 = pool.getWorker()!;
      const w2 = pool.getWorker()!;
      const w3 = pool.getWorker()!;

      // Release w1
      pool.releaseWorker(w1);

      // Should reuse w1 since pool is full but w1 is released
      const w4 = pool.getWorker();
      expect(w4!.id).toBe(w1.id);
    });

    it('should return null when pool is full and all in use', () => {
      // Get all workers (marks them as in use)
      const w1 = pool.getWorker();
      const w2 = pool.getWorker();
      const w3 = pool.getWorker();

      // Pool is full, all workers in use
      const w4 = pool.getWorker();

      expect(w4).toBeNull();
    });
  });

  describe('getAllWorkers', () => {
    it('should return empty array initially', () => {
      expect(pool.getAllWorkers()).toEqual([]);
    });

    it('should return all created workers', () => {
      const w1 = pool.getWorker();
      const w2 = pool.getWorker();

      const workers = pool.getAllWorkers();
      expect(workers.length).toBe(2);
      expect(workers).toContain(w1);
      expect(workers).toContain(w2);
    });
  });

  describe('getWorkerById', () => {
    it('should find worker by ID', () => {
      const w = pool.getWorker();
      const found = pool.getWorkerById(w!.id);

      expect(found).toBe(w);
    });

    it('should return undefined for unknown ID', () => {
      expect(pool.getWorkerById('unknown')).toBeUndefined();
    });
  });

  describe('getBusyCount', () => {
    it('should return 0 initially', () => {
      expect(pool.getBusyCount()).toBe(0);
    });

    it('should count busy workers', () => {
      const w1 = pool.getWorker();
      const w2 = pool.getWorker();

      (w1 as any).state = 'running';

      expect(pool.getBusyCount()).toBe(1);
    });
  });

  describe('getAvailableCount', () => {
    it('should return max workers initially', () => {
      expect(pool.getAvailableCount()).toBe(3);
    });

    it('should decrease as workers become busy', () => {
      const w1 = pool.getWorker();
      (w1 as any).state = 'running';

      expect(pool.getAvailableCount()).toBe(2);
    });
  });

  describe('getStatus', () => {
    it('should return pool status', () => {
      const w1 = pool.getWorker()!;
      pool.getWorker();

      // One in use (running state simulated)
      (w1 as any).state = 'running';

      const status = pool.getStatus();

      expect(status.total).toBe(2);
      expect(status.busy).toBe(1);
      expect(status.available).toBe(2);  // 3 max - 1 busy = 2 available
    });
  });

  describe('releaseWorker', () => {
    it('should allow worker to be reused', () => {
      const w1 = pool.getWorker()!;
      const w2 = pool.getWorker()!;
      const w3 = pool.getWorker()!;

      // Pool is full
      expect(pool.getWorker()).toBeNull();

      // Release one worker
      pool.releaseWorker(w1);

      // Now can get a worker again
      const w4 = pool.getWorker();
      expect(w4).toBe(w1);  // Reused
    });
  });

  describe('killAll', () => {
    it('should kill all workers without error', () => {
      pool.getWorker();
      pool.getWorker();

      expect(() => pool.killAll()).not.toThrow();
    });
  });
});
