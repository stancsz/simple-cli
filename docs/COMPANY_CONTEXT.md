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

### 1. Quick Start: Adding a New Company

The easiest way to onboard a new company is using the `init-company` command:

```bash
simple init-company acme-corp
```

This interactive command will:
1.  Create the directory structure in `.agent/companies/acme-corp/`.
2.  Prompt you for basic details (Brand Voice, Goals, Tech Stack).
3.  Generate a `company_context.json` file.
4.  Initialize a fresh LanceDB vector store for the company.
5.  Register the company in `.agent/config.json`.

Alternatively, you can manually create the structure:
```bash
mkdir -p .agent/companies/acme-corp/docs
```
And add documents (e.g., `brand_guidelines.md`) to this folder.

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

## Brain-Backed Memory Architecture

The Company Context system is fully integrated with the **Brain MCP Server** to provide deep, persistent memory with enterprise-grade concurrency guarantees.

### Concurrency & Data Integrity

To support high-concurrency multi-tenant environments (e.g., Kubernetes), the Brain employs a robust three-layer protection strategy:

1.  **Connection Pooling (LanceConnector)**:
    -   Implements a singleton pattern with promise-based locking to prevent race conditions during initial database connection.
    -   Ensures efficient resource usage across thousands of operations.

2.  **File-Based Locking (proper-lockfile)**:
    -   **Episodic Memory**: Cross-process file locking ensures that simultaneous writes to the LanceDB vector store from different pods or processes do not corrupt data.
    -   **Semantic Graph**: Graph updates (`addNode`, `addEdge`) are protected by file locks, forcing a reload of data from disk to guarantee freshness and prevent overwrites.
    -   **Retry Logic**: Built-in exponential backoff handles contention gracefully.

3.  **In-Process Synchronization (Async Mutex)**:
    -   Fine-grained mutexes handle thread safety within a single Node.js process, reducing the overhead of file locking for local operations.

### Validation
These guarantees are validated by `tests/integration/brain_production.test.ts`, which simulates 12+ concurrent tenants performing hundreds of parallel reads and writes with zero data loss or cross-contamination.
