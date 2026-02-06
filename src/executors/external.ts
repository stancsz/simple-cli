import { spawn } from 'child_process';
import { Executor, ExecutorOptions } from './types.js';
import pc from 'picocolors';

export abstract class ExternalExecutor implements Executor {
  abstract name: string;
  abstract description: string;

  protected abstract getCommand(targetDir: string, prompt?: string): { command: string, args: string[] };

  async execute(options: ExecutorOptions): Promise<void> {
    const { targetDir, initialPrompt } = options;
    const { command, args } = this.getCommand(targetDir, initialPrompt);

    console.log(pc.cyan(`\nStarting ${this.name}...`));
    console.log(pc.dim(`Command: ${command} ${args.join(' ')}\n`));

    const child = spawn(command, args, {
      cwd: targetDir,
      stdio: 'inherit',
      shell: true
    });

    return new Promise((resolve, reject) => {
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          // It's interactive, so non-zero exit might just mean user cancelled or error
          console.log(pc.dim(`${this.name} exited with code ${code}`));
          resolve(); // Resolve anyway to exit cleanly
        }
      });
      child.on('error', (err) => {
        console.error(pc.red(`Error spawning ${this.name}:`), err);
        reject(err);
      });
    });
  }
}
