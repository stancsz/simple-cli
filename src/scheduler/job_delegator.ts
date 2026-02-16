import { join } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { TaskDefinition } from '../daemon/task_definitions.js';
import { handleTaskTrigger } from './trigger.js';

export class JobDelegator {
  private logsDir: string;

  constructor(agentDir: string) {
    this.logsDir = join(agentDir, 'ghost_logs');
  }

  async delegateTask(task: TaskDefinition): Promise<void> {
    const startTime = Date.now();
    await this.logTaskStart(task, startTime);

    let status = 'success';
    let errorMessage = '';

    try {
      const result = await handleTaskTrigger(task);
      if (result.exitCode !== 0) {
        status = 'failed';
        errorMessage = `Process exited with code ${result.exitCode}`;
      }
    } catch (e: any) {
      status = 'failed';
      errorMessage = e.message;
    } finally {
      await this.logTaskEnd(task, startTime, status, errorMessage);
    }
  }

  private async logTaskStart(task: TaskDefinition, startTime: number) {
    // Ensure logs directory exists
    await mkdir(this.logsDir, { recursive: true });
  }

  private async logTaskEnd(task: TaskDefinition, startTime: number, status: string, errorMessage: string) {
    const endTime = Date.now();
    const logEntry = {
      taskId: task.id,
      taskName: task.name,
      startTime,
      endTime,
      status,
      errorMessage
    };

    const fileName = `${endTime}_${task.id}.json`;
    const filePath = join(this.logsDir, fileName);

    try {
      await writeFile(filePath, JSON.stringify(logEntry, null, 2));
      console.log(`[JobDelegator] Logged task execution to ${filePath}`);
    } catch (e) {
      console.error(`[JobDelegator] Failed to log task execution: ${e}`);
    }
  }
}
