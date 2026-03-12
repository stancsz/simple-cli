# Phase 31: Multi-Agency Federation

This phase focuses on enabling multiple Simple-CLI agency instances to collaborate, share resources, and form a collective intelligence network.

## Swarm Federation Protocol
The cross-agency capability discovery and task delegation RPC using MCP, implemented in the `federation` MCP server.

## Distributed Ledger
The Distributed Ledger is a lightweight mechanism for tracking inter-agency contributions, resource usage (e.g., LLM tokens, compute minutes), and revenue sharing.

### Schema
The `ledger_entries` table in the Episodic Memory (LanceDB) stores transactions:
- `id` (string): Unique identifier for the transaction (idempotency key).
- `timestamp` (number): Unix timestamp.
- `from_agency` (string): Agency providing the resource.
- `to_agency` (string): Agency receiving the resource.
- `resource_type` (string): Type of resource (e.g., `llm_tokens`, `revenue`, `compute_minutes`).
- `quantity` (number): Amount of the resource.
- `value` (number): Equivalent value in USD.
- `status` (string): Either `pending` or `settled`.

### API (MCP Tools)
Exposed via the `distributed_ledger` MCP server:
- `record_contribution`: Records a contribution or resource usage between agencies. Integrates with the Corporate Strategy (Policy Engine) to automatically apply revenue-sharing splits (e.g., 70/30) when processing transactions.
- `get_agency_balance`: Queries the ledger to get the current balance and net value of an agency's contributions.
- `propose_settlement`: Proposes a settlement between two agencies to reconcile outstanding balances.

### Idempotency
Transactions are checked against existing entries by `id` to prevent duplicate recording during network retries or federation syncing.
