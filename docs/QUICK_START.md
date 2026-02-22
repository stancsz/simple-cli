# ⚡ Simple CLI: Quick Start Tutorial

This interactive tutorial demonstrates the core power of Simple CLI: **Rapid AI Framework Integration** and **Shared Memory**.

You will see how different specialized agents (Aider, CrewAI, v0.dev) can work together as a unified workforce, sharing knowledge through the **Brain**.

## 🚀 Running the Tutorial

Run the following command in your terminal:

```bash
simple quick-start
```

## 🎮 What You Will See

The tutorial guides you through three key scenarios:

### 1. The Coding Agent (Aider)
**Scenario:** A bug is introduced into a Python file (`bug.py`).
**Action:** The agent uses **Aider** (via MCP) to analyze the code, find the bug, and fix it automatically.
**Key Takeaway:** The fix is stored in the **Shared Brain**. Future agents will know "Aider fixed the discount calculation bug".

### 2. The Research Team (CrewAI)
**Scenario:** You need deep research on "AI Agent Architecture in 2025".
**Action:** The agent spins up a **CrewAI** team (Researcher + Analyst) to gather and synthesize information.
**Key Takeaway:** The research findings are stored in the Brain. If you ask for this info later, the agent recalls it instantly instead of researching again (saving tokens and time).

### 3. The UI Designer (v0.dev)
**Scenario:** You need a "Futuristic Dashboard" React component.
**Action:** The agent uses **v0.dev** to generate the UI code based on your description.
**Key Takeaway:** The design artifacts are linked in the Brain.

## 🧠 The "Shared Brain" Demo

At the end of the tutorial, you will see a **Memory Inspection**.
This shows exactly what was stored in `.agent/brain/`.

Example Output:
```
[10:45:22] Task: aider-1739023
  Query: "Fix the discount calculation bug..."
  Result: "I found the issue... Applying fix..."
  ✔ Code fixes by Aider are now known to the QA agent.
```

## 🔌 How It Works Under the Hood

1.  **Ingest:** We wrapped Aider, CrewAI, and v0.dev in **MCP Servers** (`src/mcp_servers/`).
2.  **Connect:** The `simple quick-start` command spawns these servers on demand.
3.  **Share:** All servers are configured to write to the same **Episodic Memory** (LanceDB).

## 🛠 Next Steps

Now that you've seen the potential, try:
1.  **Onboarding your own company:** `simple onboard-company MyStartup`
2.  **Running a real task:** `simple "Refactor src/utils.ts"`

[Back to Getting Started](GETTING_STARTED.md)
