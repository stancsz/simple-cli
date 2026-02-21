// Static registry for lazy loading MCP servers
// This file defines the tools provided by core servers to allow
// the orchestrator to register them without starting the servers.

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

export const MCP_SERVER_REGISTRY: Record<string, ToolDefinition[]> = {
  brain: [
    {
      name: "brain_store",
      description: "Store a new episodic memory (task ID, request, solution, artifacts).",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "The unique ID of the task." },
          request: { type: "string", description: "The user's original request." },
          solution: { type: "string", description: "The agent's final solution or response." },
          artifacts: { type: "string", description: "JSON string array of modified file paths." },
          company: { type: "string", description: "The company/client identifier for namespacing." }
        },
        required: ["taskId", "request", "solution"]
      }
    },
    {
      name: "brain_query",
      description: "Search episodic memory for relevant past experiences.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query." },
          limit: { type: "number", description: "Max number of results.", default: 3 },
          company: { type: "string", description: "The company/client identifier for namespacing." }
        },
        required: ["query"]
      }
    },
    {
      name: "brain_query_graph",
      description: "Query the semantic graph (nodes and edges) for relationships.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term to find relevant nodes and edges." },
          company: { type: "string", description: "The company/client identifier for namespacing." }
        },
        required: ["query"]
      }
    },
    {
      name: "brain_update_graph",
      description: "Update the semantic graph by adding nodes or edges.",
      inputSchema: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["add_node", "add_edge"], description: "The operation to perform." },
          args: { type: "string", description: "JSON string containing arguments for the operation." },
          company: { type: "string", description: "The company/client identifier for namespacing." }
        },
        required: ["operation", "args"]
      }
    },
    {
      name: "brain_get_sop",
      description: "Retrieve a standard operating procedure (SOP) by name.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "The name of the SOP (e.g., 'deploy_app')." }
        },
        required: ["name"]
      }
    },
    {
      name: "log_experience",
      description: "Log a task execution experience for future learning.",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "The unique ID of the task." },
          task_type: { type: "string", description: "The type or category of the task (e.g., 'refactor', 'bugfix')." },
          agent_used: { type: "string", description: "The agent that performed the task." },
          outcome: { type: "string", description: "The outcome of the task (e.g., 'success', 'failure', 'pending')." },
          summary: { type: "string", description: "A brief summary of what happened." },
          artifacts: { type: "string", description: "JSON string array of modified file paths." },
          company: { type: "string", description: "The company/client identifier for namespacing." }
        },
        required: ["taskId", "task_type", "agent_used", "outcome", "summary"]
      }
    },
    {
      name: "recall_delegation_patterns",
      description: "Recall past delegation experiences to identify patterns and success rates.",
      inputSchema: {
        type: "object",
        properties: {
          task_type: { type: "string", description: "The type of task to analyze (e.g., 'refactor')." },
          query: { type: "string", description: "Additional query text." },
          company: { type: "string", description: "The company/client identifier for namespacing." }
        },
        required: ["task_type"]
      }
    }
  ],
  context_server: [
    {
      name: "read_context",
      description: "Read the current context.",
      inputSchema: {
        type: "object",
        properties: {
          company: { type: "string", description: "Company ID to read context for (optional)." }
        }
      }
    },
    {
      name: "update_context",
      description: "Update the context with partial updates (deep merged).",
      inputSchema: {
        type: "object",
        properties: {
          updates: { type: "string", description: "JSON string of updates to merge" },
          company: { type: "string", description: "Company ID to update context for (optional)." }
        },
        required: ["updates"]
      }
    },
    {
      name: "clear_context",
      description: "Reset the context to empty/default state.",
      inputSchema: {
        type: "object",
        properties: {
          company: { type: "string", description: "Company ID to clear context for (optional)." }
        }
      }
    }
  ],
  company_context: [
    {
      name: "load_company_context",
      description: "Ingest documents from the company's docs directory into the vector database.",
      inputSchema: {
        type: "object",
        properties: {
          company_id: { type: "string", description: "The ID of the company (e.g., 'client-a')." }
        },
        required: ["company_id"]
      }
    },
    {
      name: "query_company_context",
      description: "Query the company's vector database for relevant context.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query." },
          company_id: { type: "string", description: "The ID of the company. Defaults to environment variable if set." }
        },
        required: ["query"]
      }
    },
    {
      name: "list_companies",
      description: "List all available company contexts.",
      inputSchema: {
        type: "object",
        properties: {}
      }
    }
  ],
  "aider-server": [
    {
      name: "aider_chat",
      description: "Chat with Aider about your code or ask it to make edits.",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "The message or instruction for Aider." },
          files: { type: "array", items: { type: "string" }, description: "List of file paths to include in the context." }
        },
        required: ["message"]
      }
    },
    {
      name: "aider_edit",
      description: "Instruct Aider to edit specific files based on a request.",
      inputSchema: {
        type: "object",
        properties: {
          task: { type: "string", description: "The instruction describing the changes to make." },
          context_files: { type: "array", items: { type: "string" }, description: "List of file paths to edit." }
        },
        required: ["task", "context_files"]
      }
    }
  ],
  "claude-server": [
    {
      name: "claude_code",
      description: "Ask Claude to perform a task or answer a question.",
      inputSchema: {
        type: "object",
        properties: {
          task: { type: "string", description: "The task or question for Claude." },
          context_files: { type: "array", items: { type: "string" }, description: "List of file paths to provide as context." }
        },
        required: ["task"]
      }
    }
  ]
};
