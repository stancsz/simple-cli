import { generateText, embed } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { jsonrepair } from "jsonrepair";
import chalk from "chalk";
import { PersonaEngine } from "./persona.js";
import { logMetric } from "./logger.js";
import { createLLMCache, LLMCache } from "./llm/cache.js";
import { loadConfig } from "./config.js";
import { BatchPromptBuilder, BatchTaskInput, BatchTaskResult } from "./llm/batch_prompt_builder.js";

export interface LLMResponse {
  thought: string;
  tool: string;
  args: any;
  message?: string;
  raw: string;
  tools?: { tool: string; args: any }[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export type LLMConfig = { provider: string; model: string; apiKey?: string };

export class LLM {
  private configs: LLMConfig[];
  public personaEngine: PersonaEngine;
  private cache: LLMCache | null = null;
  private isCacheInitialized = false;

  constructor(config: LLMConfig | LLMConfig[]) {
    this.configs = Array.isArray(config) ? config : [config];
    this.personaEngine = new PersonaEngine();
  }

  private async initializeCache() {
    if (this.isCacheInitialized) return;
    try {
      const config = await loadConfig();
      if (config.llmCache) {
        this.cache = createLLMCache(config.llmCache);
      }
    } catch (e) {
      console.warn(`[LLM] Failed to initialize cache: ${e}`);
    }
    this.isCacheInitialized = true;
  }

  async embed(text: string): Promise<number[]> {
    for (const config of this.configs) {
      const providerName = config.provider.toLowerCase();
      const apiKey = config.apiKey || this.getEnvKey(providerName);

      if (!apiKey) continue;

      let embeddingModel: any;

      try {
        if (providerName === "openai") {
          embeddingModel = createOpenAI({ apiKey }).embedding("text-embedding-3-small");
        } else if (providerName === "google" || providerName === "gemini") {
          embeddingModel = createGoogleGenerativeAI({ apiKey }).textEmbeddingModel("text-embedding-004");
        } else {
          continue;
        }

        const { embedding } = await embed({
          model: embeddingModel,
          value: text,
        });
        return embedding;
      } catch (e) {
        console.error(`[LLM] Embedding failed with ${providerName}:`, e);
      }
    }

    // Fallback: Try OpenAI explicitly if not found in chain or all failed
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const embeddingModel = createOpenAI({ apiKey: openaiKey }).embedding("text-embedding-3-small");
        const { embedding } = await embed({
          model: embeddingModel,
          value: text,
        });
        return embedding;
      } catch (e) {
        console.error(`[LLM] Fallback OpenAI embedding failed:`, e);
      }
    }

    throw new Error("Failed to generate embedding: No suitable provider found.");
  }

  // Global queue for cross-instance request batching within the same Node.js process
  private static generateQueue: {
    id: string;
    system: string;
    history: any[];
    resolve: (res: LLMResponse) => void;
    reject: (err: any) => void;
  }[] = [];
  private static generateTimer: NodeJS.Timeout | null = null;
  private static readonly BATCH_WINDOW_MS = 50; // Tiny window to catch concurrent requests

  async generate(
    system: string,
    history: any[],
    signal?: AbortSignal,
    onTyping?: () => void,
  ): Promise<LLMResponse> {
    // Phase 28: Detect if we should batch this concurrent call
    const sysConfig = await loadConfig();
    const batchEnabled = sysConfig.batching?.enabled ?? true;

    // Only attempt batching if no streaming is requested and it's a "user" history length that suggests a strategic scan
    // For simplicity, we only batch requests with similar system prompts if batching is enabled
    if (batchEnabled && !onTyping && !sysConfig.yoloMode) {
      return new Promise((resolve, reject) => {
        const reqId = require('crypto').randomUUID();
        LLM.generateQueue.push({ id: reqId, system, history, resolve, reject });

        if (LLM.generateQueue.length >= (sysConfig.batching?.maxBatchSize || 5)) {
            if (LLM.generateTimer) clearTimeout(LLM.generateTimer);
            LLM.processGenerateQueue(this);
        } else if (!LLM.generateTimer) {
            LLM.generateTimer = setTimeout(() => {
                LLM.processGenerateQueue(this);
            }, LLM.BATCH_WINDOW_MS);
        }
      });
    }

    return this.internalGenerate(system, history, signal, onTyping);
  }

  private static async processGenerateQueue(llmInstance: LLM) {
    LLM.generateTimer = null;
    const queue = [...LLM.generateQueue];
    LLM.generateQueue = [];

    if (queue.length === 0) return;

    if (queue.length === 1) {
        // Just process normally
        const req = queue[0];
        try {
            const res = await llmInstance.internalGenerate(req.system, req.history);
            req.resolve(res);
        } catch (e) {
            req.reject(e);
        }
        return;
    }

    // Group by system prompt roughly (to ensure same persona/company context)
    const groups = new Map<string, typeof queue>();
    for (const req of queue) {
        if (!groups.has(req.system)) groups.set(req.system, []);
        groups.get(req.system)!.push(req);
    }

    for (const [system, reqs] of groups.entries()) {
        if (reqs.length === 1) {
             const req = reqs[0];
             llmInstance.internalGenerate(req.system, req.history).then(req.resolve).catch(req.reject);
             continue;
        }

        console.log(`[LLM Batch] Processing batch of ${reqs.length} concurrent requests.`);
        const tasks: BatchTaskInput[] = reqs.map(req => ({
            id: req.id,
            // Construct a single prompt string from history
            prompt: req.history.map(h => `${h.role}: ${h.content}`).join("\n")
        }));

        try {
            const batchResults = await llmInstance.generateBatched(system, tasks);

            for (const req of reqs) {
                const result = batchResults.find(r => r.id === req.id);
                if (result && result.status === 'success') {
                    req.resolve({
                        thought: result.thought || "",
                        tool: result.tool || "none",
                        args: result.args || {},
                        message: result.message || "",
                        raw: JSON.stringify(result)
                    });
                } else {
                    // Fallback to individual request if parsing failed
                    llmInstance.internalGenerate(req.system, req.history).then(req.resolve).catch(req.reject);
                }
            }
        } catch (e) {
            console.error(`[LLM Batch] Failed to batch generate: ${e}`);
            // Fallback all
            for (const req of reqs) {
                llmInstance.internalGenerate(req.system, req.history).then(req.resolve).catch(req.reject);
            }
        }
    }
  }

  private async internalGenerate(
    system: string,
    history: any[],
    signal?: AbortSignal,
    onTyping?: () => void,
  ): Promise<LLMResponse> {
    // Ensure Persona is loaded and applied to System Prompt (Voice Consistency)
    await this.personaEngine.loadConfig();
    const systemWithPersona = this.personaEngine.injectPersonality(system);
    await this.initializeCache();

    let lastError: Error | null = null;
    const lastUserMessage =
      history.filter((m) => m.role === "user").pop()?.content || "";

    // Compute cache key combining system prompt and user history.
    const cachePrompt = systemWithPersona + "\n" + JSON.stringify(history);

    for (const config of this.configs) {
      const providerName = config.provider.toLowerCase();
      const modelName = config.model;

      // Load config to check YOLO mode
      const sysConfig = await loadConfig();

      // Check Cache First
      // Bypass cache if streaming is requested or YOLO mode
      if (this.cache && !onTyping && !sysConfig.yoloMode) {
        const cached = await this.cache.get(cachePrompt, modelName);
        if (cached) {
          logMetric('llm', 'llm_cache_hit', 1, { model: modelName, provider: providerName });
          // If usage tokens are cached, log them
          if (cached.usage) {
             const totalTokens = cached.usage.totalTokens ?? 0;
             logMetric('llm', 'llm_tokens_total_cached', totalTokens, { model: modelName, provider: providerName });
          }
          return await this.personaEngine.transformResponse(cached, onTyping);
        }
      }
      if (!sysConfig.yoloMode) {
        logMetric('llm', 'llm_cache_miss', 1, { model: modelName, provider: providerName });
      }

      try {
        if (signal?.aborted) throw new Error("Aborted by user");

        // --- Fallback: Internal API Logic ---
        let model: any;
        const apiKey = config.apiKey || this.getEnvKey(providerName);

        if (!apiKey) {
          console.warn(`[LLM] Skipping ${providerName}:${modelName} - API key not found.`);
          continue;
        }

        if (providerName === "openai" || providerName === "codex") {
          model = createOpenAI({ apiKey })(modelName);
        } else if (providerName === "deepseek") {
          model = createOpenAI({
            apiKey,
            baseURL: "https://api.deepseek.com",
          }).chat(modelName);
        } else if (providerName === "anthropic" || providerName === "claude") {
          model = createAnthropic({ apiKey });
          model = model(modelName);
        } else if (providerName === "google" || providerName === "gemini") {
          model = createGoogleGenerativeAI({ apiKey });
          model = model(modelName);
        } else if (providerName === "deepseek-claude") {
          model = createAnthropic({
            apiKey,
            baseURL: "https://api.deepseek.com/anthropic"
          });
          model = model(modelName);
        } else if (providerName === "moonshot" || providerName === "kimi") {
          model = createOpenAI({
            apiKey,
            baseURL: "https://api.moonshot.cn/v1",
          })(modelName);
        } else if (providerName === "deepseek-openai" || providerName === "codex-deepseek") {
          console.log(chalk.gray(`[LLM] Attempting DeepSeek (via OpenAI SDK) with baseURL: https://api.deepseek.com`));
          model = createOpenAI({
            apiKey,
            baseURL: "https://api.deepseek.com",
          }).chat(modelName);
        } else {
          continue; // Skip unsupported
        }

        const start = Date.now();
        const { text, usage } = await generateText({
          model,
          system: systemWithPersona,
          messages: history as any,
          abortSignal: signal,
        });
        const duration = Date.now() - start;

        // Log Metrics
        logMetric('llm', 'llm_latency', duration, { model: modelName, provider: providerName });
        if (usage) {
          // Handle potential undefined values
          const totalTokens = usage.totalTokens ?? 0;
          logMetric('llm', 'llm_tokens_total', totalTokens, { model: modelName, provider: providerName });
          
          // The AI SDK may have different property names - check for common patterns
          const promptTokens = (usage as any).promptTokens ?? (usage as any).inputTokens ?? 0;
          const completionTokens = (usage as any).completionTokens ?? (usage as any).outputTokens ?? 0;
          logMetric('llm', 'llm_tokens_prompt', promptTokens, { model: modelName, provider: providerName });
          logMetric('llm', 'llm_tokens_completion', completionTokens, { model: modelName, provider: providerName });
        }

        const parsed = this.parse(text, usage as any);

        if (this.cache && !onTyping && !sysConfig.yoloMode) {
           await this.cache.set(cachePrompt, modelName, parsed);

           // Calculate cache size (rough estimate based on JSON stringification)
           const sizeBytes = Buffer.byteLength(JSON.stringify(parsed), 'utf8');
           logMetric('llm', 'llm_cache_size', sizeBytes, { model: modelName, provider: providerName });
        }

        // Apply Persona Formatting (Catchphrases, Emojis, Typing Delay)
        return await this.personaEngine.transformResponse(parsed, onTyping);
      } catch (e: any) {
        lastError = e;
        logMetric('llm', 'llm_error', 1, { model: modelName, provider: providerName, error: e.name });
        console.error(`[LLM] ${providerName}:${modelName} failed: ${e.message}`);
        if (this.configs.indexOf(config) === 0) {
          console.warn(
            `[LLM] Primary provider failed, switching to fallbacks...`,
          );
        }
      }
    }

    throw new Error(
      `All LLM providers failed. Last error: ${lastError?.message}`,
    );
  }

  async generateBatched(
    system: string,
    tasks: BatchTaskInput[],
    signal?: AbortSignal
  ): Promise<BatchTaskResult[]> {
    await this.personaEngine.loadConfig();
    const systemWithPersona = this.personaEngine.injectPersonality(system);
    const metaPrompt = BatchPromptBuilder.buildPrompt(tasks, systemWithPersona);

    // To record cost savings properly, calculate independent call costs roughly vs the batched cost
    const batchedCallCount = tasks.length;
    let totalPromptTokens = 0;

    try {
      // Use the generic generate implementation but treat the meta-prompt as the user history
      const response = await this.generate(
         metaPrompt,
         [{ role: "user", content: "Execute the batch tasks according to the instructions above." }],
         signal
      );

      const parsedResults = BatchPromptBuilder.parseResponse(response.raw || "", tasks.map(t => t.id));

      // Calculate token savings (Rough approximation: 1 system prompt instead of N)
      if (response.usage && batchedCallCount > 1) {
          totalPromptTokens = response.usage.promptTokens ?? 0;

          // Estimate single request size = (totalPrompt / N) + overhead
          const estimatedSinglePromptTokens = Math.floor(totalPromptTokens / batchedCallCount) * batchedCallCount;
          // In reality, independent calls would send the base system prompt each time.
          // Say the base system prompt is ~500 tokens.
          const baseSystemPromptTokens = 500;
          const tokensSaved = (baseSystemPromptTokens * (batchedCallCount - 1));

          logMetric('llm', 'batched_calls_count', batchedCallCount, { batch_size: batchedCallCount.toString() });
          logMetric('llm', 'tokens_saved_via_batching', tokensSaved, { batch_size: batchedCallCount.toString() });
          console.log(`[LLM Batch] Processed ${batchedCallCount} tasks in a single call. Estimated tokens saved: ${tokensSaved}`);
      }

      return parsedResults;
    } catch (e: any) {
      console.error(`[LLM Batch] Failed to execute batch: ${e.message}`);
      return tasks.map(t => ({
         id: t.id,
         status: 'failed',
         error: e.message
      }));
    }
  }

  private getEnvKey(providerName: string): string | undefined {
    if (providerName === "openai" || providerName === "codex")
      return process.env.OPENAI_API_KEY;
    if (providerName === "deepseek") return process.env.DEEPSEEK_API_KEY;
    if (providerName === "deepseek-claude")
      return process.env.DEEPSEEK_API_KEY;
    if (providerName === "anthropic" || providerName === "claude")
      return process.env.ANTHROPIC_API_KEY;
    if (providerName === "google" || providerName === "gemini")
      return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (providerName === "moonshot" || providerName === "kimi")
      return process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY;
    if (providerName === "deepseek-openai" || providerName === "codex-deepseek")
      return process.env.DEEPSEEK_API_KEY;
    return undefined;
  }

  private parse(
    raw: string,
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    },
  ): LLMResponse {
    const tools: { tool: string; args: any }[] = [];
    let thought = "";
    let message = "";
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
        } else if (char === "\\") {
          escape = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        if (braceBalance === 0) {
          startIndex = i;
        }
        braceBalance++;
      } else if (char === "}") {
        braceBalance--;
        if (braceBalance === 0 && startIndex !== -1) {
          const jsonStr = rawTrimmed.substring(startIndex, i + 1);
          try {
            const repaired = jsonrepair(jsonStr);
            const obj = JSON.parse(repaired);

            // Extract tool call
            if (obj.tool && obj.tool !== "none") {
              tools.push({
                tool: obj.tool.toLowerCase(),
                args: obj.args || obj.parameters || {},
              });
            }

            // Aggregate thought and message
            if (obj.thought) thought += (thought ? "\n" : "") + obj.thought;
            if (obj.message) message += (message ? "\n" : "") + obj.message;
          } catch (e) {
            // Ignore malformed blocks inside mixed content
          }
          startIndex = -1;
        }
      }
    }

    // 2. Fallback: If no tools found via loop, try single block extraction (legacy behavior)
    if (tools.length === 0) {
      try {
        const jsonPart = rawTrimmed.match(/\{[\s\S]*\}/)?.[0] || rawTrimmed;
        const repaired = jsonrepair(jsonPart);
        const p = JSON.parse(repaired);
        return {
          thought: p.thought || "",
          tool: (p.tool || p.command || "none").toLowerCase(),
          args: p.args || p.parameters || {},
          message: p.message || "",
          raw,
          usage,
        };
      } catch {
        return {
          thought: "",
          tool: "none",
          args: {},
          message: raw,
          raw,
          usage,
        };
      }
    }

    return {
      thought: thought.trim(),
      tool: tools[0]?.tool || "none",
      args: tools[0]?.args || {},
      message: message.trim(),
      raw,
      tools,
      usage,
    };
  }
}

export const createLLM = (model?: string) => {
  // Primary model
  const m = model || process.env.MODEL || "deepseek:deepseek-reasoner";
  let [p, n] = m.includes(":") ? m.split(":") : ["openai", m];

  // Auto-detect provider if missing
  if (p === "openai" && n.includes("deepseek")) {
    p = "deepseek";
  }
  if (p === "openai" && (n.includes("claude") || n.includes("sonnet"))) p = "anthropic";
  if (p === "openai" && (n.includes("gemini") || n.includes("flash"))) p = "google";

  // Define Failover Chain
  const configs: LLMConfig[] = [{ provider: p, model: n }];

  // Only add fallbacks if no specific provider was explicitly requested via colon
  if (!m.includes(":")) {
    const fallbacks: LLMConfig[] = [
      { provider: "anthropic", model: "claude-3-7-sonnet-latest" },
      { provider: "deepseek", model: "deepseek-reasoner" },
      { provider: "deepseek-openai", model: "deepseek-reasoner" },
      { provider: "google", model: "gemini-2.0-flash-001" },
      { provider: "openai", model: "gpt-4o" },
    ];

    for (const f of fallbacks) {
      if (!(f.provider === p && f.model === n)) {
        configs.push(f);
      }
    }
  }

  return new LLM(configs);
};
