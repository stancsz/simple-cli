import { ExternalExecutor } from './external.js';

export class AiderExecutor extends ExternalExecutor {
  name = 'aider';
  description = 'Aider AI Pair Programmer';

  protected getCommand(targetDir: string, prompt?: string) {
    const args: string[] = [];
    if (prompt) {
      args.push('--message');
      args.push(prompt);
    }
    return { command: 'aider', args };
  }
}
