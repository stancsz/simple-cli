import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const AGENT_DIR = process.env.JULES_AGENT_DIR || join(process.cwd(), '.agent');
const METRICS_DIR = join(AGENT_DIR, 'metrics');

export interface BenchmarkMetrics {
    duration_ms: number;
    tokens_total: number;
    tokens_prompt: number;
    tokens_completion: number;
    cost_est: number;
    tool_calls: number;
    errors: number;
}

export class MetricsCollector {
    private startTime: number = 0;
    private startTimestamp: string = "";

    start() {
        this.startTime = Date.now();
        // Add buffer to account for clock skew or file write delays
        this.startTimestamp = new Date(Date.now() - 5000).toISOString();
    }

    async stop(): Promise<BenchmarkMetrics> {
        const endTime = Date.now();
        const endTimestamp = new Date(Date.now() + 5000).toISOString();
        const duration = endTime - this.startTime;

        const metrics = await this.readMetrics(this.startTimestamp, endTimestamp);
        return {
            ...metrics,
            duration_ms: duration
        };
    }

    private async readMetrics(start: string, end: string): Promise<Omit<BenchmarkMetrics, 'duration_ms'>> {
        const date = new Date().toISOString().split('T')[0];
        const filename = join(METRICS_DIR, `${date}.ndjson`);

        if (!existsSync(filename)) {
            return {
                tokens_total: 0,
                tokens_prompt: 0,
                tokens_completion: 0,
                cost_est: 0,
                tool_calls: 0,
                errors: 0
            };
        }

        const content = await readFile(filename, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());

        let tokensTotal = 0;
        let tokensPrompt = 0;
        let tokensCompletion = 0;
        let toolCalls = 0;
        let errors = 0;

        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                if (entry.timestamp >= start && entry.timestamp <= end) {
                    if (entry.metric === 'llm_tokens_total') tokensTotal += entry.value;
                    if (entry.metric === 'llm_tokens_prompt') tokensPrompt += entry.value;
                    if (entry.metric === 'llm_tokens_completion') tokensCompletion += entry.value;
                    if (entry.metric === 'tool_execution_time') toolCalls++; // Count tool executions
                    if (entry.metric === 'tool_error' || entry.metric === 'llm_error') errors++;
                }
            } catch (e) {
                // Ignore malformed lines
            }
        }

        // Cost Estimation (Hardcoded for now based on generic "smart" model pricing, e.g., GPT-4o or Sonnet)
        // $3.00 / 1M input, $15.00 / 1M output
        const costInput = (tokensPrompt / 1_000_000) * 3.00;
        const costOutput = (tokensCompletion / 1_000_000) * 15.00;

        return {
            tokens_total: tokensTotal,
            tokens_prompt: tokensPrompt,
            tokens_completion: tokensCompletion,
            cost_est: costInput + costOutput,
            tool_calls: toolCalls,
            errors: errors
        };
    }
}
