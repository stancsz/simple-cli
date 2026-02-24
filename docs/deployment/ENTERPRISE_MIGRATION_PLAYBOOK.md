# Deployment Playbook: Enterprise Migration (Real-World Scenario)

**Scenario:** A large financial institution ("FinTech Global") needs to migrate a mission-critical legacy Monolith (Java 8, Spring Boot 1.5, Oracle) to a modern Microservices architecture on Kubernetes.

**Business Drivers:**
-   **Scalability:** The monolith crashes during peak transaction hours.
-   **Velocity:** Deployment cycles take 3 weeks; the goal is daily releases.
-   **Compliance:** New services must be PCI-DSS compliant by default.

**Target Architecture:**
-   **Backend:** Node.js (NestJS) / Go
-   **Infrastructure:** Kubernetes (EKS/GKE), Istio Service Mesh
-   **Database:** PostgreSQL (Cloud SQL) per service

---

## 1. Prerequisites

Before starting, ensure you have the following installed:
*   **Node.js** (v22+)
*   **Docker** & **Kubectl**
*   **Simple-CLI** (`npm install -g @stan-chen/simple-cli`)
*   **Cloud Provider CLI** (AWS/GCP/Azure)
*   **Skaffold** (for K8s development loops)

---

## 2. Company Context Initialization

Initialize the enterprise context to ensure all agents understand the strict compliance and architectural requirements.

```bash
simple init-company enterprise-client
```

**Configuration (`.agent/companies/enterprise-client/config/company_context.json`):**
Ensure the `tech_stack` reflects the target architecture and `constraints` include security policies.

```json
{
  "tech_stack": {
    "legacy": "Java 8, Spring Boot 1.5",
    "target": "Node.js, Kubernetes, PostgreSQL"
  },
  "constraints": [
    "PCI-DSS Compliance",
    "No direct DB access from frontend",
    "99.99% Availability"
  ]
}
```

---

## Phase 1: Analysis & Planning (The "Brain" Scan)

Use the SOP Engine to analyze the legacy codebase and identify bounded contexts for decomposition.

1.  **Mount the Legacy Codebase:**
    Ensure the monolith's source code is accessible to the agent (e.g., in a `legacy/` folder).

2.  **Execute Analysis SOP:**
    Run the specialized analysis SOP (available in `demos/enterprise-migration/analyze-monolith.md`).

    ```bash
    simple sop analyze-monolith
    ```

    **What happens:**
    -   **Discovery:** The agent scans the filesystem to map modules and dependencies.
    -   **Domain Analysis:** The Brain identifies bounded contexts (e.g., `PaymentService` is loosely coupled to `UserAccount`).
    -   **Roadmap Generation:** A `migration_roadmap.md` is created, proposing the first service to extract (e.g., `NotificationService`).

---

## Phase 2: Automated Service Scaffolding (The Swarm)

Once the roadmap is approved, use the **Swarm MCP** to spawn specialized agents to build the new service.

1.  **Spawn a Service Architect:**
    Ask the Swarm to scaffold the new microservice based on the analysis.

    ```bash
    simple run "Spawn a Service Architect to scaffold the 'notifications' service using NestJS and generate a Helm chart."
    ```

    **What happens:**
    -   **Swarm Orchestration:** The main agent spawns a sub-agent specialized in Node.js/Kubernetes.
    -   **Code Generation:** The sub-agent uses the **Framework Analyzer** (e.g., via `nest-cli` or template) to create the project structure.
    -   **Infrastructure-as-Code:** It generates `Dockerfile`, `k8s/deployment.yaml`, and `k8s/service.yaml`.
    -   **CI/CD:** It generates a GitHub Actions workflow for the new service.

2.  **Verify Scaffolding:**
    Check the `services/notifications/` directory.

---

## Phase 3: Incremental Strangler Fig Migration

Deploy the new service alongside the monolith using the "Strangler Fig" pattern.

1.  **Deploy to Kubernetes:**
    Use the agent to deploy the new service to the K8s cluster.

    ```bash
    simple run "Deploy the notifications service to the 'staging' namespace and verify health."
    ```

2.  **Configure Ingress Routing:**
    Update the Ingress Controller (e.g., NGINX/Istio) to route traffic for `/api/v1/notifications` to the new service, while keeping other traffic on the monolith.

3.  **Enable Ghost Mode for Migration:**
    Set up a nightly task to migrate data from the Oracle DB to the new PostgreSQL instance.

    **Add to `company_context.json`:**
    ```json
    "ghost_mode": {
      "tasks": [
        {
          "id": "data-migration-sync",
          "schedule": "0 2 * * *", // 2 AM nightly
          "prompt": "Run the data sync script for the notifications service and verify data integrity."
        }
      ]
    }
    ```

---

## Phase 4: Validation & Cutover

Ensure the new service meets quality standards before full cutover.

1.  **Visual Regression Testing (Desktop Orchestrator):**
    Use the **Skyvern Driver** to navigate the application UI and ensure the new service hasn't broken the frontend.

    ```bash
    simple run "Use Skyvern to log in to the web portal, trigger a notification, and verify it appears in the UI."
    ```

    **What happens:**
    -   The **Desktop Orchestrator** launches a browser.
    -   It navigates to the staging URL.
    -   It performs the user actions and takes screenshots.
    -   The **Visual Quality Gate** scores the screenshots to ensure no UI regressions.

2.  **HR Loop Review:**
    The HR Loop analyzes the deployment logs and performance metrics from the **Health Monitor**.

    ```bash
    simple hr --review "notifications-service-migration"
    ```

    **Outcome:** If the error rate is < 0.1%, the HR agent proposes a full traffic cutover.

---

## Phase 5: Financial Operations (Cost Tracking)

Use the **Financial Ops** server to track the cost savings of moving from Oracle to PostgreSQL.

1.  **Record Cloud Expenses:**
    ```bash
    simple run "Record a cloud expense of $500 for the new GKE cluster."
    ```

2.  **Compare Against Legacy:**
    Ask the Brain to recall past Oracle licensing costs (if stored) and compare.

---

## Conclusion

By following this playbook, you have:
1.  **Analyzed** a legacy opaque monolith using AI.
2.  **Scaffolded** a modern microservice automatically.
3.  **Migrated** functionality incrementally with zero downtime.
4.  **Validated** the result using automated browser agents.

**Next Steps:**
-   Repeat Phase 2-4 for the next bounded context (e.g., `PaymentService`).
-   Monitor the **Operational Dashboard** (`simple dashboard`) to track cost savings.
