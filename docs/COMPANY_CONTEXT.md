# Company Context (The Briefcase)

The "Briefcase" system allows agents to load client-specific contexts, ensuring that work for one client is isolated from another and informed by the client's specific guidelines, documents, and history.

## Architecture

The system is built around the **Company Context MCP Server** (`src/mcp_servers/company_context.ts`) which manages a dedicated `lancedb` vector database for each company.

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

### 3. Ingest Documents

You can ask the agent:
> "Ingest the company documents."

The agent will use the `load_company_context` tool to scan `.agent/companies/acme-corp/docs`, embed the content, and store it in the vector DB.

### 4. Querying

The agent automatically queries this database when you ask questions, injecting relevant chunks into the conversation.

### 5. Multi-Tenant Interfaces

For Slack and Teams interfaces, you can specify the company context dynamically in your message using the `--company` flag:

> @bot Hello --company client-a

This isolates the session to the specified company without restarting the server.

## Tools

-   `load_company_context(company_id)`: Ingests documents from the docs folder.
-   `query_company_context(query, company_id)`: Searches the vector database.
-   `list_companies()`: Lists available companies.

## Testing

The company context feature is validated by a comprehensive test suite:

1.  **Context Isolation**: `tests/company_context_integration.test.ts` verifies that `ContextServer` maintains separate context files for each company and that `ContextManager` queries the Brain MCP with the correct company ID.
2.  **Interface Integration**: `tests/interface_integration.test.ts` verifies that Slack and Teams adapters correctly parse the `--company` flag and pass it to the agent engine.
3.  **Vector Database**: Integration tests confirm that `CompanyContextServer` ingests and queries documents from isolated `lancedb` instances for each company.

## Multi-Tenancy Guarantees

The 4-Pillar Vision (Company Context, SOP Engine, Ghost Mode, HR Loop) is built with strict multi-tenancy in mind. This ensures that agents can operate on multiple client projects simultaneously without data leakage.

### Isolation Mechanisms

-   **Memory Isolation:** The Brain MCP Server namespaces all episodic memories and semantic graphs by `company_id`. Queries for "Acme" will never return memories from "Beta".
-   **Artifact Isolation:**
    -   **Company Context:** Documents are stored in `.agent/companies/{company}/docs` and indexed in isolated vector databases.
    -   **SOP Logs:** Execution logs are stored in `.agent/companies/{company}/brain/sop_logs.json`, preventing cross-contamination of operational history.
    -   **HR Proposals:** Automated improvement proposals are stored in `.agent/companies/{company}/hr/proposals/`, ensuring that optimization suggestions are specific to the client's codebase and history.
-   **Metric Tagging:** The Health Monitor MCP Server tags all performance metrics with `{ company: "acme" }`, allowing for per-client resource usage and performance tracking.

### Validation

Multi-tenant isolation is rigorously validated via `tests/integration/multi_tenant_4pillars.test.ts`. This comprehensive integration test simulates a concurrent environment where the agent:
1.  Switches context between two companies ("Acme" and "Beta").
2.  Executes SOPs for both companies simultaneously (interleaved).
3.  Performs HR reviews for each company independently.
4.  Tracks and queries health metrics separately.

The test asserts that:
-   Brain queries return only company-specific memories.
-   SOP execution logs are written to the correct company directories.
-   HR proposals are generated only for the company with issues and stored in the correct location.
-   Health metrics can be filtered by company.
