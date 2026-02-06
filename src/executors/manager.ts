import { Executor } from './types.js';

export class ExecutorManager {
  private executors = new Map<string, Executor>();

  register(executor: Executor) {
    this.executors.set(executor.name, executor);
  }

  get(name: string): Executor | undefined {
    return this.executors.get(name);
  }

  getAll(): Executor[] {
    return Array.from(this.executors.values());
  }
}
