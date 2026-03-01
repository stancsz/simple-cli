# Kubernetes Production Deployment

This guide details the production-grade Kubernetes deployment architecture for the Digital Agency (Simple-CLI).

## Architecture

The deployment is split into two primary StatefulSets to ensure persistence and scalability:

### 1. Agent StatefulSet (`deployment/chart/simple-cli/templates/deployment.yaml`)
The core orchestrator responsible for managing tasks, SOP execution, and HR loops.

*   **Containers:**
    *   `agent`: Runs the main `daemon.ts` process.
    *   `health-monitor`: Sidecar container running the Health Monitor MCP server.
*   **Volumes:**
    *   `.agent` (PVC): Stores logs, metrics, and local context. Shared between `agent` and `health-monitor`.
    *   `.agent/brain` (PVC): Mounts the Brain's storage for direct access (optional) or consistency.
*   **Networking:**
    *   Exposes port `3000` (Agent API) and `3004` (Health Monitor API).

### 2. Brain StatefulSet (`deployment/chart/simple-cli/templates/brain-deployment.yaml`)
The centralized memory system (LanceDB + Semantic Graph).

*   **Containers:**
    *   `brain`: Runs the Brain MCP server.
*   **Volumes:**
    *   `.agent/brain` (PVC): Persistent storage for Vector DB and Graph JSON.
*   **Networking:**
    *   Exposes port `3002` (Brain API/SSE).

## Multi-Region Deployment

For high availability and disaster recovery, the Helm chart supports multi-region deployments. This mode deploys separate, isolated instances (StatefulSets, Services, PVCs) per region, while maintaining a global entry point via a multi-region Ingress.

To enable multi-region deployment, define the regions in your `values.yaml`:

```yaml
multiRegion:
  enabled: true
  regions:
    - name: "us-east-1"
      nodeSelector:
        topology.kubernetes.io/region: us-east-1
      storageClass: "gp3-us-east"
    - name: "eu-west-1"
      nodeSelector:
        topology.kubernetes.io/region: eu-west-1
      storageClass: "gp3-eu-west"
```

### Failover and Geographic Routing
- **Topology Constraints:** Pods are spread across zones using `topologySpreadConstraints`.
- **Geographic Routing:** Services use `externalTrafficPolicy: Local` when applicable to route traffic efficiently. The chart includes a `ingress-multiregion.yaml` configurable with annotations (e.g., for AWS Route53/external-dns) to enable DNS-level failover.
- **Failover Simulation:** Each pod includes a custom `exec` readiness probe that checks `/etc/config/failedRegions` (populated by a ConfigMap). You can trigger a failover simulation by updating the `failedRegions` key in the ConfigMap via the `simulate_regional_outage` MCP tool.

## Multi-Tenancy

Multi-tenancy is achieved via Namespace isolation and the `company` parameter.
*   Each client/company gets its own Namespace (e.g., `client-a`).
*   Each Namespace has its own PVCs, ensuring data isolation.
*   The `company` environment variable injects the context ID.

## Validation & Testing

We include a comprehensive integration test suite to validate the K8s topology without requiring a running cluster.

### Running Validation Tests

The tests simulate the K8s environment by:
1.  Creating temporary directories to mimic PVCs.
2.  Spawning `Brain` and `HealthMonitor` processes on ports 3002/3004.
3.  Running Agent logic against these simulated services.

To run the validation suite:

```bash
npm run test tests/integration/k8s_production_validation.test.ts
```

### What is Validated?

1.  **Multi-Tenancy Isolation:** Verifies that data stored for `company-a` is not accessible by `company-b`.
2.  **Persistence:** Verifies that data survives a "Pod Restart" (process kill/start).
3.  **Sidecar Communication:** Verifies the Agent can log metrics to the shared volume and the Health Monitor sidecar can read/serve them.
4.  **4-Pillar Integration:** Validates SOP execution logging and HR Proposal creation flow in the distributed environment.

## Production Hardening

*   **Liveness/Readiness Probes:** Configured for all containers to ensure traffic is only sent to healthy pods.
*   **Resource Limits:** CPU/Memory requests and limits are defined in `values.yaml`.
*   **Persistence:** `ReadWriteMany` access mode is recommended for scaling, though `ReadWriteOnce` works for single replicas.
