# Token-Efficient Memory & Performance

## Overview

The Brain's Token-Efficient Memory system is designed to reduce LLM costs and latency by storing and retrieving episodic and semantic context locally. This prevents the need to feed the entire conversation history or project context into the LLM for every request.

## Architecture

The system uses a multi-tenant architecture with strict isolation between companies.

*   **Storage**: `LanceDB` (Vector Store) and JSON (Semantic Graph).
*   **Isolation**: Directory-based isolation `.agent/brain/<company_id>/`.
*   **Access Control**: Per-company locking and connector pooling.

## Performance Benchmarks

Recent benchmarks (Simulated with 1000 episodes and 100 concurrent queries) demonstrate the efficiency of the Brain.

### Results

*   **Latency**: ~20ms per query (retrieval time).
*   **Throughput**: ~48 queries/second.
*   **Token Reduction**: **97.5%**
    *   *Comparison*: Full History Context vs Retrieved Context.
    *   Instead of sending ~200k tokens of history, the Brain retrieves only the most relevant ~5k tokens.

### Scalability

The system maintains high performance even under multi-tenant load, ensuring that as your agency scales to manage more clients, the memory system remains fast and cost-effective.

## How to Verify

Run the benchmark script:
```bash
npx tsx scripts/benchmark/brain_performance.ts
```
