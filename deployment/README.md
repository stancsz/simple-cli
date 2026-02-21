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

## Testing

A comprehensive integration test suite is available to validate the deployment pipeline. This test suite:
1.  Validates the Helm chart structure and values.
2.  Builds the Docker image.
3.  Creates a temporary local Kind (Kubernetes-in-Docker) cluster.
4.  Deploys the application.
5.  Verifies that all pods become ready and the application is healthy.
6.  Cleans up the test cluster.

### Running the Tests

To run the Kubernetes integration tests, ensure you have `docker`, `kind`, `helm`, and `kubectl` installed, then run:

```bash
npm test tests/integration/kubernetes_deployment.test.ts
```

**Note:** The test automatically detects if required tools are missing or if the environment doesn't support Docker-in-Docker (e.g., some CI environments), and will skip the heavy integration steps while still performing static validation.

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
