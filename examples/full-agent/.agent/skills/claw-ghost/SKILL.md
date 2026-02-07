---
name: clawGhost
description: Manages background persistence and scheduling (Ghost Mode).
command: node ghost.cjs
parameters:
  action:
    type: string
    description: Operation (schedule, list, kill)
  intent:
    type: string
    description: The task to schedule (for schedule action)
  cron:
    type: string
    description: Crontab expression (for schedule action)
  id:
    type: string
    description: Ghost ID to kill (for kill action)
---

# Claw Ghost (Persistence)
[Simple-CLI AI-Created]

This skill manages background "Ghost Tasks" using the system's cron daemon (or Scheduler on Windows).

## Actions
- **schedule**: Install a new background task.
- **list**: Show active ghost tasks.
- **kill**: Remove a task by ID.
