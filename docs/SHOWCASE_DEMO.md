# 🌟 Production Showcase: The 6-Pillar Digital Agency

Welcome to the **Interactive Digital Agency Showcase**. This dashboard demonstrates how Simple CLI operates as an autonomous software engineering workforce, orchestrating multiple pillars to deliver value for a simulated client, "Showcase Corp".

## 🖥️ Interactive Dashboard

We have replaced the static CLI output with a real-time web dashboard that visualizes the agent's thought process, pillar execution, and resource consumption.

### Features
-   **Live Log Stream**: Watch the agent execute tasks in real-time.
-   **Pillar Visualization**: Track progress across Context, SOPs, Ghost Mode, and HR Loop.
-   **Metrics Panel**: Monitor token usage, cost estimates, and task success rates.
-   **Artifacts**: View generated code and deployments.

---

## 🚀 Running the Showcase

You can launch the dashboard locally in minutes.

### Prerequisites
-   Node.js (v18+)
-   Bun (recommended for performance, or use `tsx`)
-   OpenAI API Key (or compatible LLM key)

### Quickstart

1.  **Start the Dashboard**:
    ```bash
    npm run showcase
    ```
    This will start the dashboard server on `http://localhost:3002`.

2.  **Trigger the Demo**:
    -   Open `http://localhost:3002` in your browser.
    -   Click the **"Start Live Demo"** button.
    -   The dashboard will spawn a headless agent instance and stream its logs.

3.  **Watch the Magic**:
    Observe as the agent moves through the 4 Pillars:
    1.  **Company Context**: Ingesting "Showcase Corp" brand voice and tech stack.
    2.  **SOP-as-Code**: Executing `showcase_sop.md` to scaffold a project.
    3.  **Ghost Mode**: Simulating a 24-hour work cycle (Standup, Coding).
    4.  **HR Loop**: Self-optimizing based on performance metrics.

---

## 🏗️ The 4-Pillar Architecture

This demo visualizes the following core components in action:

### 1. **Company Context (The Briefcase)**
The agent adapts its behavior based on `company_context.json`.
-   **Dashboard View**: Watch for "Loading Showcase Corp context..." logs.

### 2. **SOP-as-Code (The Operating Manual)**
The agent follows strict procedures defined in Markdown.
-   **Dashboard View**: The "SOP-as-Code" step becomes active as the agent executes `showcase_sop.md`.

### 3. **Ghost Mode (The 24/7 Employee)**
The agent works autonomously via scheduled jobs.
-   **Dashboard View**: See the "Morning Standup" task being triggered via the `JobDelegator`.

### 4. **HR Loop (Recursive Self-Improvement)**
The agent reflects on its own performance.
-   **Dashboard View**: The "HR Loop" step activates as the agent generates optimization proposals.

---

## 📂 Configuration

The dashboard wraps the existing `SimpleCli` engine. The underlying simulation logic is defined in:
-   `demos/simple-cli-showcase/run_demo.ts`: The simulation script.
-   `demos/simple-cli-showcase/docs/showcase_sop.md`: The SOP being executed.
-   `demos/simple-cli-showcase/company_context.json`: The simulated client profile.

## 🔗 Next Steps

-   **[View the Roadmap](ROADMAP.md)**: See upcoming features.
-   **[Read the Specs](specs.md)**: Deep dive into the technical architecture.
