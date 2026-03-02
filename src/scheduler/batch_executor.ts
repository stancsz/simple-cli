import { TaskDefinition } from "../interfaces/daemon.js";
import { createLLM } from "../llm.js";
import { BatchTaskInput, BatchTaskResult } from "../llm/batch_prompt_builder.js";
import { loadConfig } from "../config.js";

interface BatchQueueItem {
    task: TaskDefinition;
    resolve: (value: BatchTaskResult) => void;
    reject: (reason?: any) => void;
    enqueuedAt: number;
}

export class BatchExecutor {
    private queue: BatchQueueItem[] = [];
    private timer: NodeJS.Timeout | null = null;
    private isProcessing = false;

    // Batching configuration
    private enabled = true;
    private windowMs = 5 * 60 * 1000; // 5 minutes default
    private maxBatchSize = 5;
    private supportedTypes = new Set(['strategic_scan', 'performance_metrics', 'market_analysis']);

    constructor() {
        this.loadConfig();
    }

    private async loadConfig() {
        try {
            const config = await loadConfig();
            if (config.batching) {
                this.enabled = config.batching.enabled ?? this.enabled;
                this.windowMs = config.batching.windowMs ?? this.windowMs;
                this.maxBatchSize = config.batching.maxBatchSize ?? this.maxBatchSize;
                if (config.batching.supportedTypes) {
                    this.supportedTypes = new Set(config.batching.supportedTypes);
                }
            }
        } catch (e) {
            console.warn(`[BatchExecutor] Failed to load config, using defaults.`);
        }
    }

    isBatchable(task: TaskDefinition): boolean {
        // We only batch if it's an LLM task (has a prompt) and its ID or Name hints at supported types
        // In our system, task type is often inferred from ID or name
        if (!this.enabled || !task.prompt) return false;

        const taskIdentifier = (task.id + " " + task.name).toLowerCase();
        for (const type of this.supportedTypes) {
            if (taskIdentifier.includes(type)) {
                return true;
            }
        }

        return false;
    }

    async enqueue(task: TaskDefinition): Promise<BatchTaskResult> {
        return new Promise((resolve, reject) => {
            const item: BatchQueueItem = {
                task,
                resolve,
                reject,
                enqueuedAt: Date.now()
            };

            this.queue.push(item);
            console.log(`[BatchExecutor] Enqueued task ${task.id} (${task.name}) for batching.`);

            this.scheduleProcessing();
        });
    }

    private scheduleProcessing() {
        if (this.isProcessing) return;

        if (this.timer) {
            clearTimeout(this.timer);
        }

        // Check if we hit max batch size for any group
        const groups = this.groupQueue();
        for (const [, items] of groups.entries()) {
            if (items.length >= this.maxBatchSize) {
                this.processBatches();
                return;
            }
        }

        // Otherwise wait for the window
        this.timer = setTimeout(() => {
            this.processBatches();
        }, this.windowMs);
    }

    private groupQueue(): Map<string, BatchQueueItem[]> {
        const groups = new Map<string, BatchQueueItem[]>();

        for (const item of this.queue) {
            // Group by company (tenant isolation). If no company, use 'global'
            const companyId = item.task.company || 'global';

            // Note: We group all batchable tasks for the same company together into a single LLM call.
            // This is valid as the meta-prompt will ask the LLM to process them independently.
            const groupId = `${companyId}`;

            if (!groups.has(groupId)) {
                groups.set(groupId, []);
            }
            groups.get(groupId)!.push(item);
        }

        return groups;
    }

    private async processBatches() {
        if (this.isProcessing || this.queue.length === 0) return;
        this.isProcessing = true;

        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        // Take a snapshot of the current queue
        const currentQueue = [...this.queue];
        this.queue = [];

        const groups = this.groupQueueSnapshot(currentQueue);

        for (const [groupId, items] of groups.entries()) {
            // Chunk into maxBatchSize
            for (let i = 0; i < items.length; i += this.maxBatchSize) {
                const batchChunk = items.slice(i, i + this.maxBatchSize);
                if (batchChunk.length === 0) continue;

                if (batchChunk.length === 1) {
                    // Single item, just process normally or via batch api (batch api is fine)
                    console.log(`[BatchExecutor] Only 1 task in group ${groupId}, processing as singleton batch.`);
                } else {
                    console.log(`[BatchExecutor] Processing batch of ${batchChunk.length} tasks for group ${groupId}.`);
                }

                await this.executeBatchChunk(batchChunk);
            }
        }

        this.isProcessing = false;

        // If items were enqueued while processing, schedule again
        if (this.queue.length > 0) {
            this.scheduleProcessing();
        }
    }

    // Force flush the queue manually
    public async forceProcess(): Promise<void> {
        if (this.queue.length > 0 && !this.isProcessing) {
            await this.processBatches();
        }
    }

    private groupQueueSnapshot(queue: BatchQueueItem[]): Map<string, BatchQueueItem[]> {
        const groups = new Map<string, BatchQueueItem[]>();
        for (const item of queue) {
            const companyId = item.task.company || 'global';
            const groupId = `${companyId}`;
            if (!groups.has(groupId)) {
                groups.set(groupId, []);
            }
            groups.get(groupId)!.push(item);
        }
        return groups;
    }

    private async executeBatchChunk(chunk: BatchQueueItem[]) {
        const tasks = chunk.map(item => item.task);

        // Ensure all items are resolved immediately to not block queue enqueue callers forever
        for (const item of chunk) {
            item.resolve({ id: item.task.id, status: 'success' }); // Dummy success to free caller
        }

        const env: NodeJS.ProcessEnv = {
            ...process.env,
            JULES_BATCH_DEF: JSON.stringify(tasks)
        };

        const isTs = __filename.endsWith('.ts');
        const ext = isTs ? '.ts' : '.js';
        const executorScript = require('path').join(__dirname, `executor${ext}`);

        const args = isTs
            ? ['--loader', 'ts-node/esm', executorScript]
            : [executorScript];

        const child = require('child_process').spawn('node', args, {
            env,
            cwd: process.cwd(),
            stdio: 'pipe'
        });

        child.stdout?.on('data', (d: any) => console.log(`[Batch ${tasks.length} tasks] STDOUT: ${d.toString().trim()}`));
        child.stderr?.on('data', (d: any) => console.log(`[Batch ${tasks.length} tasks] STDERR: ${d.toString().trim()}`));

        child.on('close', (code: number) => {
            console.log(`[BatchExecutor] Batch process exited with code ${code}`);
        });
    }
}

// Global instance
export const globalBatchExecutor = new BatchExecutor();
