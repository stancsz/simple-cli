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

## Validation Results (Pillar #3)

A comprehensive end-to-end validation script (`scripts/validate_company_context.ts`) was executed to prove the system's effectiveness in a multi-tenant scenario.

### Methodology
The validation script simulates two companies: `acme-corp` (Java/Waterfall) and `startup-xyz` (TypeScript/Agile).
1.  **Ingestion**: Documents with conflicting guidelines were ingested for each company.
2.  **RAG Isolation**: Queries about "backend language" were sent to each context.
3.  **Memory Isolation**: A specific memory was stored for `acme-corp` and queried against `startup-xyz`.

### Results

| Feature | Test Case | Result | Notes |
| :--- | :--- | :--- | :--- |
| **Context Ingestion** | Load unique docs for 2 companies | ✅ PASS | Docs ingested into separate LanceDBs |
| **RAG Isolation** | Query "backend language" | ✅ PASS | Acme -> Java, Startup -> TypeScript |
| **Cross-contamination** | Check if Acme context leaks to Startup | ✅ PASS | Zero leakage observed |
| **Memory Isolation** | Query Acme memory from Startup | ✅ PASS | Startup returned no results |
| **Brain Integration** | Store/Recall namespaced memories | ✅ PASS | Correctly stored in `episodic_memories_{company}` |

### Issues & Edge Cases
-   **Empty Artifacts**: `EpisodicMemory` requires at least one artifact or an explicit schema when creating a new table, otherwise type inference fails. The validation script now handles this by providing a dummy artifact.
