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
    tools?: { tool: string; args: any }[];
}

export type LLMConfig = { provider: string; model: string; apiKey?: string };

export class LLM {
    private configs: LLMConfig[];

    constructor(config: LLMConfig | LLMConfig[]) {
        this.configs = Array.isArray(config) ? config : [config];
    }

    async generate(system: string, history: any[], signal?: AbortSignal): Promise<LLMResponse> {
        let lastError: Error | null = null;

        for (const config of this.configs) {
            try {
                if (signal?.aborted) throw new Error('Aborted by user');
                const providerName = config.provider.toLowerCase();
                const modelName = config.model;
                let model: any;
                const apiKey = config.apiKey || this.getEnvKey(providerName);

                if (providerName === 'openai' || providerName === 'codex') {
                    model = createOpenAI({ apiKey })(modelName);
                } else if (providerName === 'anthropic' || providerName === 'claude') {
                    model = createAnthropic({ apiKey });
                    model = model(modelName);
                } else if (providerName === 'google' || providerName === 'gemini') {
                    model = createGoogleGenerativeAI({ apiKey });
                    model = model(modelName);
                } else {
                    throw new Error(`Unsupported provider: ${providerName}`);
                }

                const { text } = await generateText({
                    model,
                    system,
                    messages: history as any,
                    abortSignal: signal,
                });

                return this.parse(text);
            } catch (e: any) {
                lastError = e;
                console.warn(`[LLM] Error with ${config.provider}:${config.model}: ${e.message}`);
            }
        }

        throw new Error(`All LLM providers failed. Last error: ${lastError?.message}`);
    }

    private getEnvKey(providerName: string): string | undefined {
        if (providerName === 'openai' || providerName === 'codex') return process.env.OPENAI_API_KEY;
        if (providerName === 'anthropic' || providerName === 'claude') return process.env.ANTHROPIC_API_KEY;
        if (providerName === 'google' || providerName === 'gemini') return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
        return undefined;
    }

    private parse(raw: string): LLMResponse {
        const tools: { tool: string; args: any }[] = [];
        let thought = '';
        let message = '';
        const rawTrimmed = raw.trim();

        // 1. Attempt to extract multiple JSON objects
        let braceBalance = 0;
        let startIndex = -1;
        let inString = false;
        let escape = false;

        for (let i = 0; i < rawTrimmed.length; i++) {
            const char = rawTrimmed[i];

            if (inString) {
                if (escape) {
                    escape = false;
                } else if (char === '\\') {
                    escape = true;
                } else if (char === '"') {
                    inString = false;
                }
                continue;
            }

            if (char === '"') {
                inString = true;
            } else if (char === '{') {
                if (braceBalance === 0) {
                    startIndex = i;
                }
                braceBalance++;
            } else if (char === '}') {
                braceBalance--;
                if (braceBalance === 0 && startIndex !== -1) {
                    const jsonStr = rawTrimmed.substring(startIndex, i + 1);
                    try {
                        const repaired = jsonrepair(jsonStr);
                        const obj = JSON.parse(repaired);

                        // Extract tool call
                        if (obj.tool && obj.tool !== 'none') {
                            tools.push({ tool: obj.tool.toLowerCase(), args: obj.args || obj.parameters || {} });
                        }

                        // Aggregate thought and message
                        if (obj.thought) thought += (thought ? '\n' : '') + obj.thought;
                        if (obj.message) message += (message ? '\n' : '') + obj.message;

                    } catch (e) {
                        // Ignore malformed blocks inside mixed content
                    }
                    startIndex = -1;
                }
            }
        }

        // 2. Fallback: If no tools found via loop, try single block extraction
        if (tools.length === 0) {
            try {
                const jsonPart = rawTrimmed.match(/\{[\s\S]*\}/)?.[0] || rawTrimmed;
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

        return {
            thought: thought.trim(),
            tool: tools[0]?.tool || 'none',
            args: tools[0]?.args || {},
            message: message.trim(),
            raw,
            tools
        };
    }
}

export const createLLM = (model?: string) => {
    // Primary model
    const m = model || process.env.MODEL || 'openai:gpt-5.2-codex';
    const [p, n] = m.includes(':') ? m.split(':') : ['openai', m];

    // Simple configuration without complex fallback chains across different providers
    const config: LLMConfig = { provider: p, model: n };

    return new LLM(config);
};
