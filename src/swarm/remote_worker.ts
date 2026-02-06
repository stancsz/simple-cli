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
            await this.connect();
        }

        const prompt = this.buildPrompt(task);

        const result: any = await this.client!.callTool({
            name: "run_task",
            arguments: {
                prompt,
                env: {
                    SIMPLE_CLI_TASK: task.id
                }
            }
        });

        // MCP tool result content
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
        this.state = 'failed';
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
    await this.client.connect(transport);
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
        this.client.close();
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
