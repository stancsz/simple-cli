# Deploying the General Purpose Developer Agent

This document describes how to deploy and run the General Purpose Developer Agent using OpenClaw and DeepSeek-powered Claude Code.

## Overview

The General Purpose Developer Agent is a self-organizing autonomous engineer capable of:
- Discovering tasks on GitHub.
- Planning and executing code changes.
- Using `claude_code` (DeepSeek) for complex logic.
- Using `openclaw` for GitHub integration.

## Prerequisites

1.  **Node.js**: Ensure Node.js (v18+) is installed.
2.  **API Keys**:
    - `DEEPSEEK_API_KEY`: Required for `claude_code` to use DeepSeek.
    - `GITHUB_TOKEN`: Required for `openclaw` GitHub skill interaction.
    - `OPENAI_API_KEY`: Required for the main agent (Jules/Simple CLI).

## Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

## Configuration

Set the required environment variables. You can create a `.env` file in the root directory:

```bash
# Main LLM Provider (e.g., OpenAI)
OPENAI_API_KEY=sk-...

# DeepSeek Key for Claude Code
DEEPSEEK_API_KEY=sk-...

# GitHub Token for OpenClaw
GITHUB_TOKEN=ghp_...
```

## Running the Agent

To start the agent with the "General Developer" persona, run:

```bash
SIMPLE_CLI_SKILL=general_developer npm start
```

This command sets the active skill to `general_developer`, which loads the specific system prompt and instructions for the developer agent.

## How it Works

- **Discovery**: The agent will start by checking for tasks. You can prompt it to "check github issues" or it may do so automatically if instructed.
- **Tools**:
    - It uses `claude_code` tool which delegates to `src/mcp_servers/claude-server.ts`. This server uses `npx @anthropic-ai/claude-code` configured to talk to DeepSeek API.
    - It uses `openclaw` tool which delegates to `src/mcp_servers/openclaw`. This server uses the `openclaw` CLI (installed via npm) to perform skills like GitHub actions.

## Customization

The agent's persona is defined in `src/agents/souls/general-developer.md`. You can modify this file to change its behavior or instructions.
