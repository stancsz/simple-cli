# Roo Code Integration: Ingest Phase Analysis

## 1. Overview
Roo Code is a trending autonomous AI coding assistant (formerly Roo Cline) that excels at complex code analysis and automated refactoring. While primarily a VS Code extension, for the purpose of this integration, we are interfacing with its (simulated) CLI capabilities to enable headless operation within our agent swarm.

## 2. Architecture Analysis

### Core Components
- **Roo Brain**: The central reasoning engine (LLM-backed) that understands code context.
- **CLI Interface**: A command-line wrapper that exposes the Brain's capabilities.
- **Memory Bank**: A persistent context storage mechanism (simulated via file-based session logs).

### Integration Points
We will integrate Roo Code via its CLI interface, wrapping it in an MCP (Model Context Protocol) server. This allows our central "Simple CLI" orchestrator to delegate specific tasks to Roo Code without needing to know the implementation details.

## 3. Simulated CLI Specification
To create a high-impact demonstration, we will simulate a robust CLI with the following commands:

### `analyze`
Performs a deep static and semantic analysis of a file.
- **Command**: `roo analyze <file_path> --format json`
- **Output**: JSON object containing `issues` (array of bugs/smells), `complexity_score`, and `suggested_fixes`.

### `fix`
Applies automated fixes to a file based on previous analysis or heuristic rules.
- **Command**: `roo fix <file_path> --strategy aggressive|conservative`
- **Output**: JSON object with `status`, `changes_applied` (diff or description).

### `docs`
Generates comprehensive Markdown documentation for a module.
- **Command**: `roo docs <file_path> --output <output_path>`
- **Output**: JSON object with `status` and `path`.

## 4. MCP Server Design

### Tools
1.  **`roo_review_code`**: Wraps `analyze`.
    - Input: `file_path`
    - Output: Formatted analysis report.
2.  **`roo_fix_code`**: Wraps `fix`.
    - Input: `file_path`, `strategy` (optional)
    - Output: Result of the fix operation.
3.  **`roo_generate_docs`**: Wraps `docs`.
    - Input: `file_path`
    - Output: The generated documentation content.

### Session Management
The MCP server will maintain a session ID for the CLI to simulate "memory" across multiple calls (e.g., remembering the analysis when asked to fix).

## 5. Security & Constraints
- **Sandboxing**: The CLI runs in a restricted environment.
- **File Access**: Limited to the project root.
