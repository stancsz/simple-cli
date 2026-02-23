# ⚡ Simple CLI: Interactive Quick Start

This interactive wizard demonstrates the full capabilities of **Simple CLI** as a Digital Agency platform. It guides you through the lifecycle of an autonomous workforce, from company creation to framework integration and ghost mode operation.

## 🚀 Running the Wizard

Run the following command in your terminal:

```bash
simple quick-start
```

## 🎮 The Interactive Flow

The wizard will guide you through 5 key stages:

### 1. Company Context Setup
**Goal:** Define the "Client Profile" for your digital agency.
**Action:** You will be prompted to name your demo company (default: `demo-company`).
**Outcome:** The system initializes a **Company Context** (`.agent/companies/demo-company/`), including:
-   **Brand Voice**: "Innovative and agile"
-   **Tech Stack**: React, Node.js
-   **Brain**: A dedicated Vector DB for this company.

### 2. Framework Integration (Roo Code)
**Goal:** Demonstrate the **Ingest-Digest-Deploy** cycle.
**Action:** The wizard simulates integrating the "Roo Code" framework.
**What Happens:**
1.  **Ingest:** Analyzes the Roo Code API.
2.  **Digest:** Wraps it in an MCP Server.
3.  **Deploy:** Registers tools (`roo_code.execute_task`, `roo_review_code`) for immediate use.

### 3. SOP-as-Code Execution
**Goal:** Show how agents follow standard procedures.
**Scenario:** "Build a simple web app".
**Action:** The wizard executes a predefined SOP step-by-step:
-   Scaffold Project
-   Install Dependencies
-   Generate Components
-   Run Tests
**Outcome:** You see the agent "thinking" and executing tools autonomously.

### 4. Ghost Mode (Autonomous Operation)
**Goal:** Showcase 24/7 background agents.
**Action:** The wizard simulates scheduling a background task.
**Outcome:** A simulated **Morning Standup Report** is printed, showing work done while you were "asleep" (Security scans, PR reviews).

### 5. Operational Dashboard
**Goal:** Visualize agent performance.
**Action:** The wizard launches the **Health Monitor Dashboard**.
**Outcome:** A web interface opens at `http://localhost:3004` displaying real-time metrics (Latency, Tokens, Costs).

## 🧠 What's Next?

After the wizard, you are ready to use Simple CLI for real work.

1.  **Onboard a real company:** `simple onboard-company MyStartup`
2.  **Run a task:** `simple "Refactor src/utils.ts"`
3.  **Deploy to Production:** Read the [Kubernetes Guide](K8S_DEPLOYMENT.md).

[Back to Getting Started](GETTING_STARTED.md)
