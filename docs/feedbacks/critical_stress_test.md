# Critical Stress Test Feedback: Simple CLI

## Overview
This document outlines critical feedback from a stress test of the Simple CLI, focusing on interactive usage, responsiveness, and feature parity with advanced CLIs like Claude Code and Codex CLI.

## Findings

### 1. Responsiveness & Interrupt Handling
- **Current Behavior**: The CLI handles `Esc` to abort the current generation/tool execution. `Ctrl+C` is not explicitly handled in the interactive loop, leading to an abrupt process termination via `SIGINT`.
- **Issue**: Users expect `Ctrl+C` to interrupt the *current action* (like `Esc`) and return to the prompt, not kill the entire session. This is standard CLI behavior.
- **Recommendation**: Implement a robust interrupt handler.
  - First `Ctrl+C`: Cancel current action (generation/tool).
  - Second `Ctrl+C` (at prompt): Exit the application.

### 2. Input Buffering (Type-Ahead)
- **Current Behavior**: While the LLM is generating or tools are running, user input is either lost or printed to the screen (echoed) without being captured.
- **Issue**: Advanced users often type the next command while the current one is processing. The lack of buffering breaks this flow.
- **Recommendation**: Capture stdin during the "busy" state into a buffer. When the prompt reappears, pre-fill it with the buffered input.

### 3. Token Usage & Cost Monitoring
- **Current Behavior**: The CLI provides no visibility into token usage or cost.
- **Issue**: Users need to know how many tokens a request consumed to manage costs and understand model behavior.
- **Recommendation**:
  - Extract usage data from the LLM provider response.
  - Display `Prompt Tokens`, `Completion Tokens`, and `Total Tokens` after each interaction.
  - (Optional) Estimate cost based on known model pricing.

### 4. Streaming & Perceived Latency
- **Current Behavior**: The CLI waits for the full LLM response before parsing and displaying anything.
- **Issue**: This creates a "frozen" feeling, especially for long chains-of-thought.
- **Recommendation**: Implement streaming for the `thought` component if possible, or at least show indeterminate progress more actively. (Streaming might be complex due to JSON parsing requirements).

### 5. Supervisor Latency
- **Current Behavior**: The supervisor step (`[Supervisor] Verifying work...`) runs after every tool execution.
- **Issue**: While valuable for reliability, it doubles the latency for simple tasks.
- **Recommendation**: Consider making the supervisor optional or heuristic-based (e.g., only for complex tasks or if errors occurred).

### 6. Daemon/Headless Mode
- **Current Behavior**: Works well for single commands (`--non-interactive`), but the daemon mode loop is basic.
- **Recommendation**: Ensure daemon mode logs are structured and can be monitored externally.

## Implementation Plan
1.  **Refactor `Engine` Loop**: Introduce a proper event loop that handles `stdin` raw mode consistently.
2.  **Add Token Tracking**: Update `LLM.generate` to return usage stats and `Engine` to display them.
3.  **Implement Type-Ahead**: Buffer keypresses during busy states.
4.  **Improve Interrupts**: Handle `SIGINT` gracefully.

