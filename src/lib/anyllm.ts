import { jsonrepair } from 'jsonrepair';
import fs from 'fs';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface AnyLLMResponse {
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

export interface AnyLLMConfig {
    apiKey?: string;
    model: string;
    provider: string;
    temperature?: number;
    maxTokens?: number;
    baseURL?: string;
}

export class AnyLLM {
    // Simple in-memory cache: key -> { ts, raw }
    private static cache = new Map<string, { ts: number; raw: string }>();

    // Circuit-breaker state per provider key
    private static cb = new Map<string, { fails: number; firstFailTs: number; tripUntil: number }>();

    private static CACHE_TTL = Number(process.env.ANYLLM_CACHE_TTL_MS || process.env.TYPELLM_CACHE_TTL_MS || 5 * 60 * 1000);
    private static CB_FAILS = Number(process.env.ANYLLM_CB_FAILS || process.env.TYPELLM_CB_FAILS || 5);
    private static CB_WINDOW = Number(process.env.ANYLLM_CB_WINDOW_MS || process.env.TYPELLM_CB_WINDOW_MS || 60 * 1000);
    private static CB_COOLDOWN = Number(process.env.ANYLLM_CB_COOLDOWN_MS || process.env.TYPELLM_CB_COOLDOWN_MS || 5 * 60 * 1000);

    private static metricsLog(fileMsg: string) {
        if (process.env.DEBUG !== 'true') return;
        const line = `${new Date().toISOString()} ${fileMsg}\n`;
        try {
            fs.appendFileSync('.anyllm_metrics.log', line);
        } catch (e) {
            // best-effort
        }
    }

    constructor(private config: AnyLLMConfig) {}

    /**
     * Generates a strict, tool-ready response
     */
    async generate(
        systemPrompt: string,
        messages: Message[],
        options: { strict?: boolean; repair?: boolean } = { strict: true, repair: true }
    ): Promise<AnyLLMResponse> {

        // Inject format reminder into system prompt if strict
        const enhancedSystem = options.strict
            ? `${systemPrompt}\n\nCRITICAL: Respond ONLY with a JSON object. No conversational text. Format: {"thought": "...", "tool": "name", "args": {...}}`
            : systemPrompt;

        const disableLive = process.env.DISABLE_LIVE_LLM === 'true';

        // Helpers: cache key and circuit-breaker management
        const makeCacheKey = () => {
            const h = crypto.createHash('sha256');
            h.update(this.config.provider + '|' + (this.config.model || '') + '|' + enhancedSystem + '|' + JSON.stringify(messages));
            return h.digest('hex');
        };

        const providerKey = `${this.config.provider}:${this.config.model}`;

        const isCircuitOpen = (key: string) => {
            const s = AnyLLM.cb.get(key);
            if (!s) return false;
            if (s.tripUntil && Date.now() < s.tripUntil) return true;
            return false;
        };

        const noteFailure = (key: string) => {
            const now = Date.now();
            let s = AnyLLM.cb.get(key);
            if (!s) s = { fails: 0, firstFailTs: now, tripUntil: 0 };
            if (now - s.firstFailTs > AnyLLM.CB_WINDOW) {
                s = { fails: 1, firstFailTs: now, tripUntil: 0 };
            } else {
                s.fails = (s.fails || 0) + 1;
            }
            if (s.fails >= AnyLLM.CB_FAILS) {
                s.tripUntil = now + AnyLLM.CB_COOLDOWN;
                AnyLLM.metricsLog(`${key} circuit-open until=${new Date(s.tripUntil).toISOString()} fails=${s.fails}`);
            }
            AnyLLM.cb.set(key, s);
        };

        const noteSuccess = (key: string) => {
            AnyLLM.cb.delete(key);
        };

        const callAnyLLM = async (): Promise<string> => {
            if (isCircuitOpen(providerKey)) throw new Error(`Circuit open for ${providerKey}`);

            const payload = {
                provider: this.config.provider,
                model: this.config.model,
                messages: [
                    { role: 'system', content: enhancedSystem },
                    ...messages
                ],
                api_key: this.config.apiKey,
                temperature: this.config.temperature,
                maxTokens: this.config.maxTokens
            };

            return new Promise((resolve, reject) => {
                // Use __dirname to locate the python script.
                // Works for ts-node (src/lib) and build (dist/lib) IF file is copied.
                // We assume the python file is alongside the js file.
                const pythonScript = join(__dirname, 'anyllm.py');

                // Fallback check if file exists, if not check src/lib (dev mode fallback)
                // This handles the case where dist/lib/anyllm.py is missing but we are in dev/repo root
                let scriptPath = pythonScript;
                if (!fs.existsSync(scriptPath)) {
                     // Try resolution relative to CWD if standard path fails
                     const devPath = join(process.cwd(), 'src/lib/anyllm.py');
                     if (fs.existsSync(devPath)) {
                         scriptPath = devPath;
                     } else {
                         // One more try: ../../src/lib/anyllm.py relative to __dirname (dist/lib -> root -> src/lib)
                         const devPath2 = join(__dirname, '../../src/lib/anyllm.py');
                         if (fs.existsSync(devPath2)) {
                             scriptPath = devPath2;
                         }
                     }
                }

                const child = spawn('python3', [scriptPath]);

                let output = '';
                let errorOutput = '';

                child.stdout.on('data', (data) => {
                    output += data.toString();
                });

                child.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                });

                child.on('close', (code) => {
                    if (code !== 0) {
                        reject(new Error(`Python process exited with code ${code}: ${errorOutput}`));
                        return;
                    }

                    try {
                        const result = JSON.parse(output);
                        if (result.error) {
                            reject(new Error(result.error));
                        } else {
                            resolve(result.content);
                        }
                    } catch (e) {
                        reject(new Error(`Failed to parse Python output: ${output} (Error: ${e})`));
                    }
                });

                child.stdin.write(JSON.stringify(payload));
                child.stdin.end();
            });
        };

        const callAnyLLMWithCache = async () => {
             const key = makeCacheKey();
             const cached = AnyLLM.cache.get(key);
             if (cached && Date.now() - cached.ts < AnyLLM.CACHE_TTL) {
                 AnyLLM.metricsLog(`${providerKey} cache-hit`);
                 return cached.raw;
             }
             try {
                 const raw = await callAnyLLM();
                 AnyLLM.cache.set(key, { ts: Date.now(), raw });
                 noteSuccess(providerKey);
                 AnyLLM.metricsLog(`${providerKey} success`);
                 return raw;
             } catch (err) {
                 noteFailure(providerKey);
                 AnyLLM.metricsLog(`${providerKey} failure ${String((err as any)?.message || err)}`);
                 throw err;
             }
        };

        try {
            let rawText: string;
             if (disableLive) {
                 // Return mock response
                 rawText = JSON.stringify({
                     thought: "Live LLM disabled, returning mock.",
                     tool: "none",
                     args: {}
                 });
             } else {
                 rawText = await callAnyLLMWithCache();
             }
             return this.parseAndRepair(rawText);
        } catch (error) {
            console.error('[AnyLLM] Execution Error:', error);
            throw error;
        }
    }

    /**
     * Robust parsing logic with hallucination mapping and jsonrepair
     */
    private parseAndRepair(raw: string): AnyLLMResponse {
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
export function createAnyLLM(config: AnyLLMConfig): AnyLLM {
    return new AnyLLM(config);
}
