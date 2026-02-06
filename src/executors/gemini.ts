import { ExternalExecutor } from './external.js';

export class GeminiExecutor extends ExternalExecutor {
  name = 'gemini';
  description = 'Google Gemini CLI';

  protected getCommand(targetDir: string, prompt?: string) {
    const args: string[] = [];
    if (prompt) args.push(prompt);
    return { command: 'gemini', args };
  }
}
