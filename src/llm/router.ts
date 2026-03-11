import { LLM, LLMConfig, LLMResponse, createLLMInstance } from "../llm.js";
import { loadConfig } from "../config.js";
import { createLLMCache, LLMCache } from "./cache.js";
import { logMetric } from "../logger.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "path";
import { existsSync } from "fs";

export class AdaptiveRouter extends LLM {
  private routerCache: LLMCache | null = null;
  private isRouterCacheInitialized = false;
  private static businessOpsClient: Client | null = null;
  private static businessOpsClientPromise: Promise<Client | null> | null = null;
  public disableRouting: boolean = false;

  constructor(config: LLMConfig | LLMConfig[]) {
    super(config);
  }

  private async initializeRouterCache() {
    if (this.isRouterCacheInitialized) return;
    try {
      const config = await loadConfig();
      if (config.llmCache) {
        this.routerCache = createLLMCache({
             ...config.llmCache,
             // Use a specific prefix to isolate router decisions
             backend: config.llmCache.backend || "file"
        });
      }
    } catch (e) {
      console.warn(`[Adaptive Router] Failed to initialize cache: ${e}`);
    }
    this.isRouterCacheInitialized = true;
  }

  private async connectToBusinessOps(): Promise<Client | null> {
    if (AdaptiveRouter.businessOpsClient) return AdaptiveRouter.businessOpsClient;
    if (AdaptiveRouter.businessOpsClientPromise) return AdaptiveRouter.businessOpsClientPromise;

    AdaptiveRouter.businessOpsClientPromise = (async () => {
      const srcPath = join(process.cwd(), "src", "mcp_servers", "business_ops", "index.ts");
      const distPath = join(process.cwd(), "dist", "mcp_servers", "business_ops", "index.js");

      let command = "node";
      let args = [distPath];

      if (existsSync(srcPath) && !existsSync(distPath)) {
          command = "npx";
          args = ["tsx", srcPath];
      } else if (!existsSync(distPath)) {
          console.warn("[Adaptive Router] Could not find Business Ops server script. Falling back to default model.");
          return null;
      }

      const env: Record<string, string> = {};
      for (const key in process.env) {
          const val = process.env[key];
          if (val !== undefined && key !== 'PORT') {
              env[key] = val;
          }
      }
      env.MCP_DISABLE_DEPENDENCIES = 'true';

      const transport = new StdioClientTransport({
          command,
          args,
          env
      });

      const client = new Client(
          { name: "adaptive-router-client", version: "1.0.0" },
          { capabilities: {} }
      );

      try {
          await client.connect(transport);
          AdaptiveRouter.businessOpsClient = client;
          return client;
      } catch (e) {
          console.error("[Adaptive Router] Failed to connect to Business Ops:", e);
          return null;
      }
    })();
    return AdaptiveRouter.businessOpsClientPromise;
  }

  private async evaluateTaskComplexity(prompt: string): Promise<{score: number, recommended_model: string, reasoning: string} | null> {
      const client = await this.connectToBusinessOps();
      if (!client) return null;

      try {
          const res: any = await client.callTool({
              name: "evaluate_task_complexity",
              arguments: { prompt }
          });

          if (res.content && res.content[0] && res.content[0].text) {
              return JSON.parse(res.content[0].text);
          }
      } catch (e) {
          console.error("[Adaptive Router] Error calling evaluate_task_complexity tool:", e);
      }
      return null;
  }

  async generate(
    system: string,
    history: any[],
    signal?: AbortSignal,
    onTyping?: () => void,
  ): Promise<LLMResponse> {
      // If routing is explicitly disabled for this instance, bypass it
      if (this.disableRouting) {
          return super.generate(system, history, signal, onTyping);
      }

      const sysConfig = await loadConfig();
      const routingConfig = sysConfig.routing;

      // If routing is globally disabled or yoloMode is active, use base generate
      if (!routingConfig || !routingConfig.enabled || sysConfig.yoloMode) {
          return super.generate(system, history, signal, onTyping);
      }

      await this.initializeRouterCache();

      const lastUserMessage = history.filter((m) => m.role === "user").pop()?.content || "";
      const fullPrompt = system + "\n" + lastUserMessage;

      let decision: { score: number, recommended_model: string, reasoning: string } | null = null;
      const cacheKey = `router_${Buffer.from(fullPrompt).toString('base64').substring(0, 64)}`;

      if (this.routerCache) {
          try {
             const cachedDecision = await this.routerCache.get(cacheKey, 'router');
             if (cachedDecision) {
                 decision = cachedDecision as any;
             }
          } catch(e) {}
      }

      if (!decision) {
          decision = await this.evaluateTaskComplexity(fullPrompt);
          if (decision && this.routerCache) {
              await this.routerCache.set(cacheKey, 'router', decision);
          }
      }

      if (decision) {
          logMetric('llm', 'llm_router_complexity_score', decision.score, {
              model: decision.recommended_model
          });
          logMetric('llm', 'llm_router_model_selected', 1, {
              model: decision.recommended_model
          });

          // Check against cost profiles if provided
          let selectedModel = decision.recommended_model;

          if (routingConfig.modelMap && routingConfig.modelMap[selectedModel]) {
               selectedModel = routingConfig.modelMap[selectedModel];
          }

          // Compute estimated cost savings (Baseline is Opus vs selected)
          if (routingConfig.costProfiles) {
               const baselineCost = routingConfig.costProfiles["claude-3-opus-20240229"] || 15.0; // $ per 1M tokens
               const selectedCost = routingConfig.costProfiles[selectedModel] || baselineCost;
               const savings = baselineCost - selectedCost;
               if (savings > 0) {
                   logMetric('llm', 'llm_cost_savings_estimated', savings, {
                       model: selectedModel
                   });
               }
          }

          // Forward to dynamically created instance
          const routedLLM = createLLMInstance(selectedModel);
          (routedLLM as AdaptiveRouter).disableRouting = true; // Prevent recursive routing

          return routedLLM.generate(system, history, signal, onTyping);
      }

      // Fallback if evaluation failed
      const fallbackModel = routingConfig.defaultModel || "claude-3-5-sonnet-latest";
      logMetric('llm', 'llm_router_model_selected', 1, {
          model: fallbackModel
      });

      const routedLLM = createLLMInstance(fallbackModel);
      (routedLLM as AdaptiveRouter).disableRouting = true; // Prevent recursive routing

      return routedLLM.generate(system, history, signal, onTyping);
  }
}
