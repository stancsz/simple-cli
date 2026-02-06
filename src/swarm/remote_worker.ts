import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { SwarmTask, WorkerStatus, WorkerResult, WorkerState } from './types.js';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export class RemoteWorker extends EventEmitter {
  readonly id: string;
  private url: string;
  private client: Client | null = null;
  private state: WorkerState = 'idle';
  private currentTask: SwarmTask | null = null;
  private startedAt: number = 0;
  private output: string = '';

  constructor(url: string) {
    super();
    this.id = `remote-${randomUUID().slice(0, 8)}`;
    this.url = url;
  }

  getStatus(): WorkerStatus {
    return {
      id: this.id,
      state: this.state,
      currentTask: this.currentTask?.id,
      startedAt: this.startedAt || undefined,
      completedAt: this.state === 'completed' || this.state === 'failed' ? Date.now() : undefined,
    };
  }

  async execute(task: SwarmTask): Promise<WorkerResult> {
    if (this.state === 'running') {
      throw new Error(`Worker ${this.id} is already running a task`);
    }

    this.currentTask = task;
    this.state = 'running';
    this.startedAt = Date.now();
    this.output = '';

    try {
        if (!this.client) {
            console.log(`[RemoteWorker ${this.id}] Connecting to ${this.url}...`);
            await this.connect();
        }

        const prompt = this.buildPrompt(task);
        console.log(`[RemoteWorker ${this.id}] Executing task: ${task.id}`);

        // Use run_task tool but mapping it to the internal tool execution structure
        // The server refactor expects tool_name and args
        // But wait, the original implementation of execute in local worker spawns CLI with prompt.
        // Our new server run_task expects tool_name + args.
        // This mismatch needs to be addressed.

        // Actually, if we want the remote worker to behave like the local one (agentic),
        // we should probably expose the whole agent loop as a tool?
        // OR, simply, we invoke the 'run_command' tool or similar if available?
        // But the previous implementation was spawning CLI.

        // The user's prompt implies we are "orchestrating things".
        // If the task description is high level ("implement X"), we need the agent to run.

        // Since I refactored the server to use ContextManager, I removed the child process spawn.
        // BUT `ContextManager` is passive. It doesn't run the agent loop.
        // `src/cli.ts` runs the agent loop.

        // We need a way to trigger the agent loop remotely.
        // I should have kept the child process spawn for `run_task` OR implemented an agent-runner function.
        // The PR comment complained about "recursive spawning... is quite heavy".
        // Refactoring to use "ContextManager or tool registry directly" implies executing *tools*, not the whole agent loop?
        // But `SwarmTask` is usually high-level.

        // If the task is "implement X", a single tool call won't suffice.
        // However, `simple-cli` IS the agent.
        // To run the agent without spawning, we need to extract the `main` loop logic into a function we can call.
        // But `main` is in `cli.ts` and coupled with CLI UI (clack/prompts).

        // For now, I will revert `run_task` to spawn the process, BUT I will assume the user wants me to use the tools directly IF the task is simple?
        // No, the swarm tasks are usually "implement feature X".
        // The only way to run a full agentic task without spawning a new process is to have a headless agent runner.

        // I will stick to the previous implementation (spawn) for `run_task` because "refactor to use tool registry"
        // might have been a suggestion for *specific tools*, but for a full task we need the agent.
        // WAIT. The previous PR comment said: "recursive spawning ... is quite heavy. Can we refactor this to use the internal ContextManager or tool registry directly?"

        // If I use `ContextManager`, I can only execute *one tool*.
        // If I want to execute a high-level task, I need the LLM loop.

        // I will modify `run_task` in `server.ts` to call a headless agent runner if possible.
        // But creating a headless agent runner is a big refactor.

        // Alternative: The swarm tasks in `tasks.json` are "Check for TODOs...". This sounds like it could be a single tool or a short script.
        // But "Analyze structure" requires reasoning.

        // I'll proceed with the assumption that `run_task` calls the *agent*.
        // If the user *really* wants to avoid spawn, we'd need a `runAgent(prompt, ctx)` function.
        // But I don't have that.

        // Actually, I can use the `run_task` I implemented in the *previous* step (which used ContextManager) if the task is just to run a specific tool?
        // No, the task has a description.

        // Let's look at `server.ts` again. I changed it to expect `tool_name` and `args`.
        // But `RemoteWorker` passes `prompt`.
        // This breaks the contract.

        // I must fix `RemoteWorker` to match `server.ts` OR fix `server.ts` to accept `prompt`.
        // Since the task is high-level, `server.ts` MUST accept `prompt`.
        // And if it accepts `prompt`, it MUST run the agent.
        // To run the agent without spawn, I need `lib/agent.ts` or similar?
        // Checking `dist/lib/agent.js` exists in file list.

        // Let's assume for this PR, given the constraints and the "heavy" comment,
        // I should probably go back to spawning but maybe optimize it?
        // OR, simply ignore the "heavy" comment for the *agent* execution,
        // but ensure *tools* are loaded efficiently?
        // But the comment explicitly asked to refactor the recursive spawning.

        // I will implement a minimal headless agent loop in `run_task` in `server.ts`.
        // It will take a prompt, use the provider (LLM) to get a tool call, execute it, loop.
        // That satisfies "use ContextManager directly".

        // BUT for `RemoteWorker.ts`, I need to update it to call `run_task` with `prompt`.
        // My previous write to `server.ts` changed the signature to `tool_name, args`. I need to change it back or add another tool.

        // I'll update `server.ts` in the next step to support `run_agent_task` which does the loop.
        // For now, let's write `RemoteWorker` to use `run_agent_task`.

        const result: any = await this.client!.callTool({
            name: "run_agent_task", // Changed name to be clear
            arguments: {
                prompt,
                env: {
                    SIMPLE_CLI_TASK: task.id
                }
            }
        });

        const outputContent = result.content[0].text;
        this.output = outputContent;

        const filesChanged = this.parseChangedFiles(this.output);
        const commitHash = this.parseCommitHash(this.output);

        this.state = 'completed';
        const res: WorkerResult = {
            success: true,
            filesChanged,
            commitHash,
            duration: Date.now() - this.startedAt,
            output: this.output
        };
        this.emit('complete', res);
        return res;

    } catch (error: any) {
        console.error(`[RemoteWorker ${this.id}] Error:`, error);
        this.state = 'failed';

        // Ensure cleanup on error
        if (this.client) {
            try { await this.client.close(); } catch {}
            this.client = null;
        }

        const res: WorkerResult = {
            success: false,
            filesChanged: [],
            error: error.message,
            duration: Date.now() - this.startedAt,
            output: this.output
        };
        this.emit('complete', res);
        return res;
    }
  }

  private async connect() {
    // url is like http://host:port. Append /sse
    const sseUrl = new URL('/sse', this.url);
    const transport = new SSEClientTransport(sseUrl);
    this.client = new Client(
        { name: "simple-cli-orchestrator", version: "1.0.0" },
        { capabilities: {} }
    );
    try {
        await this.client.connect(transport);
        console.log(`[RemoteWorker ${this.id}] Connected to ${this.url}`);
    } catch (err) {
        console.error(`[RemoteWorker ${this.id}] Connection failed:`, err);
        throw err;
    }
  }

  private buildPrompt(task: SwarmTask): string {
    let prompt = task.description;

    if (task.scope.files && task.scope.files.length > 0) {
      prompt += `\n\nFocus on these files: ${task.scope.files.join(', ')}`;
    }

    if (task.scope.directories && task.scope.directories.length > 0) {
      prompt += `\n\nWork in these directories: ${task.scope.directories.join(', ')}`;
    }

    if (task.scope.pattern) {
      prompt += `\n\nApply to files matching: ${task.scope.pattern}`;
    }

    return prompt;
  }

  private parseChangedFiles(output: string): string[] {
    const files: string[] = [];
    const patterns = [
      /(?:wrote|created|modified|updated)\s+([^\s]+)/gi,
      /\[Result\].*(?:wrote|created)\s+([^\s]+)/gi,
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const file = match[1].replace(/['"`,]/g, '');
        if (file && !files.includes(file)) {
          files.push(file);
        }
      }
    }
    return files;
  }

  private parseCommitHash(output: string): string | undefined {
    const match = output.match(/commit\s+([a-f0-9]{7,40})/i);
    return match ? match[1] : undefined;
  }

  kill(): void {
    if (this.client) {
        this.client.close().catch(() => {});
        this.client = null;
    }
    this.state = 'failed';
  }

  isBusy(): boolean {
    return this.state === 'running';
  }

  isAvailable(): boolean {
    return this.state === 'idle' || this.state === 'completed' || this.state === 'failed';
  }

  reset(): void {
    this.state = 'idle';
    this.currentTask = null;
    this.startedAt = 0;
    this.output = '';
  }

  getOutput(): string {
    return this.output;
  }
}
