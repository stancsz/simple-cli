import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { jsonrepair } from 'jsonrepair';

export interface LLMResponse {
    thought: string;
    tool: string;
    args: any;
    message?: string;
    raw: string;
}

export type LLMConfig = { provider: string; model: string; apiKey?: string };

export class LLM {
    private configs: LLMConfig[];

    constructor(config: LLMConfig | LLMConfig[]) {
        this.configs = Array.isArray(config) ? config : [config];
    }

    async generate(system: string, history: any[]): Promise<LLMResponse> {
        let lastError: Error | null = null;

        for (const config of this.configs) {
            try {
                const providerName = config.provider.toLowerCase();
                const modelName = config.model;

                let model: any;
                const apiKey = config.apiKey || this.getEnvKey(providerName);

                if (providerName === 'openai') {
                    model = createOpenAI({ apiKey })(modelName);
                } else if (providerName === 'anthropic') {
                    model = createAnthropic({ apiKey });
                    model = model(modelName);
                } else if (providerName === 'google' || providerName === 'gemini') {
                    model = createGoogleGenerativeAI({ apiKey });
                    model = model(modelName);
                } else {
                    continue; // Skip unsupported
                }

                const { text } = await generateText({
                    model,
                    system,
                    messages: history as any,
                });

                return this.parse(text);
            } catch (e: any) {
                lastError = e;
                console.warn(`[LLM] Provider ${config.provider}:${config.model} failed, trying next...`);
            }
        }

        throw new Error(`All LLM providers failed. Last error: ${lastError?.message}`);
    }

    private getEnvKey(providerName: string): string | undefined {
        if (providerName === 'openai') return process.env.OPENAI_API_KEY;
        if (providerName === 'anthropic') return process.env.ANTHROPIC_API_KEY;
        if (providerName === 'google' || providerName === 'gemini') return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
        return undefined;
    }

    private parse(raw: string): LLMResponse {
        try {
            const jsonPart = raw.trim().match(/\{[\s\S]*\}/)?.[0] || raw;
            const repaired = jsonrepair(jsonPart);
            const p = JSON.parse(repaired);
            return {
                thought: p.thought || '',
                tool: (p.tool || p.command || 'none').toLowerCase(),
                args: p.args || p.parameters || {},
                message: p.message || '',
                raw
            };
        } catch {
            return { thought: '', tool: 'none', args: {}, message: raw, raw };
        }
    }
}

export const createLLM = (model?: string) => {
    // Primary model
    const m = model || process.env.MODEL || 'openai:gpt-5.2-codex';
    const [p, n] = m.includes(':') ? m.split(':') : ['openai', m];

    // Define Failover Chain
    const configs: LLMConfig[] = [{ provider: p, model: n }];

    // Add fallbacks if they aren't the primary
    const fallbacks: LLMConfig[] = [
        { provider: 'anthropic', model: 'claude-3-7-sonnet-latest' },
        { provider: 'google', model: 'gemini-2.0-flash-001' },
        { provider: 'openai', model: 'gpt-4o' }
    ];

    for (const f of fallbacks) {
        // Prevent duplicate provider/model combinations
        if (!(f.provider === p && f.model === n)) {
            configs.push(f);
        }
    }

    return new LLM(configs);
};
