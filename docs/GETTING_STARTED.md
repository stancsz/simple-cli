# 🚀 Getting Started with Simple CLI

Welcome to **Simple CLI**, the Universal AI Integration Platform. This guide will walk you through installing the tool, setting up your first "Company Context" (Digital Agency), and running your first autonomous tasks.

## ⚡ 0. First Steps (5 Minutes)

Before diving into configuration, take the **Interactive Tour** to see what Simple CLI can do.

Run the Onboarding Wizard:

```bash
simple onboard
```

This comprehensive, interactive wizard (First-Day Experience) will guide you through:
1.  **Environment Check**: Auto-detects dependencies and keys.
2.  **Company Context Setup**: Defines your Digital Agency's brand voice and goals.
3.  **Framework Integration**: Demonstrates the "Ingest-Digest-Deploy" cycle (e.g., Roo Code).
4.  **SOP Execution**: Creates and runs a real Standard Operating Procedure (`initialize_project.sop`).
5.  **Ghost Mode**: Activates the Job Delegator and schedules background tasks.
6.  **HR Loop**: Demonstrates the system's self-improvement capability.
7.  **Operational Dashboard**: Launches the real-time metrics view.

[Read the Quick Start Guide](QUICK_START.md) for more details.

---

## 📦 1. Installation

### Prerequisites
- **Node.js**: Version 18.0.0 or higher.
- **Git**: Installed and available in your PATH.
- **Docker** (Optional): Recommended for "Ghost Mode" (24/7 background agents).

### Install via NPM
Install the CLI globally to access the `simple` command from anywhere:

```bash
npm install -g @stan-chen/simple-cli
```

### Configuration
Simple CLI requires an LLM provider to function. Create a `.env` file in your project root or export the variables in your shell profile (`~/.zshrc` or `~/.bashrc`).

```bash
# Required: Primary Brain
export OPENAI_API_KEY="sk-..."

# Optional: Specialized Agents
export ANTHROPIC_API_KEY="sk-..." # For Claude
export GEMINI_API_KEY="..."       # For Google Gemini
export DEEPSEEK_API_KEY="..."     # For DeepSeek V3/R1
```

---

## 🏢 2. Setting Up Your Digital Agency

Simple CLI isn't just a chatbot; it simulates a team of digital employees. To start, you need to "Onboard" a company. This process sets up the **Company Context**, **Brain**, and **SOPs**.

Run the onboarding command:

```bash
simple onboard-company MyTechStartup
```

### What just happened? (The 6-Pillar Setup)
The onboarding command automatically executed a **Standard Operating Procedure (SOP)** that established the 6 core pillars of your digital agency:

1.  **Company Context**: Created `.agent/companies/MyTechStartup/config/company_context.json`. This file tells the agent *who* it works for (Brand Voice, Tech Stack, Goals).
2.  **The Brain**: Initialized a Vector Database in `.agent/companies/MyTechStartup/brain/` to remember past interactions and learnings.
3.  **SOPs**: Created a `sops/` directory for your operational procedures.
4.  **Ghost Mode**: Scheduled background tasks (Job Delegator, Reviewer) in `.agent/scheduler.json`.
5.  **HR Loop**: Enabled the "Daily HR Review" task to analyze logs and propose self-improvements.
6.  **Health Monitor**: Activated the system health tracking.

### Verify the Setup
Check that your company is active:

```bash
simple company status
```

You can list all available companies:

```bash
simple company list
```

---

## ⚡ 3. Running Your First Task

Now that your digital agency is set up, let's assign a task.

### Interactive Mode
Just run `simple` and describe what you need. The agent will use its **Smart Router** to pick the best tool for the job.

```bash
simple "Create a 'Hello World' Python script and write a test for it."
```

**What happens next:**
1.  **Planning**: The agent analyzes the request.
2.  **Delegation**: It might delegate the coding to a sub-agent (e.g., `coding_agent`).
3.  **Execution**: It writes `hello.py` and `test_hello.py`.
4.  **Verification**: It runs the test to ensure it passes.

### Direct Command
You can also run one-off commands without entering the interactive shell:

```bash
simple "Refactor src/utils.ts to be more readable"
```

---

## 🌟 4. The 4 Pillars in Practice

Understanding these concepts will help you get the most out of Simple CLI.

### 1. Company Context (The "Briefcase")
Every time the agent runs, it consults the **Company Context**.
- **Try it**: Edit `.agent/companies/MyTechStartup/config/company_context.json` and change the "brand_voice" to "Pirate".
- **Run**: `simple "Write a commit message for the last change"`
- **Result**: "Arrr! We shipped a bounty of bug fixes!"

### 2. SOP-as-Code (The "Operating Manual")
Don't rely on prompts; rely on procedures.
- **Create**: Write a Markdown file in `sops/deployment.md`.
- **Run**: `simple "Run the deployment SOP"`
- **Result**: The agent follows your checklist step-by-step, handling errors and retries automatically.

### 3. Ghost Mode (The "Night Shift")
Your agents work while you sleep.
- **Check**: Look at `.agent/scheduler.json`. You'll see tasks like `job-delegator` scheduled to run hourly.
- **Logs**: Check `.agent/ghost_logs/` to see what your digital employees did overnight.

### 4. HR Loop (The "Self-Correction")
The system improves itself.
- **Mechanism**: Every night, the HR agent analyzes execution logs.
- **Outcome**: If a tool failed repeatedly, it might propose a code change to fix it. Check `.agent/hr/proposals/` for pending updates.

---

## 🔌 5. Framework Integration (Ingest-Digest-Deploy)

Simple CLI can "absorb" other AI tools.

- **Ingest**: Learn a new tool's CLI (e.g., `aider`).
- **Digest**: Wrap it in an MCP Server (`src/mcp_servers/aider`).
- **Deploy**: Register it in `mcp.json`.

Now, `simple` can use `aider` as a subordinate agent!

### Power User Path
Want to build your own integration?
[**Take the Rapid Framework Integration Tutorial**](TUTORIAL_INTEGRATE_NEW_FRAMEWORK.md) to learn how to add "Roo Code" in 15 minutes.

---

## 🎭 6. Configuring Persona & Interfaces

Your digital agent can mimic human behavior (typing, working hours) across Slack, Teams, and Discord.

### Configuration
Edit `.agent/config/persona.json` (or `.agent/companies/<name>/config/persona.json`):

```json
{
  "name": "Sarah_DevOps",
  "role": "Senior DevOps Engineer",
  "voice": {
    "tone": "Professional but friendly"
  },
  "emoji_usage": true,
  "working_hours": "09:00-17:00",
  "response_latency": {
    "min": 500,
    "max": 2000
  },
  "catchphrases": {
    "greeting": ["Hey team!", "Hi all,"],
    "signoff": ["Best,", "Cheers!"]
  }
}
```

### Interface Behavior
- **Working Hours**: If you message the agent outside `working_hours`, it will reply with an "Out of Office" message and will not execute tasks.
- **Typing Indicators**: The agent simulates typing latency (`response_latency`) and displays "Typing..." indicators in Slack/Teams/Discord while thinking.
- **Styling**: Responses are automatically styled with the configured tone, emojis, and catchphrases.

---

## 📚 7. Advanced Guides

Ready for production? Check out our real-world deployment playbooks:
- **[Startup MVP Playbook](deployment/startup_mvp.md)**: From zero to k8s in a weekend.
- **[Enterprise Migration Playbook](deployment/ENTERPRISE_MIGRATION_PLAYBOOK.md)**: Modernize legacy monoliths with zero downtime.

---

## 🎥 Next Steps

- **Try the Showcase**: Run `npm run demo` to see a full 24-hour simulation in 2 minutes. [Read more](SHOWCASE_DEMO.md).
- **Deploy to Kubernetes**: Ready for production? [Read the Deployment Guide](K8S_DEPLOYMENT.md).
- **Customize**: Edit `persona.json` to change your agent's personality.

Happy Building! 🚀
