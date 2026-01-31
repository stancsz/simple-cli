---
name: clawBrain
description: Manages the autonomous memory structure (init, reflect, prune).
command: node brain.cjs
parameters:
  action:
    type: string
    description: Operation to perform (init, reflect, prune)
  content:
    type: string
    description: Content for reflection or logging (optional)
---

# Claw Brain (Autonomous Memory)
[Simple-CLI AI-Created]

This skill manages the agent's persistent memory at `.simple/workdir/memory/`.

## Actions
- **init**: Ensures the directory structure exists.
- **reflect**: Writes a reflection to `/reflections/` and updates `/graph/`.
- **prune**: Consolidates old logs in `/logs/` into summaries in `/notes/`.
