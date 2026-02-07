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
| **Context** | Advanced (Polyglot Regex/TS) | Advanced (Tree-sitter Repo Map) | Moderate |
| **Editing** | Hybrid (JSON + Git Merge Diffs) | Search/Replace Blocks (Diffs) | Diff-based |
| **Autonomy** | High (JIT Agents loop) | Medium (User-driven) | High |
| **Speed** | ⚡ Very Fast | Moderate | Moderate |

*   **vs Aider**: Aider is superior for navigating large, complex, polyglot codebases due to its robust "Repository Map" and reliable git-friendly editing. Simple-CLI is faster and better suited for generating new features or working in smaller contexts.
*   **vs Gemini/Cline**: Simple-CLI's "Ghost Mode" and "Swarm Mode" offer unique background capabilities that standard chat CLIs lack.

## Improvements & Fixes Implemented

During the evaluation, we identified and fixed several critical issues:

1.  **Missing Dependency**: The local dependency `deps/TypeLLM` was missing/empty.
    *   **Fix**: Updated `package.json` to use the published `@stan-chen/typellm` package from NPM.
2.  **Tooling Bug**: The `write_files` tool's search/replace functionality only replaced the *first* occurrence of a string.
    *   **Fix**: Updated `src/tools/write_files.ts` to use `replaceAll()` for global replacement, matching the stated intent.
3.  **Enhanced Repo Map (Polyglot)**:
    *   Refactored `src/repoMap.ts` to support generic `LanguageParser`.
    *   Implemented `RegexParser` for Python, Go, and Rust, enabling symbol-aware context for these languages.
4.  **Robust Editing (Git Merge Diffs)**:
    *   Updated `src/tools/write_files.ts` to accept Git Merge Diff blocks (`<<<<<<< SEARCH` ... `>>>>>>> REPLACE`).
    *   This provides a robust, whitespace-aware editing mechanism comparable to Aider.

## Recommendations for Future Improvement

1.  **Context Management**:
    *   The stress test failure indicated issues with large context.
    *   **Recommendation**: Implement a "sliding window" or "summary" strategy for long running tasks.
