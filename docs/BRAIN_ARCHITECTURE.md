# Brain Architecture

The Brain is the long-term memory system for the Jules agent, enabling it to learn from past experiences, store semantic relationships, and maintain continuity across sessions. It is designed as an Model Context Protocol (MCP) server to ensure modularity and scalability.

## Core Components

The Brain consists of three main subsystems:

1.  **Episodic Memory (LanceDB)**
2.  **Semantic Graph (JSON + Mutex)**
3.  **Procedural Memory (SOPs)**

### 1. Episodic Memory

Episodic memory stores "episodes" of agent interaction—specifically, the task request, the solution, and any artifacts created. It uses [LanceDB](https://lancedb.com/) for high-performance vector storage and retrieval.

-   **Storage**: Data is stored in `.agent/brain/episodic/`.
-   **Vector Search**: Uses embeddings (via LLM) to find semantically similar past experiences.
-   **Concurrency**: Uses `proper-lockfile` to ensure safe concurrent writes from multiple processes (e.g., CLI and Daemon running simultaneously).
-   **Multi-tenancy**: Data is partitioned by "company" (tenant). Each company gets its own table or logical partition.

### 2. Semantic Graph

The Semantic Graph stores relationships between entities (tasks, files, concepts).

-   **Storage**: JSON files stored in `.agent/brain/graph_{company}.json`.
-   **Structure**: Nodes (Entities) and Edges (Relationships).
-   **Concurrency**: Uses `async-mutex` to handle concurrent write requests within the Brain server process.
-   **Integration**: Automatically updated when `ContextManager.saveContext` is called (linking tasks to modified files).

### 3. Procedural Memory

Procedural memory provides access to Standard Operating Procedures (SOPs).

-   **Storage**: Markdown files in `.agent/sops/`.
-   **Access**: Read-only access via `brain_get_sop`.

## Concurrency & Hardening

To support "Enterprise Cognition", the Brain implements robust concurrency controls:

-   **LanceConnector**: Implements a cross-process locking mechanism using lockfiles (`.agent/brain/episodic/locks/{company}.lock`) to prevent LanceDB corruption during concurrent writes.
-   **SemanticGraph**: Uses `async-mutex` to serialize write operations (add node/edge) within the server instance. This ensures that a high volume of requests doesn't corrupt the JSON graph file.
-   **Error Handling**: All Brain tools are wrapped in `try-catch` blocks to ensure that internal failures (e.g., database lock timeout) return structured error messages to the client rather than crashing the server.

## Context Integration

The `ContextManager` serves as the bridge between the agent's short-term context and the Brain's long-term memory.

-   **Loading Context**: When `loadContext` is called, it queries the Brain for relevant past experiences based on the current task description and injects them into the context.
-   **Saving Context**: When `saveContext` is called, it:
    1.  Stores the task outcome as an episodic memory.
    2.  Updates the semantic graph to link the task to any modified artifacts (files).

## Multi-Tenancy

The Brain is fully multi-tenant capable. Almost all tools accept an optional `company` parameter.

-   **Isolation**: Data for "Company A" is stored in separate tables (LanceDB) or files (`graph_CompanyA.json`), ensuring strict data isolation.
-   **Security**: File paths are sanitized to prevent directory traversal attacks.

## API Reference (MCP Tools)

-   `brain_store`: Store an episodic memory.
-   `brain_query`: Retrieve relevant memories.
-   `brain_update_graph`: Add nodes or edges to the semantic graph.
-   `brain_query_graph`: Search the semantic graph.
-   `brain_get_sop`: Get content of an SOP.
-   `log_experience`: Log a structured experience (for delegation patterns).
-   `recall_delegation_patterns`: Analyze success rates of agents for specific task types.
