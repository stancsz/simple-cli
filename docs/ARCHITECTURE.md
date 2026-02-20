# System Architecture

## Overview
Simple CLI is a Meta-Orchestrator that integrates various AI frameworks as subordinate agents using the Model Context Protocol (MCP).

## Core Components

### 1. The Engine (Orchestrator)
- **Role**: The central brain that plans tasks, delegates work, and maintains state.
- **Implementation**: `src/engine/orchestrator.ts`.
- **Communication**: Speaks to tools and agents via MCP.

### 2. MCP Servers (The Workforce)
Agents and tools are wrapped as MCP Servers.
- **Context Server**: (`src/mcp_servers/context_server/`) Manages shared state (`.agent/context.json`) with thread-safe locking and Brain integration.
- **Brain Server**: (`src/mcp_servers/brain/`) Manages long-term memory (Episodic/Semantic) using Vector DB.
- **Company Context**: (`src/mcp_servers/company_context/`) Multi-tenant RAG for client-specific knowledge.
- **Framework Adapters**: `aider`, `claude`, `crewai`, etc.

### 3. Context Management (UCP)
- **Problem**: Race conditions when multiple agents update shared state.
- **Solution**: A singleton **Context MCP Server** handles all reads/writes to `.agent/context.json`.
- **Flow**:
  1. Agent requests context via `get_context`.
  2. Context Server acquires file lock (`proper-lockfile`).
  3. Server queries Brain for relevant past experiences.
  4. Server returns enriched context.
  5. Agent updates context via `update_context`.

## Data Flow
User -> Engine -> MCP Client -> Context Server -> (Lock) -> Filesystem/Brain
