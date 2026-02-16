import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { jsonrepair } from "jsonrepair";

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

  constructor(config: LLMConfig | LLMConfig[]) {
    this.configs = Array.isArray(config) ? config : [config];
  }

  async generate(
    system: string,
    history: any[],
    signal?: AbortSignal,
  ): Promise<LLMResponse> {
    let lastError: Error | null = null;
    const lastUserMessage =
      history.filter((m) => m.role === "user").pop()?.content || "";

    for (const config of this.configs) {
      try {
        if (signal?.aborted) throw new Error("Aborted by user");
        const providerName = config.provider.toLowerCase();

        // --- Fallback: Internal API Logic ---
        const modelName = config.model;
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
          })(modelName);
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
        } else {
          continue; // Skip unsupported
        }

        const { text, usage } = await generateText({
          model,
          system,
          messages: history as any,
          abortSignal: signal,
        });

        return this.parse(text, usage as any);
      } catch (e: any) {
        lastError = e;
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

  private getEnvKey(providerName: string): string | undefined {
    if (providerName === "openai" || providerName === "codex")
      return process.env.OPENAI_API_KEY;
    if (providerName === "deepseek") return process.env.DEEPSEEK_API_KEY;
    if (providerName === "anthropic" || providerName === "claude")
      return process.env.ANTHROPIC_API_KEY;
    if (providerName === "google" || providerName === "gemini")
      return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (providerName === "moonshot" || providerName === "kimi")
      return process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY;
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
  const m = model || process.env.MODEL || "openai:gpt-5.2-codex";
  let [p, n] = m.includes(":") ? m.split(":") : ["openai", m];

  // Auto-detect provider if missing
  if (p === "openai" && n.includes("deepseek")) {
    p = n.includes("chat") || n.includes("reasoner") ? "deepseek" : "deepseek-claude";
  }
  if (p === "openai" && (n.includes("claude") || n.includes("sonnet"))) p = "anthropic";
  if (p === "openai" && (n.includes("gemini") || n.includes("flash"))) p = "google";

  // Define Failover Chain
  const configs: LLMConfig[] = [{ provider: p, model: n }];

  // Add fallbacks if they aren't the primary
  const fallbacks: LLMConfig[] = [
    { provider: "anthropic", model: "claude-3-7-sonnet-latest" },
    { provider: "google", model: "gemini-2.0-flash-001" },
    { provider: "openai", model: "gpt-4o" },
  ];

  for (const f of fallbacks) {
    // Prevent duplicate provider/model combinations
    if (!(f.provider === p && f.model === n)) {
      configs.push(f);
    }
  }

  return new LLM(configs);
};
