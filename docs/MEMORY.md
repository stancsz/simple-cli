# Merlin Memory Engine (MCP)

This is a side-car context engine for the Simple CLI, designed to offload memory management to a local SQLite-VEC stack.
It acts as a Model Context Protocol (MCP) server that provides semantic search over the project's codebase.

## Features

- **Local Storage**: Uses `sqlite-vec` for high-performance vector storage and retrieval.
- **AST-Aware Indexing**: Parses TypeScript files and indexes Classes, Interfaces, and Functions as logical units.
- **Semantic Search**: Supports natural language queries to find relevant code snippets.
- **Privacy**: Supports local embeddings via Ollama (or OpenAI as fallback).
- **MOCK Mode**: Includes a deterministic mock embedder for testing without API keys.

## Setup

### Prerequisites

- Node.js >= 18
- `better-sqlite3` and `sqlite-vec` (installed automatically)

### Configuration

Set the following environment variables in your `.env` file or shell:

```bash
# Provider Selection
OPENAI_API_KEY=sk-...       # Use OpenAI (text-embedding-3-small)
# OR
OLLAMA_HOST=http://localhost:11434  # Use Ollama (nomic-embed-text)
USE_OLLAMA=true

# Embedding Model (Optional)
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# Testing
MOCK_EMBEDDINGS=true        # Set to true to use mock embeddings (no API required)
```

## Running the Server

You can run the MCP server standalone:

```bash
npx tsx src/memory/server.ts
```

It communicates over Stdio.

## Integration with Claude Code / MCP Clients

To use this memory server with an MCP-compliant client (like Claude Desktop or `claude-code`), configure it in your `mcp.json` or equivalent config.

### Example `mcp.json`

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["tsx", "src/memory/server.ts"],
      "env": {
        "OPENAI_API_KEY": "your-key-here"
      }
    }
  }
}
```

## Tools Provided

### `index_project`
Scans the current directory (or specified path), parses TypeScript files, generates embeddings, and stores them in `.agent/memory.sqlite`.

**Arguments:**
- `path` (string, optional): Root directory to index. Defaults to CWD.

### `search_project_memory`
Performs a semantic search over the indexed codebase.

**Arguments:**
- `query` (string): The search query.
- `limit` (number, optional): Number of results to return. Default 5.

## Architecture

1.  **Storage**: SQLite database at `.agent/memory.sqlite`.
    -   `chunks`: Stores code content and metadata.
    -   `vec_chunks`: Virtual table storing embeddings.
2.  **Indexing**: `ts-morph` parses source files.
3.  **Embedding**: Text is embedded using the configured provider.
4.  **Retrieval**: `sqlite-vec` performs vector similarity search.
