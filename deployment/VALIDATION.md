# Validation Process

This document describes the validation process for the Simple-CLI Digital Agency production deployment.

## Goal
Verify that the 4-Pillar System (Company Context, SOP Engine, Ghost Mode, HR Loop) operates correctly in a multi-tenant Kubernetes environment.

## Validation Pipeline

The validation is automated via `scripts/test-k8s-deployment.sh`, which runs in the GitHub Actions workflow `kubernetes-e2e.yml`.

### Steps:
1.  **Build**: Docker image is built from the source.
2.  **Deploy**: Helm chart is installed into a Minikube/Kind cluster.
3.  **Wait**: Pipeline waits for Agent and Brain pods to be ready.
4.  **External Validation**:
    *   Test runner connects to exposed services (Brain: 3002, Health: 3004).
    *   Verifies **Multi-Tenancy** by storing and recalling isolated memories in Brain (LanceDB).
    *   Verifies **Health Monitoring** by querying metrics.
    *   Verifies **Persistence** by checking memory retention across operations (and optionally pod restarts).
5.  **Internal Validation (Showcase Job)**:
    *   A Kubernetes Job (`showcase-job`) runs `demos/simple-cli-showcase/run_demo.ts` inside the cluster.
    *   This script executes a full simulation:
        *   Loads Company Context (from file).
        *   Executes an SOP ("Onboarding").
        *   Triggers "Ghost Mode" tasks (Standup).
        *   Triggers "HR Loop" (Review).
    *   Success confirms the application logic runs correctly within the containerized environment.

## Manual Verification

To run validation locally:

1.  Ensure you have `minikube` or `kind` running.
2.  Run the script:
    ```bash
    ./scripts/test-k8s-deployment.sh
    ```
3.  Check output logs for `✅ SUCCESS: Kubernetes E2E Test Passed!`.

## Artifacts
*   **Logs**: Job logs are printed to stdout and captured in CI.
*   **Metrics**: Health metrics can be queried from `http://localhost:3004/sse` (via port-forward).
