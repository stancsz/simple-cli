# Company Context (The Briefcase)

The "Briefcase" system allows agents to load client-specific contexts, ensuring that work for one client is isolated from another and informed by the client's specific guidelines, documents, and history.

## Architecture

The system is built around the **Company Context MCP Server** (`src/mcp_servers/company_context/index.ts`) which manages a dedicated `lancedb` vector database for each company.

### Directory Structure

Data is stored in `.agent/companies/{company_id}/`:

-   `docs/`: Raw documents (Markdown, Text) to be ingested.
-   `brain/`: The LanceDB vector database storing embeddings of the documents.
-   `config.json`: (Optional) Metadata like Brand Voice.

### Components

1.  **CLI Flag**: `simple --company client-a` sets the context.
2.  **Environment Variable**: `JULES_COMPANY` tracks the active company.
3.  **MCP Server**: Exposes tools to ingest and query company data.
4.  **Orchestrator**: Automatically injects relevant company context into the prompt using RAG.
5.  **Dynamic Switching**: Allows switching context at runtime using `/switch-to` command or `switch_company_context` tool.

## Usage

### 1. Create a Company Context

Create a directory:
```bash
mkdir -p .agent/companies/acme-corp/docs
```
Add documents (e.g., `brand_guidelines.md`) to this folder.

### 2. Run with Context

```bash
simple --company acme-corp
```
On startup, the agent will:
1.  Load the company profile.
2.  Filter memory and queries to `acme-corp`.

### 3. Dynamic Switching

You can switch the company context without restarting the session:

**Interactive Mode:**
Type `/switch-to client-b` in the chat prompt.
> /switch-to client-b

The agent will:
1.  Switch the active vector DB connection.
2.  Load the new company profile (persona, docs).
3.  Update the runtime context.

**Tool Usage (Agentic):**
Agents can call the `switch_company_context` tool to switch context programmatically if they determine a task belongs to a different client.

### 4. Ingest Documents

You can ask the agent:
> "Ingest the company documents."

The agent will use the `load_company_context` tool to scan `.agent/companies/acme-corp/docs`, embed the content, and store it in the vector DB.

### 5. Querying

The agent automatically queries this database when you ask questions, injecting relevant chunks into the conversation.

### 6. Multi-Tenant Interfaces

For Slack and Teams interfaces, you can specify the company context dynamically in your message using the `--company` flag:

> @bot Hello --company client-a

This isolates the session to the specified company without restarting the server.

## Tools

-   `switch_company_context(company_id)`: Switches the active company context.
-   `load_company_context(company_id)`: Ingests documents from the docs folder.
-   `query_company_context(query, company_id)`: Searches the vector database.
-   `list_companies()`: Lists available companies.

## Testing

The company context feature is validated by a comprehensive test suite:

1.  **Context Isolation**: `tests/company_context_integration.test.ts` verifies that `ContextServer` maintains separate context files for each company and that `ContextManager` queries the Brain MCP with the correct company ID.
2.  **Dynamic Switching**: `tests/company_context.test.ts` validates that the agent can seamlessly switch between multiple companies in a single session, ensuring connection pooling and correct data isolation.
3.  **Interface Integration**: `tests/interface_integration.test.ts` verifies that Slack and Teams adapters correctly parse the `--company` flag and pass it to the agent engine.
4.  **Vector Database**: Integration tests confirm that `CompanyContextServer` ingests and queries documents from isolated `lancedb` instances for each company.
