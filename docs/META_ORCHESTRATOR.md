# Meta-Orchestrator

The Meta-Orchestrator is a Model Context Protocol (MCP) server responsible for high-level coordination between multiple Simple-CLI agency instances. It operates over the Swarm Federation Protocol to discover available agencies and intelligently delegate tasks based on policy constraints, capabilities, and historical patterns.

## Purpose
The primary purpose of the Meta-Orchestrator is to enable a multi-agency mesh network where complex tasks are autonomously routed to the optimal external partner agency, tracked, and learned from.

## MCP Tools

### `discover_agencies`
- **Description**: Uses the Federation Protocol to find and list available partner agencies.
- **Parameters**:
  - `capability_required` (string, optional): Filter by a specific required capability.

### `delegate_cross_agency_task`
- **Description**: Takes a task description and target agency identifier, validates the request against Corporate Policy constraints, formatting the request using the Federation Protocol, and delegates the task. It records the successful coordination pattern in the Brain's Episodic Memory for collective learning.
- **Parameters**:
  - `task_id` (string): The unique task identifier.
  - `agency_id` (string): The target partner agency ID.
  - `task_description` (string): The task payload.
  - `capability_required` (string, optional): The required capability.

### `monitor_cross_agency_progress`
- **Description**: Polls the status of tasks currently delegated to external partner agencies.
- **Parameters**:
  - `task_ids` (string[]): A list of task IDs to query.

## Architecture & Integration
The Meta-Orchestrator integrates tightly with:
- **Federation Server**: Uses underlying protocols and cryptography to safely negotiate capabilities and task payloads over HTTP/RPC.
- **Policy Engine**: Prevents unauthorized delegation by validating limits like max contract value or token budgets.
- **Brain MCP**: Records patterns so the system learns from which agencies successfully fulfill certain tasks vs. those that fail.
