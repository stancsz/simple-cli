# Contributing to Simple CLI

Welcome to the **Simple CLI** community! We're building the universal AI integration platform, and we'd love your help. Whether you're fixing a bug, adding a new framework, or improving documentation, your contributions are valuable.

This guide will help you get started with the development environment, understand the architecture, and submit your first Pull Request.

---

## 🛠️ 1. Development Setup

### Prerequisites
- **Node.js**: Version 18.0.0 or higher.
- **Git**: Installed and available in your PATH.
- **Docker** (Optional): Recommended for running integration tests and "Ghost Mode".

### Installation
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/stan-chen/simple-cli.git
    cd simple-cli
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Set up environment variables**:
    Copy `.env.example` to `.env` (if available) or create a new one:
    ```bash
    # Required: Primary Brain
    export OPENAI_API_KEY="sk-..."
    ```

4.  **Run the CLI in development mode**:
    ```bash
    npm run dev
    ```

### verification
Run the test suite to ensure everything is working:
```bash
npm test
```

---

## 🏗️ 2. Architecture Overview

Simple CLI is built on a modular architecture designed for extensibility.

### Core Components
-   **Orchestrator (`src/cli.ts`, `src/engine.ts`)**: The central brain that parses user input and delegates tasks.
-   **MCP Servers (`src/mcp_servers/`)**: Specialized agents that wrap external tools or frameworks.
    -   `brain`: Handles long-term memory (Vector DB).
    -   `sop_engine`: Executes Markdown-based Standard Operating Procedures.
    -   `health_monitor`: Tracks system metrics.
-   **The Brain (`.agent/brain/`)**: A shared memory system for all agents, ensuring context is preserved.

### Key Concepts
-   **Ingest-Digest-Deploy**: The process of adding a new AI framework.
-   **Company Context**: Multi-tenant configuration for different "clients".
-   **Ghost Mode**: Background processes that run autonomously.

---

## 🚀 3. Pull Request Process

We follow a standard GitHub flow.

1.  **Fork the repository** and create a new branch for your feature or fix.
    -   Feature: `feature/my-new-feature`
    -   Fix: `fix/bug-description`
    -   Docs: `docs/update-readme`

2.  **Commit your changes** using descriptive messages.
    -   Follow [Conventional Commits](https://www.conventionalcommits.org/).
    -   Example: `feat(brain): add support for semantic search`

3.  **Open a Pull Request (PR)** against the `main` branch.
    -   Fill out the PR template completely.
    -   Link to any relevant issues.

4.  **Code Review**: A maintainer will review your code. Be prepared to make changes.

---

## ✅ 4. Testing Mandates

**Strict Policy:** All PRs must include meaningful, passing tests. PRs without tests will be **REJECTED**.

### Types of Tests
-   **Unit Tests**: Test individual functions or classes. Located in `tests/unit/`.
-   **Integration Tests**: Test interactions between components. Located in `tests/integration/`.
-   **E2E Tests**: Test full user scenarios.

### Running Tests
-   Run all tests: `npm test`
-   Run specific test: `npx vitest tests/path/to/test.ts`
-   Check coverage: `npm run test:coverage`

---

## 🔌 5. Framework Integration

Want to add a new AI tool (e.g., a new coding assistant)? Follow the **Ingest-Digest-Deploy** cycle.

1.  **Ingest**: Understand the tool's API or CLI.
2.  **Digest**: Create a new MCP server in `src/mcp_servers/<tool_name>/`.
    -   Implement the `call_tool` handler.
    -   Define the tool schema.
3.  **Deploy**: Register the server in `mcp.json`.

Refer to `docs/FRAMEWORK_INTEGRATION.md` for a detailed guide.

---

## 📝 6. Code Standards

-   **Language**: TypeScript.
-   **Style**: Prettier + ESLint.
    -   Run `npm run lint` to check for issues.
    -   Run `npm run format` to fix formatting.
-   **Error Handling**: Use `try/catch` blocks and return meaningful error messages. Do not swallow errors.
-   **Async/Await**: Prefer `async/await` over callbacks or raw promises.

---

## 📚 7. Documentation

Documentation is as important as code.

-   **Update Specs**: If you change behavior, update the relevant spec in `docs/specs/`.
-   **Update Roadmap**: If you complete a roadmap item, check it off in `docs/ROADMAP.md`.
-   **New Features**: Add a new guide or update `docs/GETTING_STARTED.md` if necessary.

---

## 💬 8. Community Channels

-   **GitHub Issues**: For bug reports and feature requests.
-   **Discussions**: For general questions and ideas.

---

Thank you for contributing to Simple CLI! Together, we're building the future of AI integration.
