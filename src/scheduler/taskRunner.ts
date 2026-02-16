import { spawn, ChildProcess } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { TaskDefinition } from '../daemon/task_definitions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isTs = __filename.endsWith('.ts');
const ext = isTs ? '.ts' : '.js';

export async function runTask(task: TaskDefinition): Promise<ChildProcess> {
  // Use run_task in src/daemon/ directory
  const runTaskScript = join(__dirname, '..', 'daemon', `run_task${ext}`);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    JULES_TASK_DEF: JSON.stringify(task)
  };

  if (task.company) {
    env.JULES_COMPANY = task.company;
  }

  let command = 'node';
  let args = [runTaskScript];

  if (isTs) {
      const tsxPath = join(process.cwd(), 'node_modules', '.bin', 'tsx');
      if (existsSync(tsxPath)) {
          command = tsxPath;
          args = [runTaskScript];
      } else {
          args = ['--loader', 'ts-node/esm', runTaskScript];
      }
  }

  const child = spawn(command, args, {
    env,
    cwd: process.cwd(),
    stdio: 'pipe' // Capture stdout/stderr
  });

  return child;
}
