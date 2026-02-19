# Company Context (The Briefcase)

The **Company Context** pillar ensures that the agent understands the specific context of the client or company it is working for. This includes brand voice, internal documentation, coding standards, and past decisions.

## Architecture

The Company Context system consists of:

1.  **Company Context MCP Server** (`src/mcp_servers/company_context/`):
    *   Manages a Vector Database (LanceDB) for storing and retrieving company-specific documents.
    *   Reuses the `.agent/brain/episodic` storage location but uses namespaced tables (e.g., `company_{company_id}`).
    *   Provides tools: `store_company_document`, `load_company_context`, `query_company_memory`.

2.  **Briefcase** (`src/context/briefcase.ts`):
    *   Handles switching between companies via `--company` CLI flag or `switch_company` tool.
    *   Loads static profiles and configurations.

3.  **Engine Integration** (`src/engine/orchestrator.ts`):
    *   On startup, loads the "Company Profile" (summarized context) from the Vector DB.
    *   Injects the profile into the system prompt or user context.
    *   Performs RAG (Retrieval-Augmented Generation) on every user message to inject relevant company knowledge.

## Usage

### 1. Ingesting Documents

To add documents to a company's knowledge base, use the `store_company_document` tool (or a script using it).

```typescript
// Example usage via MCP tool
await useTool("company_context", "store_company_document", {
  company_name: "client-a",
  document_path: "/path/to/docs/branding.md"
});
```

### 2. Loading Context

Start the agent with the `--company` flag:

```bash
simple --company client-a
```

The agent will:
1.  Load the company profile from `.agent/companies/client-a/profile.json` (if exists).
2.  Query the Vector DB for "profile", "onboarding", "overview".
3.  Inject the combined context into the session.

### 3. RAG Querying

During conversation, the agent automatically queries the Company Context for relevant information based on the user's input.

```
User: "How should I format the error logs?"
Agent: [Queries Vector DB for "error logs"] -> [Retrieves "logging_standards.md"] -> [Answers based on standards]
```

## Configuration

Ensure `mcp.json` includes the server configuration:

```json
{
  "mcpServers": {
    "company_context": {
      "command": "npx",
      "args": ["tsx", "src/mcp_servers/company_context/index.ts"]
    }
  }
}
```
