# Simple CLI Scaling Guide

This guide outlines the performance optimizations and scaling strategies implemented in Simple CLI to support high-throughput, multi-tenant deployments.

## Performance Optimizations

### Lazy Loading of MCP Servers (Implemented in v0.2.12)

**Problem:**
Previously, the orchestrator loaded all configured MCP servers (Brain, Context, Company Context, Aider, Claude, etc.) at startup. This caused significant latency (3-5 seconds) and resource overhead, especially in multi-tenant environments where new agent instances are spawned frequently.

**Solution:**
We implemented a `MCPManager` that supports "lazy loading".
- **Static Registry:** Core servers (`brain`, `context_server`, `aider-server`, `claude-server`, `company_context`) have their tool definitions statically registered in `src/mcp_servers/index.ts`.
- **On-Demand Connection:** The `MCPManager` exposes these tools to the LLM immediately but only connects to the actual server process when a tool is first executed.
- **Connection Pooling:** Active connections are reused for subsequent calls.

**Benchmark Results:**
Testing on a standard development environment (Node v22) showed a **~747x speedup** in startup time.

| Metric | Eager Loading (Old) | Lazy Loading (New) | Improvement |
| :--- | :--- | :--- | :--- |
| **Startup Time** | ~3918 ms | ~5.24 ms | **747x Faster** |
| **Tools Available** | 20 | 20 | Identical |

**Configuration:**
Lazy loading is enabled by default for core servers. No configuration is required.
To add new servers to the lazy registry, update `src/mcp_servers/index.ts`.

## Kubernetes Scaling Strategy

For production deployments, we recommend the following scaling strategy:

1.  **Horizontal Pod Autoscaling (HPA):** Scale the Agent StatefulSet based on CPU/Memory usage.
2.  **Sidecar Pattern:** Run high-frequency MCP servers (like `health_monitor`) as sidecars to reduce network latency.
3.  **Headless Services:** Use Headless Services for stable network identity when communicating between Agent and Brain pods.
4.  **Resource Limits:**
    - Agent Pod: 1 CPU, 2Gi Memory (adjust based on LLM usage)
    - Brain Pod: 0.5 CPU, 1Gi Memory (adjust based on Vector DB size)

## Database Scaling

-   **LanceDB:** Currently runs embedded in the Brain pod. For high availability, consider mounting a shared persistent volume (PVC) with ReadWriteMany access if supported by your storage class, or migrate to a cloud-hosted vector database if vertical scaling limits are reached.
-   **Context:** Uses file-based locking (`proper-lockfile`). Ensure the underlying storage supports file locking if running multiple replicas accessing the same context files (though typically context is per-agent/pod).

## Future Optimizations

-   **Worker Threads:** Offload heavy tool execution to worker threads.
-   **Edge Caching:** Cache common context queries at the edge.
