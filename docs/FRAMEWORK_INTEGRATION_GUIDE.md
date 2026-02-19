# Framework Integration Guide: The Ingest-Digest-Deploy Process

This guide documents the standard procedure for integrating new AI frameworks into Simple CLI using the **Ingest-Digest-Deploy** methodology.

## Philosophy
Simple CLI is designed to be framework-agnostic. We do not build models; we integrate them. By wrapping external tools and APIs into MCP (Model Context Protocol) servers, we allow the orchestrator to delegate tasks to specialized agents.

## The Process

### 1. Ingest (Research Phase)
**Goal:** Understand the target framework's capabilities and interface.

*   **Analyze API/CLI:** Determine if the framework offers a REST API, a CLI tool, or a Node.js/Python SDK.
*   **Identify Key Capabilities:** What unique value does this framework add? (e.g., UI generation, complex reasoning, web browsing).
*   **Authentication:** How does it handle auth? (API keys, OAuth, local tokens).
*   **I/O Format:** What are the inputs (prompts, files) and outputs (code, text, file modifications)?

### 2. Digest (Implementation Phase)
**Goal:** Wrap the framework in a standardized MCP Server.

*   **Directory Structure:** Create a new directory in `src/mcp_servers/<framework_name>/`.
*   **Standard Files:**
    *   `index.ts`: The main entry point using `@modelcontextprotocol/sdk`.
    *   `client.ts`: (Optional) A clean wrapper class for the API or CLI interactions.
    *   `types.ts`: TypeScript definitions for requests/responses.
*   **Tool Implementation:**
    *   Define tools that expose the framework's core capabilities (e.g., `generate_ui`, `run_agent`).
    *   Use `zod` for input schema validation.
    *   Implement robust error handling (try/catch blocks, user-friendly error messages).
*   **LLM Integration:** If the framework requires complex prompt engineering or pre-validation, import `createLLM` from `src/llm.ts`.

### 3. Deploy (Registration Phase)
**Goal:** Make the new agent available to the Orchestrator.

*   **Configuration:** Add the server configuration to `mcp.json`.
    ```json
    {
      "mcpServers": {
        "framework_name": {
          "command": "npx",
          "args": ["tsx", "src/mcp_servers/framework_name/index.ts"],
          "env": {
            "API_KEY_VAR": "${API_KEY_VAR}"
          }
        }
      }
    }
    ```
*   **Environment Variables:** Document required environment variables.
*   **Documentation:** Update `docs/ROADMAP.md` to reflect the new integration.

## Testing Requirements
Every integration must be accompanied by comprehensive integration tests.

*   **Location:** `tests/integration/<framework>_integration.test.ts`.
*   **Strategy:**
    *   **Mocking:** Mock external API calls or CLI executions to ensure tests are deterministic and do not consume real credits.
    *   **Tool Verification:** Verify that the MCP server starts and tools are discoverable.
    *   **Error Handling:** Test invalid inputs, missing API keys, and timeout scenarios.

## Example: v0.dev Integration
(Completed in 1 day)
*   **Ingest:** Identified v0.dev as a UI generation API.
*   **Digest:** Created `src/mcp_servers/v0dev/` with `generate_component` tool.
*   **Deploy:** Configured in `mcp.json`.
