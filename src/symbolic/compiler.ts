import { TaskGraph, TaskNode, ToolCallNode } from "./task_graph.js";
import { RuleEngine } from "./rule_engine.js";
import { EpisodicMemory } from "../brain/episodic.js";
import { createLLM, LLM } from "../llm.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"; // or similar to call tools

export class SymbolicEngine {
    private ruleEngine: RuleEngine;
    private compiledGraphs: Map<string, TaskGraph> = new Map();

    constructor() {
        this.ruleEngine = new RuleEngine();
    }

    /**
     * Abstract a workflow into a TaskGraph using a lightweight LLM.
     */
    async compile(intentName: string, episodeIds: string[], episodic: EpisodicMemory, llm?: LLM): Promise<TaskGraph | null> {
        if (!llm) {
            // Create a lightweight LLM for extraction
            llm = createLLM("claude-3-haiku-20240307");
        }

        // Disable routing to avoid recursion
        if ('disableRouting' in llm) {
            (llm as any).disableRouting = true;
        }

        // 1. Fetch episodes
        const episodes = [];
        for (const id of episodeIds) {
            const results = await episodic.recall(id, 1);
            if (results && results.length > 0) {
                // Find exact match just in case
                const exact = results.find(r => r.id === id) || results[0];
                episodes.push(exact);
            }
        }

        if (episodes.length === 0) {
            console.warn(`[SymbolicCompiler] No episodes found for IDs: ${episodeIds.join(', ')}`);
            return null;
        }

        // 2. Extract invariant steps using LLM
        const prompt = `
Analyze the following successful execution episodes for the intent "${intentName}".
Extract the invariant sequence of tool calls, required conditionals (business rules), and data flows.
Compile this into a deterministic TaskGraph schema.

Output ONLY valid JSON matching this structure:
{
  "id": "generated_uuid_or_name",
  "name": "${intentName}",
  "description": "Short description",
  "trigger_intent": "Keywords or prompt pattern that triggers this",
  "startNode": "node_1",
  "contextVariables": ["list", "of", "vars"],
  "nodes": {
    "node_1": {
      "id": "node_1",
      "type": "tool_call",
      "toolName": "name_of_tool",
      "argumentsTemplate": { "arg1": "{{contextVar}}" },
      "resultKey": "output_var",
      "next": "node_2"
    },
    "node_2": {
      "id": "node_2",
      "type": "condition",
      "condition": "output_var.status == 'success'",
      "next": { "true": "node_3", "false": "node_4" }
    }
  }
}

Episodes:
${JSON.stringify(episodes, null, 2)}
`;

        try {
            const response = await llm.generate("You are an expert systems architect compiling probabilistic behavior into deterministic symbolic task graphs.", [{ role: 'user', content: prompt }]);

            // Extract JSON from response
            const text = response.message || "";
            const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const graphData = JSON.parse(jsonMatch[1] || jsonMatch[0]) as TaskGraph;
                this.compiledGraphs.set(graphData.name, graphData);
                return graphData;
            } else {
                 console.error("[SymbolicCompiler] Failed to extract JSON from LLM response.");
                 return null;
            }
        } catch (e) {
            console.error("[SymbolicCompiler] Compilation failed:", e);
            return null;
        }
    }

    /**
     * Executes a TaskGraph deterministically.
     */
    async execute(graph: TaskGraph, initialContext: Record<string, any>, clientCallToolFn: (name: string, args: any) => Promise<any>): Promise<Record<string, any>> {
        let currentNodeId: string | undefined = graph.startNode;
        const context = { ...initialContext };

        console.log(`[SymbolicEngine] Executing TaskGraph: ${graph.name}`);

        while (currentNodeId && graph.nodes[currentNodeId]) {
            const node = graph.nodes[currentNodeId];

            if (node.type === 'tool_call') {
                const toolNode = node as ToolCallNode;
                // Resolve arguments using rule engine
                const resolvedArgs = this.ruleEngine.resolveTemplate(toolNode.argumentsTemplate, context);

                console.log(`[SymbolicEngine] Executing tool: ${toolNode.toolName}`, resolvedArgs);

                try {
                    const result = await clientCallToolFn(toolNode.toolName, resolvedArgs);

                    // Basic parsing of result content if it's standard MCP format
                    let parsedResult = result;
                    if (result && result.content && result.content[0] && result.content[0].text) {
                        try {
                           parsedResult = JSON.parse(result.content[0].text);
                        } catch(e) {
                           parsedResult = result.content[0].text;
                        }
                    }

                    if (toolNode.resultKey) {
                        context[toolNode.resultKey] = parsedResult;
                    }
                } catch (e) {
                    console.error(`[SymbolicEngine] Tool execution failed: ${toolNode.toolName}`, e);
                    // Standardize error handling or break
                    context['error'] = String(e);
                    break;
                }

                currentNodeId = toolNode.next as string;

            } else if (node.type === 'condition') {
                const condNode = node as any;
                const result = this.ruleEngine.evaluateCondition(condNode.condition, context);
                console.log(`[SymbolicEngine] Evaluating condition: ${condNode.condition} -> ${result}`);
                currentNodeId = result ? condNode.next.true : condNode.next.false;
            } else if (node.type === 'data_transform') {
                 // Simple pass-through for now, can implement JSONPath or simple JS eval later
                 const transformNode = node as any;
                 const val = context[transformNode.inputKey];
                 context[transformNode.outputKey] = val; // naive transform
                 currentNodeId = transformNode.next as string;
            } else {
                console.warn(`[SymbolicEngine] Unknown node type: ${(node as any).type}`);
                break;
            }
        }

        console.log(`[SymbolicEngine] TaskGraph execution complete.`);
        return context;
    }

    getGraphByIntent(intent: string): TaskGraph | undefined {
        for (const graph of this.compiledGraphs.values()) {
            // Simple string matching for intent trigger
            if (intent.toLowerCase().includes(graph.trigger_intent.toLowerCase()) ||
                graph.trigger_intent.toLowerCase().includes(intent.toLowerCase())) {
                return graph;
            }
        }
        return undefined;
    }

    addGraph(graph: TaskGraph) {
        this.compiledGraphs.set(graph.name, graph);
    }
}

// Global instance
export const globalSymbolicEngine = new SymbolicEngine();
