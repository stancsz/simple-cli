import { ExternalExecutor } from './external.js';

export class CodexExecutor extends ExternalExecutor {
  name = 'codex';
  description = 'OpenAI Codex CLI';

  protected getCommand(targetDir: string, prompt?: string) {
    const args: string[] = [];
    if (prompt) args.push(prompt);
    return { command: 'codex', args };
  }
}
