# Simple-CLI Evaluation & Recommendations

## Overview
**Simple-CLI** is a high-performance, terminal-native coding agent. Its standout feature is the **Just-In-Time (JIT) Agent** workflow (`--claw`), which creates specialized sub-agents for specific tasks. This architectural choice enables high autonomy and focus.

## Coding Capabilities (Live Test Results)
We performed a live test with the prompt: *"Create a Python script that calculates Fibonacci numbers (iterative and recursive) and a corresponding test file using unittest."*

*   **Result**: Success (completed in < 30s).
*   **Artifacts**:
    *   `fibonacci.py`: Correct implementation with docstrings and main guard.
    *   `test_fibonacci.py`: Comprehensive unit tests using `unittest`.
*   **Autonomy**: The agent (`--claw` mode) autonomously:
    1.  Generated the files.
    2.  Ran the tests (`run_command`).
    3.  Verified the result (`claw_brain`).
    4.  Exited upon completion.
*   **Verdict**: Excellent for "one-shot" coding tasks and scaffolding.

## Comparison with Other Agents

| Feature | Simple-CLI | Aider | Cline |
| :--- | :--- | :--- | :--- |
| **Interface** | Terminal TUI | CLI / Chat | VS Code Extension |
| **Context** | Basic (TS/JS symbols via `ts-morph`) | Advanced (Tree-sitter Repo Map) | Moderate |
| **Editing** | JSON-based (Write/Replace) | Search/Replace Blocks (Diffs) | Diff-based |
| **Autonomy** | High (JIT Agents loop) | Medium (User-driven) | High |
| **Speed** | ⚡ Very Fast | Moderate | Moderate |

*   **vs Aider**: Aider is superior for navigating large, complex, polyglot codebases due to its robust "Repository Map" and reliable git-friendly editing. Simple-CLI is faster and better suited for generating new features or working in smaller contexts.
*   **vs Gemini/Cline**: Simple-CLI's "Ghost Mode" and "Swarm Mode" offer unique background capabilities that standard chat CLIs lack.

## Improvements & Fixes Implemented

During the evaluation, we identified and fixed two critical issues:

1.  **Missing Dependency**: The local dependency `deps/TypeLLM` was missing/empty.
    *   **Fix**: Updated `package.json` to use the published `@stan-chen/typellm` package from NPM.
2.  **Tooling Bug**: The `write_files` tool's search/replace functionality only replaced the *first* occurrence of a string.
    *   **Fix**: Updated `src/tools/write_files.ts` to use `replaceAll()` for global replacement, matching the stated intent.

## Recommendations for Future Improvement

1.  **Enhanced Repo Map**:
    *   Currently, `src/repoMap.ts` only parses symbols for TypeScript/JavaScript.
    *   **Recommendation**: Integrate `web-tree-sitter` to generate symbol maps for Python, Go, Rust, etc., making it a true polyglot expert like Aider.
2.  **Robust Editing**:
    *   JSON-based search/replace is fragile if the model hallucinates whitespace.
    *   **Recommendation**: Adopt Aider's "SEARCH/REPLACE" block format or implementing fuzzy matching for the search strings.
3.  **Context Management**:
    *   The stress test failure indicated issues with large context.
    *   **Recommendation**: Implement a "sliding window" or "summary" strategy for long running tasks.
