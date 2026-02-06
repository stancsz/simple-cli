import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { jsonrepair } from 'jsonrepair';
import fs from 'fs';
import crypto from 'crypto';

export interface TypeLLMResponse {
    thought: string;
    tool: string;
    args: Record<string, any>;
    message?: string;
    raw: string;
}

export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface TypeLLMConfig {
    apiKey?: string;
    model: string;
    provider: 'openai' | 'google' | 'anthropic' | 'litellm';
    temperature?: number;
    maxTokens?: number;
    baseURL?: string;
}

export class TypeLLM {
    private modelInstance: any;

    // Simple in-memory cache: key -> { ts, raw }
    private static cache = new Map<string, { ts: number; raw: string }>();

    // Circuit-breaker state per provider key
    private static cb = new Map<string, { fails: number; firstFailTs: number; tripUntil: number }>();

    private static CACHE_TTL = Number(process.env.TYPELLM_CACHE_TTL_MS || 5 * 60 * 1000);
    private static CB_FAILS = Number(process.env.TYPELLM_CB_FAILS || 5);
    private static CB_WINDOW = Number(process.env.TYPELLM_CB_WINDOW_MS || 60 * 1000);
    private static CB_COOLDOWN = Number(process.env.TYPELLM_CB_COOLDOWN_MS || 5 * 60 * 1000);

    private static metricsLog(fileMsg: string) {
        if (process.env.DEBUG !== 'true') return;
        const line = `${new Date().toISOString()} ${fileMsg}\n`;
        try {
            fs.appendFileSync('.typellm_metrics.log', line);
        } catch (e) {
            // best-effort
        }
    }

    constructor(private config: TypeLLMConfig) {
        this.initializeModel();
    }

    private initializeModel() {
        switch (this.config.provider) {
            case 'openai': {
                const provider = createOpenAI({
                    apiKey: this.config.apiKey,
                });
                this.modelInstance = provider(this.config.model);
                break;
            }
            case 'litellm': {
                const provider = createOpenAI({
                    apiKey: this.config.apiKey,
                    baseURL: this.config.baseURL,
                });
                this.modelInstance = provider(this.config.model);
                break;
            }
            case 'google': {
                const provider = createGoogleGenerativeAI({
                    apiKey: this.config.apiKey,
                });
                this.modelInstance = provider(this.config.model);
                break;
            }
            case 'anthropic': {
                const provider = createAnthropic({
                    apiKey: this.config.apiKey,
                });
                this.modelInstance = provider(this.config.model);
                break;
            }
            default:
                throw new Error(`Unsupported provider: ${this.config.provider}`);
        }
    }

    /**
     * Generates a strict, tool-ready response
     */
    async generate(
        systemPrompt: string,
        messages: Message[],
        options: { strict?: boolean; repair?: boolean } = { strict: true, repair: true }
    ): Promise<TypeLLMResponse> {

        // Inject format reminder into system prompt if strict
        const enhancedSystem = options.strict
            ? `${systemPrompt}\n\nCRITICAL: Respond ONLY with a JSON object. No conversational text. Format: {"thought": "...", "tool": "name", "args": {...}}`
            : systemPrompt;

        // Allow tests or dev to opt-out of live provider calls
        const disableLive = process.env.DISABLE_LIVE_LLM === 'true';

        const timeoutMs = Number(process.env.TYPELLM_TIMEOUT_MS || 15000);
        const maxAttempts = Number(process.env.TYPELLM_MAX_ATTEMPTS || 3);

        // Helper: fetch with timeout and simple retry/backoff
        const fetchWithRetry = async (input: RequestInfo, init: RequestInit) => {
            let attempt = 0;
            let lastErr: any;
            while (++attempt <= maxAttempts) {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                try {
                    const res = await fetch(input, { ...init, signal: controller.signal });
                    clearTimeout(timer);
                    if (!res.ok) {
                        const text = await res.text().catch(() => '');
                        const err = new Error(`HTTP ${res.status}: ${text}`);
                        lastErr = err;
                        // Retry on 5xx
                        if (res.status >= 500 && attempt < maxAttempts) {
                            await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempt)));
                            continue;
                        }
                        throw err;
                    }
                    return res;
                } catch (err: any) {
                    clearTimeout(timer);
                    lastErr = err;
                    if (err.name === 'AbortError' && attempt < maxAttempts) {
                        await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempt)));
                        continue;
                    }
                    if (attempt < maxAttempts) {
                        await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempt)));
                        continue;
                    }
                    throw lastErr;
                }
            }
            throw lastErr;
        };

        // Helpers: cache key and circuit-breaker management
        const makeCacheKey = () => {
            const h = crypto.createHash('sha256');
            h.update(this.config.provider + '|' + (this.config.model || '') + '|' + enhancedSystem + '|' + JSON.stringify(messages));
            return h.digest('hex');
        };

        const providerKey = `${this.config.provider}:${this.config.model}`;

        const isCircuitOpen = (key: string) => {
            const s = TypeLLM.cb.get(key);
            if (!s) return false;
            if (s.tripUntil && Date.now() < s.tripUntil) return true;
            return false;
        };

        const noteFailure = (key: string) => {
            const now = Date.now();
            let s = TypeLLM.cb.get(key);
            if (!s) s = { fails: 0, firstFailTs: now, tripUntil: 0 };
            if (now - s.firstFailTs > TypeLLM.CB_WINDOW) {
                s = { fails: 1, firstFailTs: now, tripUntil: 0 };
            } else {
                s.fails = (s.fails || 0) + 1;
            }
            if (s.fails >= TypeLLM.CB_FAILS) {
                s.tripUntil = now + TypeLLM.CB_COOLDOWN;
                TypeLLM.metricsLog(`${key} circuit-open until=${new Date(s.tripUntil).toISOString()} fails=${s.fails}`);
            }
            TypeLLM.cb.set(key, s);
        };

        const noteSuccess = (key: string) => {
            TypeLLM.cb.delete(key);
        };

        // Provider-specific callers
        const callOpenAI = async () => {
            // circuit-breaker check
            if (isCircuitOpen(providerKey)) throw new Error(`Circuit open for ${providerKey}`);

            const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;
            if (!apiKey) throw new Error('Missing OpenAI API key');
            const url = (this.config.baseURL || 'https://api.openai.com') + '/v1/chat/completions';
            const body: any = {
                model: this.config.model || 'gpt-5-mini',
                messages: [
                    { role: 'system', content: enhancedSystem },
                    ...messages
                ],
            };
            if (typeof this.config.temperature === 'number' && this.config.temperature > 0) body.temperature = this.config.temperature;
            if (this.config.maxTokens) body.max_tokens = this.config.maxTokens;

            const res = await fetchWithRetry(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            const j = await res.json();
            // robustly extract text
            const text = j?.choices?.[0]?.message?.content || j?.choices?.[0]?.text || j?.result?.content || JSON.stringify(j);
            return text;
        };

        const callOpenAIWithCache = async () => {
            const key = makeCacheKey();
            const cached = TypeLLM.cache.get(key);
            if (cached && Date.now() - cached.ts < TypeLLM.CACHE_TTL) {
                TypeLLM.metricsLog(`${providerKey} cache-hit`);
                return cached.raw;
            }
            try {
                const raw = await callOpenAI();
                TypeLLM.cache.set(key, { ts: Date.now(), raw });
                noteSuccess(providerKey);
                    TypeLLM.metricsLog(`${providerKey} success`);
                    return raw;
                } catch (err) {
                    noteFailure(providerKey);
                    TypeLLM.metricsLog(`${providerKey} failure ${String((err as any)?.message || err)}`);
                    throw err;
                }
            };

        const callGoogle = async () => {
            if (isCircuitOpen(providerKey)) throw new Error(`Circuit open for ${providerKey}`);

            const apiKey = this.config.apiKey || process.env.GOOGLE_API_KEY;
            if (!apiKey) throw new Error('Missing Google API key');
            const model = this.config.model || 'models/text-bison-001';
            const base = this.config.baseURL || 'https://generative.googleapis.com/v1beta2';
            const url = `${base}/${encodeURIComponent(model)}:generate?key=${encodeURIComponent(apiKey)}`;
            const inputText = messages.map(m => `${m.role}: ${m.content}`).join('\n');
            const body: any = {
                prompt: inputText,
            };
            if (typeof this.config.temperature === 'number' && this.config.temperature > 0) body.temperature = this.config.temperature;
            if (this.config.maxTokens) body.maxOutputTokens = this.config.maxTokens;

            const res = await fetchWithRetry(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const j = await res.json();
            const text = j?.candidates?.[0]?.content || j?.output?.[0]?.content || JSON.stringify(j);
            return text;
        };

        const callGoogleWithCache = async () => {
            const key = makeCacheKey();
            const cached = TypeLLM.cache.get(key);
            if (cached && Date.now() - cached.ts < TypeLLM.CACHE_TTL) {
                TypeLLM.metricsLog(`${providerKey} cache-hit`);
                return cached.raw;
            }
            try {
                const raw = await callGoogle();
                TypeLLM.cache.set(key, { ts: Date.now(), raw });
                noteSuccess(providerKey);
                TypeLLM.metricsLog(`${providerKey} success`);
                return raw;
            } catch (err) {
                noteFailure(providerKey);
                TypeLLM.metricsLog(`${providerKey} failure ${String((err as any)?.message || err)}`);
                throw err;
            }
        };

        try {
            let rawText: string;
            if (disableLive) {
                // fall back to the previous in-repo fast path using the `ai` helper
                const response = await generateText({
                    model: this.modelInstance,
                    system: enhancedSystem,
                    messages: messages as any,
                    temperature: this.config.temperature ?? 0,
                });
                rawText = response.text;
            } else {
                if (this.config.provider === 'openai') {
                    rawText = await callOpenAIWithCache();
                } else if (this.config.provider === 'google') {
                    rawText = await callGoogleWithCache();
                } else {
                    // fallback to generic ai.generateText if provider not implemented
                    const response = await generateText({
                        model: this.modelInstance,
                        system: enhancedSystem,
                        messages: messages as any,
                        temperature: this.config.temperature ?? 0,
                    });
                    rawText = response.text;
                }
            }

            return this.parseAndRepair(rawText);
        } catch (error) {
            console.error('[TypeLLM] Execution Error:', error);
            // On provider failure, try one last time with the deterministic fallback parser
            try {
                const fallback = await generateText({
                    model: this.modelInstance,
                    system: enhancedSystem,
                    messages: messages as any,
                    temperature: 0,
                });
                return this.parseAndRepair(fallback.text);
            } catch (e) {
                throw error;
            }
        }
    }

    /**
     * Robust parsing logic with hallucination mapping and jsonrepair
     */
    private parseAndRepair(raw: string): TypeLLMResponse {
        let cleanText = raw.trim();

        // 1. Try to find JSON block in case model rambled (Anthropic fix)
        const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            cleanText = jsonMatch[0];
        }

        try {
            // 2. Repair and Parse
            const repaired = jsonrepair(cleanText);
            const parsed = JSON.parse(repaired);

            // 3. Normalize Tool Keys (The "Hallucination Bridge")
            // Models often hallucinate key names or use variations
            let tool = 'none';
            const toolKeys = ['tool', 'command', 'action', 'method', 'operation', 'step'];
            for (const key of toolKeys) {
                if (parsed[key]) {
                    tool = String(parsed[key]);
                    break;
                }
            }

            // 4. Normalize Arguments
            let args = {};
            const argKeys = ['args', 'parameters', 'params', 'input', 'data', 'properties'];
            for (const key of argKeys) {
                if (parsed[key] && typeof parsed[key] === 'object') {
                    args = parsed[key];
                    break;
                }
            }

            // 5. Intelligent Fallback: If we have a tool but no args,
            // the root object (minus meta keys) might be the args
            if (tool !== 'none' && Object.keys(args).length === 0) {
                const metaKeys = ['thought', 'tool', 'command', 'action', 'message', 'raw', 'method', 'operation', 'step'];
                const filtered: Record<string, any> = {};
                let foundAny = false;
                for (const k in parsed) {
                    if (!metaKeys.includes(k)) {
                        filtered[k] = parsed[k];
                        foundAny = true;
                    }
                }
                if (foundAny) args = filtered;
            }

            return {
                thought: parsed.thought || parsed.reasoning || parsed.explanation || '',
                tool: tool.toLowerCase().replace(/\s+/g, '_'),
                args: args,
                message: parsed.message || parsed.response || '',
                raw: raw
            };
        } catch (e) {
            // Fallback if repair fails
            return {
                thought: 'Failed to parse JSON response',
                tool: 'none',
                args: {},
                raw: raw
            };
        }
    }
}

/**
 * Convenience Factory
 */
export function createTypeLLM(config: TypeLLMConfig): TypeLLM {
    return new TypeLLM(config);
}
