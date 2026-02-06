import { ContextManager } from '../context.js';

export interface ExecutorOptions {
  targetDir: string;
  initialPrompt?: string;
  ctx: ContextManager;
}

export interface Executor {
  name: string;
  description: string;
  execute(options: ExecutorOptions): Promise<void>;
}
