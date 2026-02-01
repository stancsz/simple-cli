# OpenClaw Integration Guide

The OpenClaw integration brings **Just-In-Time (JIT) Agent Generation**, **Autonomous Memory**, and **Ghost Mode** persistence to Simple-CLI, enabling dynamic agent specialization without core codebase modifications.

---

## 🚀 Quick Start

### Instant JIT Agent

```bash
# Generate a specialized agent for your task
simple --claw "Audit React security vulnerabilities"

# Or use the short flag
simple -claw "Fix TypeScript strict mode errors"
```

This will:
1. Call an LLM (OpenAI/Anthropic) to generate a specialized persona
2. Create `.simple/workdir/AGENT.md` with task-specific instructions
3. Initialize the memory structure
4. Return you to the prompt with a JIT-configured agent

### Normal Usage After JIT

```bash
# Run the agent normally after JIT setup
simple

# The agent will now follow the specialized AGENT.md rules
```

---

## 🧬 LLM Integration (JIT Agent)

### Environment Variables

```bash
# OpenAI (default)
export OPENAI_API_KEY="sk-..."
export CLAW_MODEL="gpt-5-mini"

# Or Anthropic (automatic prefixing supported)
export ANTHROPIC_API_KEY="sk-ant-..."
export CLAW_MODEL="anthropic:claude-3-5-sonnet"

# Or Google Gemini
export GOOGLE_GENERATIVE_AI_API_KEY="..."
export CLAW_MODEL="google:gemini-1.5-pro"

# Or custom Vercel AI SDK compatible proxy (e.g. LiteLLM)
export LITELLM_BASE_URL="https://your-proxy.com/v1"
export OPENAI_API_KEY="your-proxy-key"
export CLAW_MODEL="openai:custom-model-name"
```

### How It Works

When you run `simple --claw "your intent"`:

1. **LLM Persona Generation**: Calls OpenAI/Anthropic API to generate:
   - Persona description (expertise, role)
   - Task-specific strategy
   - Constraints and ethical boundaries

2. **Fallback**: If no API key is found, falls back to a template-based persona

3. **Memory Init**: Creates structured directories:
   ```
   .simple/workdir/
   ├── AGENT.md          # Generated persona
   └── memory/
       ├── notes/        # Session notes
       ├── logs/         # Execution logs
       ├── reflections/  # Agent reflections
       └── graph/        # Knowledge graph
   ```

### Example Output

```markdown
# AGENT.md

## Persona Description

Agent Name: Sentinel

Sentinel is a highly advanced AI agent, particularly designed to conduct 
security audits. This AI agent is an expert in identifying vulnerabilities...

## Strategy

1. **Initial Assessment:** Understand system architecture...
2. **Penetration Testing:** Simulate attacks to identify vulnerabilities...
3. **Network Scanning:** Scan for open ports and services...

## Constraints

1. **No Unauthorized Testing:** Only audit with explicit permission
2. **Data Integrity:** Never corrupt system data during testing
3. **Confidentiality:** Keep findings strictly confidential
```

---

## 🧠 Autonomous Memory (Brain Skill)

The `clawBrain` skill manages a structured memory system for long-running agents.

### Commands

```bash
# Initialize memory structure
npx tsx tools/claw.ts run clawBrain action=init

# Save a reflection
npx tsx tools/claw.ts run clawBrain action=reflect content="Completed security scan"

# Prune old logs (keeps last 50, archives the rest)
npx tsx tools/claw.ts run clawBrain action=prune
```

### Memory Pruning

When memory grows beyond **50 log files**, pruning will:

1. **Consolidate**: Read old logs and create summaries
2. **Archive**: Save summaries to `memory/notes/archive-*.md`
3. **Delete**: Remove old individual log files
4. **Prune Reflections**: Keep only the last 20 reflections

**Trigger**: Automatic when logs > 50, or manual via `action=prune`

---

## 👻 Ghost Mode (Persistence)

Ghost Mode enables **background task scheduling** using the OS scheduler.

### Schedule a Recurrent Task

```bash
# Schedule a task to run every hour
npx tsx tools/claw.ts run clawGhost \
  action=schedule \
  intent="Check CI/CD pipeline status" \
  cron="0 * * * *"
```

**Cron Format**: `minute hour day month weekday`
- `* * * * *` = every minute
- `0 * * * *` = every hour
- `0 9 * * 1` = every Monday at 9am

### Platform Support

#### Windows (Task Scheduler)

```powershell
# Behind the scenes, creates:
schtasks /CREATE /TN "SimpleCLI_ghost-xyz" /TR "simple -claw 'intent'" /SC HOURLY /ST 09:00 /F
```

#### Unix (crontab)

```bash
# Behind the scenes, adds to crontab:
0 * * * * simple -claw "Check pipeline status" # SimpleCLI_ghost-xyz
```

### List Ghost Tasks

```bash
npx tsx tools/claw.ts run clawGhost action=list
```

### Kill Ghost Tasks

```bash
# Kill specific task
npx tsx tools/claw.ts run clawGhost action=kill id=ghost-xyz

# Kill all ghost tasks
npx tsx tools/claw.ts run clawGhost action=kill id=all
```

This will:
- Remove the task from Windows Task Scheduler / crontab
- Update the local ghost database

---

## 🛠️ Advanced Usage

### Programmatic Skill Execution

```typescript
import { tool } from './tools/claw.ts';

// Discover skills
const skills = await tool.execute({ action: 'list', skillName: undefined });

// Inspect a skill
const def = await tool.execute({ action: 'inspect', skillName: 'clawJit' });

// Run a skill
const output = await tool.execute({
  action: 'run',
  skillName: 'clawJit',
  args: { intent: 'My custom task' }
});
```

### Environment Variables for Skills

When skills execute, they receive:

```bash
CLAW_SKILL_PATH=/path/to/skill/SKILL.md
CLAW_PROJECT_ROOT=/path/to/project
INPUT_INTENT=value-of-intent-arg
INPUT_ACTION=value-of-action-arg
# ... any other args prefixed with INPUT_
```

---

## 📊 Success Metrics

All 4 milestones verified with passing E2E tests:

| Feature | Status | Test Coverage |
|---------|--------|---------------|
| **Discovery** | ✅ | Finds 60+ skills (local + global) |
| **JIT Generation** | ✅ | Real LLM persona synthesis |
| **Memory Pruning** | ✅ | Log consolidation & archiving |
| **Ghost Persistence** | ✅ | OS scheduler integration |

---

## 🔧 Troubleshooting

### "No API key found" Warning

**Solution**: Set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in your environment.

```bash
export OPENAI_API_KEY="sk-..."
```

Or add to `.env` file:

```env
OPENAI_API_KEY=sk-...
CLAW_MODEL=gpt-5-mini
```

### Ghost Task Not Executing

**Windows**: Check Task Scheduler
```powershell
schtasks /QUERY /TN "SimpleCLI_*"
```

**Unix**: Check crontab
```bash
crontab -l | grep SimpleCLI
```

### Memory Not Pruning

Verify the `prune` action runs:

```bash
npx tsx tools/claw.ts run clawBrain action=prune
```

Check for `.simple/workdir/memory/notes/archive-*.md` files.

---

## 🏗️ Architecture

```
simple-cli/
├── tools/claw.ts                    # Adapter (discovery, translation, execution)
├── skills/
│   ├── claw-jit/
│   │   ├── SKILL.md                 # JIT manifest
│   │   └── jit-generator.cjs        # LLM integration
│   ├── claw-brain/
│   │   ├── SKILL.md                 # Brain manifest
│   │   └── brain.cjs                # Memory management
│   └── claw-ghost/
│       ├── SKILL.md                 # Ghost manifest
│       └── ghost.cjs                # OS scheduler integration
└── tests/e2e/claw-test.ts           # Integration tests
```

**No core modifications**: All functionality is additive via the tool/skill system.

---

## 📝 License & Attribution

All OpenClaw integration code is marked with `[Simple-CLI AI-Created]` and follows the Simple-CLI license.

Built following the **Adapter Pattern** for zero-core-disruption integration.
