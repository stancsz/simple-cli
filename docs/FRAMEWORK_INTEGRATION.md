# Framework Integration

## Overview

Simple CLI uses a "Meta-Orchestrator" architecture to integrate various AI frameworks (Jules, Aider, CrewAI, Picoclaw, etc.) as subordinate agents. Each framework is wrapped in an MCP server, allowing the core orchestrator to invoke them via standardized tool calls.

## DeepSeek Reasoner Upgrade

We have recently switched the default reasoner from Claude/GPT-4o to **DeepSeek Reasoner (R1)**. This change brings significant benefits:

*   **Cost Efficiency**: DeepSeek R1 offers comparable or superior reasoning capabilities at a fraction of the cost of other frontier models.
*   **Reasoning Quality**: The "Chain of Thought" reasoning provided by DeepSeek R1 excels at complex planning, architectural decisions, and bug diagnosis, making it an ideal choice for the orchestrator's "Brain".
*   **Performance**: The model demonstrates high throughput and low latency, essential for maintaining a responsive CLI experience.

## Integrated Frameworks

*   **Jules**: GitHub PR automation and code review.
*   **Aider**: Rapid, reliable code editing in local files.
*   **CrewAI**: Multi-agent research and complex task delegation.
*   **Picoclaw**: A lightweight, efficient reasoning framework for specific sub-tasks.
*   **Kimi**: Deep reasoning and long-context processing.
*   **Devin**: Full-stack software engineering capabilities.
*   **Cursor**: Advanced IDE integration for context-aware code generation.
*   **Windsurf**: Collaborative coding agent.
*   **Bolt.new**: Rapid prototyping tool (simulated integration).
*   **v0.dev**: AI-powered UI generation for React/Vue/HTML components.

## Adding New Frameworks

To add a new framework:

1.  **Ingest**: Analyze the CLI or API of the target framework.
2.  **Digest**: Create a new MCP server in `src/mcp_servers/<framework_name>/`.
3.  **Deploy**: Register the server in `src/cli.ts` (for local discovery) or `mcp.json` (for Docker/explicit config).

## Specific Integration Notes

### v0.dev Integration
*   **Capabilities**: Generates UI components from text descriptions.
*   **API**: v0.dev does not have a fully public, documented REST API at this time. The integration uses a client that mimics the expected structure (`https://api.v0.dev/...`) but includes robust fallback mechanisms (simulation/mocking) if the API is unreachable or changes.
*   **Authentication**: Uses `V0DEV_API_KEY`.
*   **Tools**: `v0dev_generate_component`, `v0dev_list_frameworks`, `v0dev_validate_prompt`.
