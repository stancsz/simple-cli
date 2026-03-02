import { spawn, ChildProcess } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TaskDefinition } from '../interfaces/daemon.js';
import { PromptBatcher } from '../llm/batching.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isTs = __filename.endsWith('.ts');
const ext = isTs ? '.ts' : '.js';

// State tracking
const activeChildren = new Set<ChildProcess>();

export async function handleTaskTrigger(task: TaskDefinition): Promise<{ exitCode: number | null }> {
  console.log(`Triggering task: ${task.name} (${task.id})`);

  if (task.batchingGroup && !task.action && task.prompt) {
    console.log(`[Batcher] Queuing task ${task.id} into group: ${task.batchingGroup}`);
    try {
      const response = await PromptBatcher.getInstance().scheduleBatch(task.batchingGroup, task);
      console.log(`[Batcher] Task ${task.id} completed. Response: ${response.substring(0, 100)}...`);
      return { exitCode: 0 };
    } catch (e: any) {
      console.error(`[Batcher] Task ${task.id} failed: ${e.message}`);
      return { exitCode: 1 };
    }
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    JULES_TASK_DEF: JSON.stringify(task)
  };

  if (task.company) {
    env.JULES_COMPANY = task.company;
  }

  // Use run_task in src/daemon/ directory
  // We need to go up one level from src/scheduler to src/daemon
  const runTaskScript = join(__dirname, '..', 'daemon', `run_task${ext}`);

  const args = isTs
       ? ['--loader', 'ts-node/esm', runTaskScript]
       : [runTaskScript];

  return new Promise((resolve, reject) => {
    const child = spawn('node', args, {
      env,
      cwd: process.cwd(),
      stdio: 'pipe' // Capture stdout/stderr
    });

    activeChildren.add(child);

    child.stdout?.on('data', (d) => {
      const output = d.toString().trim();
      if (output) console.log(`[${task.name}] STDOUT: ${output}`);
    });

    child.stderr?.on('data', (d) => {
      const output = d.toString().trim();
      if (output) console.log(`[${task.name}] STDERR: ${output}`);
    });

    child.on('close', (code) => {
      activeChildren.delete(child);
      console.log(`Task ${task.name} exited with code ${code}`);
      resolve({ exitCode: code });
    });

    child.on('error', (err) => {
      activeChildren.delete(child);
      console.error(`Failed to spawn task ${task.name}: ${err.message}`);
      reject(err);
    });
  });
}

export function killAllChildren() {
    if (activeChildren.size > 0) {
        console.log(`Killing ${activeChildren.size} active tasks...`);
        for (const child of activeChildren) {
            try {
                child.kill('SIGTERM');
            } catch (e) {
                // ignore
            }
        }
    }
}
