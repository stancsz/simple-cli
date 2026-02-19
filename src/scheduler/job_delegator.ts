import { join } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { TaskDefinition } from '../daemon/task_definitions.js';
import { handleTaskTrigger } from './trigger.js';
import { MCP } from '../mcp.js';

export class JobDelegator {
  private logsDir: string;
  private mcp: MCP;

  constructor(agentDir: string) {
    this.logsDir = join(agentDir, 'ghost_logs');
    this.mcp = new MCP();
  }

  async delegateTask(task: TaskDefinition): Promise<void> {
    const startTime = Date.now();
    await this.logTaskStart(task, startTime);

    // Init MCP and Brain
    let brainAvailable = false;
    try {
      await this.mcp.init();
      const servers = this.mcp.listServers();
      if (servers.find((s) => s.name === "brain" && s.status === "stopped")) {
        await this.mcp.startServer("brain");
      }
      brainAvailable = true;
    } catch (e) {
      console.warn("[JobDelegator] Failed to connect to Brain MCP:", e);
    }

    // Active Recall
    let taskWithContext = { ...task };
    if (brainAvailable) {
      try {
        const client = this.mcp.getClient("brain");
        if (client) {
          const result: any = await client.callTool({
            name: "brain_query",
            arguments: {
              query: `lessons learned about ${task.name}`,
              limit: 3,
              company: task.company
            }
          });
          if (result && result.content && result.content[0]) {
            const insights = result.content[0].text;
            console.log(`[JobDelegator] Brain Recall for ${task.name}:\n${insights}`);

            if (!insights.includes("No relevant memories")) {
                taskWithContext.prompt = `${task.prompt}\n\n[System Note: Relevant Past Experiences]\n${insights}`;
            }
          }
        }
      } catch (e) {
        console.warn("[JobDelegator] Failed to recall patterns:", e);
      }
    }

    let status = 'success';
    let errorMessage = '';

    try {
      const result = await handleTaskTrigger(taskWithContext);
      if (result.exitCode !== 0) {
        status = 'failed';
        errorMessage = `Process exited with code ${result.exitCode}`;
      }
    } catch (e: any) {
      status = 'failed';
      errorMessage = e.message;
    } finally {
      await this.logTaskEnd(task, startTime, status, errorMessage);

      // Log Experience
      if (brainAvailable) {
        try {
          const client = this.mcp.getClient("brain");
          if (client) {
            await client.callTool({
              name: "log_experience",
              arguments: {
                taskId: task.id,
                task_type: task.name, // Use name as type for now
                agent_used: "autonomous-executor", // Or extract from task def if available
                outcome: status,
                summary: errorMessage || "Task completed successfully",
                company: task.company,
                artifacts: JSON.stringify([]) // We don't track artifacts here easily
              }
            });
            console.log("[JobDelegator] Logged experience to Brain.");
          }
        } catch (e) {
          console.warn("[JobDelegator] Failed to log experience:", e);
        }
      }
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
