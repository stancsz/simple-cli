# Company Context Spec: The Briefcase (Phase 3)

## Overview
"The Briefcase" transforms Simple-CLI from a single-tenant agent into a multi-tenant agency capable of servicing multiple clients. It introduces a `Briefcase` MCP server and core logic to manage isolated "Company Contexts"—including brand voice, internal documentation, and procedural memory.

## Architecture

### 1. Data Isolation
All company data is stored in `.agent/companies/<company-slug>/`:
- **Profile**: `profile.json` (Brand voice, preferences, metadata)
- **Memory**: `brain/` (Lancedb vector store for internal docs)
- **Tools**: `tools/` (Custom company-specific scripts)

### 2. The Briefcase MCP Server (`src/mcp_servers/briefcase/`)
Exposes tools to sub-agents to access and modify company context.
- `briefcase_get_context(query)`: RAG search + Profile Summary.
- `briefcase_add_document(title, content)`: Ingests a document into the company's vector store.
- `briefcase_update_profile(profile)`: Updates mutable fields (e.g., brand voice).
- `briefcase_list_documents()`: audits available knowledge.

### 3. Context Injection
The Orchestrator (`src/engine/orchestrator.ts`) injects company context into every interaction:
1. **System Prompt**: Appends "Company Profile: <name> \n Brand Voice: <voice>"
2. **RAG Injection**: Queries the Briefcase for relevant docs based on user input and injects them into the context window.

### 4. CLI Integration
- `simple --company client-a`: Starts the session with `client-a` context loaded.
- `switch_company(client-b)`: Tool available to the agent (and user) to hotswap contexts.

## Schema: CompanyProfile (`src/briefcase/types.ts`)
```typescript
export interface CompanyProfile {
  name: string;
  description?: string;
  brandVoice?: string; // "Professional, concise, authoritative"
  internalDocs?: string[]; // List of ingested filenames
  sops?: string[]; // Recommended workflows
  preferences?: Record<string, any>; // Arbitrary KV store
}
```

## Vector Store
We use `lancedb` for its zero-config, file-based architecture.
- **Table**: `documents`
- **Schema**: `id` (filename), `text` (content), `vector` (embedding), `metadata` (json)
- **Path**: `.agent/companies/<company>/brain`

## Future Scope
- **Automatic Ingestion**: Point the agent at a URL or GitHub repo to auto-populate the briefcase.
- **Cross-Company Learning**: (Requires strict permission) Anonymized pattern matching.
