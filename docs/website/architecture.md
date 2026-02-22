---
layout: page
title: Architecture
permalink: /architecture
---

# 🏛️ Simple CLI Architecture

Simple CLI is built on the **6-Pillar Vision**, creating a robust, autonomous, and self-optimizing digital workforce.

## 1. Framework Ingestion Engine (The Universal Adapter)
This engine is the core capability that allows Simple CLI to absorb any AI framework.

```mermaid
graph LR
    User[User / Orchestrator] -->|Standard MCP Calls| Ingestion[Ingestion Engine]
    Ingestion -->|Adapter| Jules[Jules API]
    Ingestion -->|Adapter| Aider[Aider CLI]
    Ingestion -->|Adapter| CrewAI[CrewAI SDK]
    Ingestion -->|Adapter| Other[Other Frameworks]
```

## 2. Token-Efficient Memory (The Shared Brain)
All agents share a unified `.agent/brain/` memory system, drastically reducing token costs.

*   **Episodic Memory**: Vector Database (LanceDB) stores past experiences.
*   **Semantic Memory**: Graph Database stores relationships between concepts.
*   **Benefit**: Eliminates redundant context passing (70% savings).

## 3. "Company Context" Onboarding (The Briefcase)
Each company has a dedicated context stored in `.agent/config.json` and a private vector space. This ensures strict multi-tenant isolation.

*   **Internal Docs**: Uploaded and indexed.
*   **Brand Voice**: Configurable personas.
*   **Past Decisions**: Recalled during execution.

## 4. SOP-as-Code (The Operating Manual)
Workflows are defined in Markdown files (`docs/sops/*.md`) and executed deterministically by the `sop_engine` MCP server.

*   **Format**: Standard Markdown.
*   **Execution**: Step-by-step with LLM reasoning.
*   **Resilience**: Automatic retries and error handling.

## 5. "Ghost Mode" Persistence (The 24/7 Employee)
Background agents run autonomously via CRON jobs, performing tasks while you sleep.

*   **Mechanism**: Daemon process (`simple-daemon`).
*   **Tasks**: Morning Standups, Code Reviews, Security Scans.
*   **Integration**: Seamlessly updates the Brain and Context.

## 6. Recursive Self-Optimization (The "HR Loop")
The system reflects on its performance and proposes improvements to its own source code.

*   **Analysis**: Reviews execution logs (`sop_logs.json`).
*   **Proposal**: Suggests `propose_change` via HR MCP.
*   **Approval**: Requires human verification for safety.

---

## Technical Diagram

```mermaid
classDiagram
    class User {
        +CLI
        +Slack/Teams
    }
    class Orchestrator {
        +SmartRouter
        +TaskDelegator
    }
    class Brain {
        +EpisodicMemory (Vector)
        +SemanticMemory (Graph)
    }
    class MCPServers {
        +Jules
        +Aider
        +SOP_Engine
        +HealthMonitor
    }
    class HR_Loop {
        +LogAnalyzer
        +CoreUpdater
    }

    User --> Orchestrator
    Orchestrator --> MCPServers
    MCPServers --> Brain : Read/Write
    MCPServers --> HR_Loop : Logs
    HR_Loop --> Orchestrator : Proposals
```

[View API Documentation](./api/index.html)
