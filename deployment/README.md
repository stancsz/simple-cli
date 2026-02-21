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
3.  Ensure `gp2` or `gp3` storage class exists (for PVC).
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

### Company Contexts
To deploy for a specific company context, use the `company` value:

```bash
helm install company-a deployment/chart/simple-cli --namespace company-a --set company="Company A"
```

This ensures the agent initializes with the correct company profile.

### Persistence
The chart uses PersistentVolumeClaims (PVC) for both Agent and Brain to ensure data survives pod restarts.
- **Agent**: Stores `.agent/` (logs, context.json).
- **Brain**: Stores `.agent/brain/` (LanceDB vectors).

Configure storage size in `values.yaml`:
```yaml
agent:
  persistence:
    size: 1Gi
brain:
  persistence:
    size: 10Gi
```

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

## Scaling
The Agent is deployed as a StatefulSet. While it supports `replicas > 1`, be aware that:
- **Brain**: Currently single-writer (LanceDB file lock). Multi-replica setups require careful consideration or read-only replicas.
- **Agent**: Context is shared via `.agent/`. Parallel writes to the same context file might conflict without external locking (currently handled by file locks).

For multi-tenancy, deployment per namespace is recommended over scaling replicas within a namespace.
