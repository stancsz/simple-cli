# Simple-CLI Digital Agency Deployment

This directory contains the Helm chart and instructions for deploying the Simple-CLI Digital Agency to Kubernetes.

## Prerequisites

- Kubernetes cluster (EKS, GKE, AKS, or local like k3d/minikube)
- Helm 3.x installed
- `kubectl` configured

## Deployment Steps

1.  **Build the Docker Image**
    ```bash
    docker build -t simple-agency:latest .
    # Push to your registry
    docker tag simple-agency:latest <your-registry>/simple-agency:latest
    docker push <your-registry>/simple-agency:latest
    ```

2.  **Configure Values**
    Edit `deployment/chart/values.yaml` to set your image repository and other settings.

3.  **Install Chart**
    ```bash
    helm install simple-agency deployment/chart --namespace agency --create-namespace
    ```

## Cloud Provider Instructions

### AWS EKS
1.  Create EKS cluster.
2.  Configure `kubectl` context.
3.  Ensure `gp2` or `gp3` storage class exists (for PVC).
4.  Run install command.

### GCP GKE
1.  Create GKE cluster.
2.  Configure `kubectl`.
3.  Run install command.

### Azure AKS
1.  Create AKS cluster.
2.  Configure `kubectl`.
3.  Run install command.

## Multi-Tenancy

To deploy for multiple companies, use separate namespaces or release names:

```bash
helm install company-a deployment/chart --namespace company-a --set company="Company A"
helm install company-b deployment/chart --namespace company-b --set company="Company B"
```

## Testing & Validation

The deployment includes an automated end-to-end validation suite that verifies the 4-Pillar System (Context, SOP, Ghost Mode, HR) in a live Kubernetes environment.

To run the tests locally (requires `minikube` or `kind`):

```bash
./scripts/test-k8s-deployment.sh
```

See [VALIDATION.md](./VALIDATION.md) for detailed validation procedures and metrics.
