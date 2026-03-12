# Phase 31: Collective Learning

## Overview

As part of Phase 31 (Autonomous Multi-Agency Federation & Collective Intelligence), the "Collective Learning" initiative enables multiple distinct agency instances (Swarms) to share successful patterns, SOPs, and strategies with one another. This allows the federated network to collectively improve its problem-solving capabilities over time without relying on a centralized brain.

## Synchronization Protocol

The synchronization protocol relies on the Brain MCP server and its underlying `EpisodicMemory` instance (LanceDB).

Agencies share knowledge by "pushing" episodic memory records to shared namespaces, which act as conceptual broadcast channels. Other agencies "pull" or query these shared namespaces to integrate the knowledge into their own local memories.

### Key Tools

The following tools have been added to the `brain` MCP server to support Collective Learning:

1. **`sync_patterns_to_agency`**
   - **Purpose:** Pushes a list of successful patterns/SOPs to a target agency or a shared namespace.
   - **Mechanism:** Inserts the patterns directly into the designated namespace (e.g., `federation_shared`) within the episodic memory. It prepends `shared_` to the memory ID to avoid collisions and retains the original ID as `related_episode_id`.

2. **`fetch_shared_patterns`**
   - **Purpose:** Retrieves patterns broadcasted to a shared namespace.
   - **Mechanism:** Uses semantic search (`episodic.recall`) against the target namespace (e.g., `federation_shared`) to find patterns relevant to a specific query or domain.

3. **`merge_shared_sops`**
   - **Purpose:** Merges fetched patterns into the local agency's episodic memory.
   - **Mechanism:** Implements a lightweight conflict resolution strategy.

## Conflict Resolution

To maintain data integrity and simplicity, the current iteration uses a lightweight **Timestamp-Based "Latest Wins"** strategy:

When `merge_shared_sops` is invoked, it writes the pattern into the local agency's namespace using the incoming pattern's exact ID. Because LanceDB in `EpisodicMemory` deletes the old record if an identical ID is provided during a `store` operation, this effectively overwrites any older, local version of the same pattern with the new, shared version.

*Note: Future iterations may involve LLM-driven synthesis of conflicting SOPs, but the exact ID overwrite serves as a robust foundation for Phase 31.*

## Integration with Federation

Collective Learning works in tandem with the Distributed Ledger (PR #660) and the Meta-Orchestrator. When a lead agency delegates a complex task to a specialized partner:
1. The partner solves the sub-task and records the resulting TaskGraph/pattern locally.
2. The partner uses `sync_patterns_to_agency` to broadcast the pattern to the `federation_shared` namespace.
3. The lead agency uses `fetch_shared_patterns` and `merge_shared_sops` to absorb the new capability.
4. The ledger tracks the usage of the partner's services, and `propose_settlement` facilitates the revenue split for the completed task.
