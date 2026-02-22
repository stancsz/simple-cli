# Contributing to Simple CLI

Thank you for your interest in contributing to Simple CLI! We aim to build the most flexible AI integration platform, and we welcome contributions from the community.

## 🤝 How to Contribute

### 1. Reporting Bugs
If you find a bug, please create a new issue with:
*   **Description**: What went wrong?
*   **Steps to Reproduce**: How can we see the error?
*   **Environment**: OS, Node version, and framework version.
*   **Logs**: Any relevant logs from `sop_logs.json` or console output.

### 2. Suggesting Features
Have an idea? Open a "Feature Request" issue. We love discussing new frameworks to ingest!

### 3. Submitting Pull Requests (PRs)
1.  **Fork the repository** and clone it locally.
2.  **Create a branch** for your feature: `git checkout -b feature/my-new-feature`.
3.  **Install dependencies**: `npm install`.
4.  **Make your changes**.
    *   If adding a new framework, follow the **Ingest-Digest-Deploy** pattern in `src/mcp_servers/`.
    *   Ensure all new code is covered by tests.
5.  **Run tests**: `npm test`.
6.  **Verify documentation**: If you changed APIs or CLI commands, update the docs.
    *   Run `npm run build:docs` to regenerate API docs.
7.  **Commit your changes** with a descriptive message.
8.  **Push to your fork** and submit a PR.

## 🧪 Testing Requirements
We require all PRs to pass our test suite.
*   **Unit Tests**: Located in `tests/`. Run with `npm test`.
*   **Integration Tests**: Located in `tests/integration/`. These verify the full agent workflow.
*   **Linting**: Ensure code style matches by running `npm run lint`.

## 🛠️ Development Setup
1.  Copy `.env.example` to `.env` and fill in your API keys.
2.  Run `npm start` to test the CLI locally.
3.  Use `npm run dev` for watch mode.

## 📜 Code of Conduct
Please be respectful and constructive in all interactions. We are building a collaborative ecosystem.
