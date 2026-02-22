# Simple-CLI Digital Agency Deployment

This directory contains the Helm chart and instructions for deploying the Simple-CLI Digital Agency to Kubernetes.

## Prerequisites

- Kubernetes cluster (EKS, GKE, AKS, or local like k3d/minikube)
- Helm 3.x installed
- `kubectl` configured

## Chart Structure

The Helm chart is located in `deployment/chart/simple-cli/`. It deploys:
- **Agent StatefulSet**: The main orchestrator with persistence for `.agent/` context.
- **Brain StatefulSet**: The LanceDB vector database for long-term memory.
- **Health Monitor Sidecar**: Runs alongside the agent for metrics.
- **Services**: Headless and ClusterIP services for internal communication.
- **Ingress**: Optional external access.
- **RBAC**: ServiceAccount and Role bindings.

## Installation

1.  **Build the Docker Image**
    ```bash
    docker build -t simple-agency:latest .
    # Push to your registry
    docker tag simple-agency:latest <your-registry>/simple-agency:latest
    docker push <your-registry>/simple-agency:latest
    ```

2.  **Configure Values**
    Edit `deployment/chart/simple-cli/values.yaml` to set your image repository and other settings.

3.  **Install Chart**
    ```bash
    helm install simple-agency deployment/chart/simple-cli --namespace agency --create-namespace
    ```

## Cloud Provider Instructions

### AWS EKS
1.  Create EKS cluster.
2.  Configure `kubectl` context.
3.  Ensure you have an EFS StorageClass or similar that supports `ReadWriteMany` if shared access is needed.
4.  Run install command.
    ```bash
    helm install agency deployment/chart/simple-cli --namespace agency --create-namespace --set image.repository=<your-ecr-repo>
    ```

### GCP GKE
1.  Create GKE cluster.
2.  Configure `kubectl`.
3.  Run install command.
    ```bash
    helm install agency deployment/chart/simple-cli --namespace agency --create-namespace --set image.repository=<your-gcr-repo>
    ```

### Azure AKS
1.  Create AKS cluster.
2.  Configure `kubectl`.
3.  Run install command.
    ```bash
    helm install agency deployment/chart/simple-cli --namespace agency --create-namespace --set image.repository=<your-acr-repo>
    ```

## Configuration

### Company Contexts (Multi-Tenancy)
To deploy for a specific company context, use the `company` value and a dedicated namespace. This ensures isolation of data and resources.

```bash
# Deploy for Company A
helm install company-a deployment/chart/simple-cli --namespace company-a --create-namespace --set company="Company A"

# Deploy for Company B
helm install company-b deployment/chart/simple-cli --namespace company-b --create-namespace --set company="Company B"
```

### Persistence
The chart uses PersistentVolumeClaims (PVC) for both Agent and Brain to ensure data survives pod restarts.
- **Agent**: Stores `.agent/` (logs, context.json).
- **Brain**: Stores `.agent/brain/` (LanceDB vectors).

Both components mount the `.agent/brain` volume, which requires `ReadWriteMany` access mode if you plan to run them on different nodes or scale replicas.

Configure storage size and class in `values.yaml`:
```yaml
agent:
  persistence:
    size: 1Gi
    storageClass: "nfs-client" # Required for ReadWriteMany
    accessMode: ReadWriteMany
brain:
  persistence:
    size: 10Gi
    storageClass: "nfs-client"
    accessMode: ReadWriteMany
```

### Sidecar Architecture
The `health_monitor` runs as a sidecar container within the Agent pod. It shares the `.agent` volume to read metrics and logs produced by the Agent.
- **Agent Container**: Writes metrics to `.agent/metrics`.
- **Health Monitor Sidecar**: Reads from `.agent/metrics` and exposes `/health` on port 3004.

### Ingress
To expose the agent externally (e.g., for dashboards), enable Ingress:
```yaml
ingress:
  enabled: true
  hosts:
    - host: agency.example.com
      paths:
        - path: /
          pathType: Prefix
```

### RBAC
RBAC is enabled by default to allow the agent to run with a dedicated ServiceAccount.
If the agent needs to access Kubernetes API (e.g. for self-management), update `rbac.yaml` with appropriate rules.

## Monitoring
The agent runs a `health_monitor` sidecar exposing metrics at `/health`.
You can configure Prometheus to scrape this endpoint.
Ensure your ServiceMonitor targets port `3004` (health monitor) or `3000` (agent).

## Validation & Hardening

For detailed instructions on validating the deployment (including multi-tenancy and persistence) and production hardening guidelines, please refer to:

[Kubernetes Deployment Guide](../docs/K8S_DEPLOYMENT.md)

We include a comprehensive integration test suite that simulates the K8s environment:
```bash
npm run test tests/integration/k8s_production_validation.test.ts
```

### Real-World Validation (Kind)

To validate the deployment on a real Kubernetes cluster (using Kind), use our validation pipeline:

```bash
# Installs Kind, builds image, deploys chart, and runs in-pod validation
npx tsx scripts/validate-k8s-deployment.ts
```

This pipeline verifies:
-   **Startup**: Pods and sidecars start correctly.
-   **Multi-Tenancy**: Company context loading works inside the cluster.
-   **Persistence**: Data survives pod restarts (PVC verification).
-   **Connectivity**: Agent can communicate with Brain and Health Monitor.
