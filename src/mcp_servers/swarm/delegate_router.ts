import { MCP } from "../../mcp.js";

export interface SwarmPattern {
  role: string;
  strategy: string;
  rationale: string;
  candidates?: any[];
  confidence?: number;
}

export class DelegateRouter {
  private mcp: MCP;

  constructor(mcp: MCP) {
    this.mcp = mcp;
  }

  async querySwarmPatterns(taskDescription: string): Promise<SwarmPattern | null> {
    try {
      // Ensure Brain server is available
      let brainClient = this.mcp.getClient("brain");
      if (!brainClient) {
        // Try to start it if not running (though SwarmServer usually assumes it's managed externally or via auto-discovery)
        // Check if it is discovered first
        const servers = this.mcp.listServers();
        const brainServer = servers.find(s => s.name === "brain");
        if (brainServer && brainServer.status === "stopped") {
             try {
                 await this.mcp.startServer("brain");
                 brainClient = this.mcp.getClient("brain");
             } catch (e) {
                 console.warn("[DelegateRouter] Failed to auto-start brain:", e);
             }
        }
      }

      if (!brainClient) {
        // Silent fail if brain is not available (common in some envs)
        return null;
      }

      // Query Brain for swarm patterns
      const result = await brainClient.callTool({
        name: "brain_query",
        arguments: {
          query: taskDescription,
          type: "swarm_negotiation_pattern",
          limit: 1,
          format: "json"
        }
      }) as any;

      if (!result.content || result.content.length === 0) return null;

      const contentItem = result.content[0];
      if (contentItem.type !== "text") return null;

      const episodes = JSON.parse(contentItem.text);
      if (!Array.isArray(episodes) || episodes.length === 0) return null;

      // Analyze the best match
      const bestMatch = episodes[0];

      // Check similarity/distance if available
      // valid distance for cosine similarity is usually 0 to 2 (0 is identical) or 0 to 1 depending on implementation
      // Lancedb returns _distance. Lower is better.
      // Let's assume distance < 0.25 implies high similarity.
      const distance = bestMatch._distance;
      if (typeof distance === 'number' && distance > 0.25) {
          // Too different
          return null;
      }

      // Parse the pattern details
      // Expecting details in 'dreaming_outcomes' (primary) or 'agentResponse' (fallback)
      let patternData: any = {};

      if (bestMatch.dreaming_outcomes) {
          try {
              if (typeof bestMatch.dreaming_outcomes === 'string') {
                 patternData = JSON.parse(bestMatch.dreaming_outcomes);
              } else {
                 patternData = bestMatch.dreaming_outcomes;
              }
          } catch {
              // ignore
          }
      }

      // Fallback to agentResponse if patternData is empty
      if (!patternData.role && bestMatch.agentResponse) {
          try {
              // Try parsing if it looks like JSON
              if (bestMatch.agentResponse.trim().startsWith("{")) {
                  patternData = JSON.parse(bestMatch.agentResponse);
              }
          } catch {
              // ignore
          }
      }

      if (patternData.role && patternData.strategy) {
          return {
              role: patternData.role,
              strategy: patternData.strategy,
              rationale: patternData.rationale || "Recalled from successful swarm pattern.",
              candidates: patternData.candidates || [],
              confidence: distance ? (1 - distance) : 0.9 // Approximation
          };
      }

      return null;

    } catch (e) {
      console.error("[DelegateRouter] Error querying swarm patterns:", e);
      return null;
    }
  }
}
