# Complex Project Specification: AI-Powered Metrics Dashboard

## Overview
We need to build a full-stack web application that serves as a real-time metrics dashboard. This project requires expertise across three distinct domains: Frontend, Backend, and DevOps.

## Requirements by Domain

### 1. Frontend Specialists
- **Framework:** Vue 3 + Tailwind CSS.
- **Task:** Build the `DashboardView.vue` component that connects to a REST API to fetch data and renders two charts: `UptimeTrend` and `TokenUsageBar`.
- **Constraint:** Must handle API loading states and display mock data if the API is unreachable.
- **Deliverable:** UI components and corresponding unit tests.

### 2. Backend Engineers
- **Framework:** Node.js + Express.
- **Task:** Create the `/api/metrics` endpoint that aggregates data from an internal LanceDB database and returns structured JSON containing uptime trends and token usage arrays.
- **Constraint:** API must respond within 150ms.
- **Deliverable:** API router, database service integration, and backend tests.

### 3. DevOps Team
- **Tools:** Docker, GitHub Actions.
- **Task:** Create a `Dockerfile` for the combined application (serving the Vue frontend statically and running the Node API). Create a `.github/workflows/deploy.yml` for automated CI/CD.
- **Constraint:** The Docker image must be optimized (e.g., using a multi-stage build).
- **Deliverable:** Dockerfile and CI workflow yaml.

## Coordination Milestones
1. Backend must define the API schema so Frontend can start mocking.
2. Frontend must finish the UI build artifact so DevOps can include it in the Docker image.
3. Once all three are complete, the final deployment pipeline must be validated.
