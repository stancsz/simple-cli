# Federation Protocol (Phase 31)

The Federation Protocol is the foundational layer for **Autonomous Multi-Agency Federation & Collective Intelligence** in Simple-CLI. It enables isolated autonomous agency instances to discover one another, communicate securely, and delegate tasks using the Model Context Protocol (MCP).

## Core Concepts

1. **Agency Profile**: Every agency maintains a profile consisting of a unique identifier, an RPC endpoint, supported protocols, and a list of capabilities.
2. **Capabilities**: A description of specific skills or domains the agency can handle (e.g., "legal_review", "code_review").
3. **Discovery**: Agencies can query the federation network (or a localized registry) for active peers that match a required capability.
4. **Delegation**: Instead of performing a task locally, an agency can use the `delegate_to_agency` tool to send a signed `TaskDelegationRequest` to a peer agency.

## Architecture

The logic is encapsulated in the **Federation MCP Server** (`src/mcp_servers/federation/`).

### Schemas

Defined in `protocol.ts` using `zod`:

- `AgencyProfile`: Tracks agency routing and metadata.
- `Capability`: Identifies a domain skill.
- `TaskDelegationRequest`: Contains the `task_id`, `task_description`, `agency_id`, etc.
- `TaskDelegationResponse`: Provides synchronous or asynchronous feedback on task acceptance/completion.

### Security Model

Inter-agency communication happens via standard HTTP/JSON-RPC protocols, augmented by:
- **API Keys**: Basic authentication against the target agency's endpoint.
- **HMAC Signatures**: Every payload includes an `X-Federation-Signature` header calculated using a shared `FEDERATION_SECRET` (or a fallback like `OPENAI_API_KEY`). This ensures requests cannot be tampered with in transit.

## Usage

Agents can access federation capabilities dynamically:

1. **Registering the Agency**:
   ```json
   {
     "profile": {
       "agency_id": "alpha_agency",
       "endpoint": "http://agency-alpha.local:3000",
       "capabilities": [{ "name": "data_analysis", "description": "Analyzing large datasets" }]
     }
   }
   ```

2. **Discovering Peers**:
   ```json
   {
     "capability_required": "data_analysis"
   }
   ```

3. **Delegating a Task**:
   ```json
   {
     "request": {
       "task_id": "task_123",
       "agency_id": "alpha_agency",
       "task_description": "Analyze Q3 sales data"
     }
   }
   ```

## Next Steps

This protocol paves the way for the remainder of Phase 31:
- **Distributed Ledger**: Tracking API tokens and compute consumed by delegated tasks.
- **Meta-Orchestrator**: High-level Swarm logic that automatically slices complex projects across multiple discovered agencies.
- **Collective Learning**: Synchronizing successful SOP TaskGraphs via Brain MCP to newly registered peers.
