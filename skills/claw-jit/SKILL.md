---
name: clawJit
description: Dynamically generates a specialized AGENT.md based on high-level user intent (The "Instant Soul").
command: node jit-generator.js
parameters:
  intent:
    type: string
    description: The high-level goal or persona required (e.g., "Audit security", "Fix React bugs").
---

# Claw JIT Agent Generator
[Simple-CLI AI-Created]

This skill implements the "JIT Agent Layer" of the OpenClaw integration. It:
1.  Analyzes the user's `intent`.
2.  Uses an LLM to generate a specialized `AGENT.md`.
3.  Writes this file to `.simple/workdir/AGENT.md`.
4.  Optionally initializes the memory structure if missing.

## Strategy
Use this skill at the *start* of a complex session when the generic agent persona is insufficient. It is the "bootloader" for a specialized agent session.
