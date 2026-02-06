import { ExternalExecutor } from './external.js';

export class ClaudeExecutor extends ExternalExecutor {
  name = 'claude';
  description = 'Claude Code CLI';

  protected getCommand(targetDir: string, prompt?: string) {
    const args: string[] = [];
    if (prompt) args.push(prompt);
    return { command: 'claude-code', args };
  }
}
