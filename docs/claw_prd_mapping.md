# Claw PRD → Code Mapping

This document maps items from `reference_sources/clawdbots/*.md` to the current implementation and notes gaps.

## 1. Vision / 80-20 Principles
- Status: Implemented (concept + code paths)
- Key files: `src/claw/jit.ts` (JIT AGENT generation), `tools/claw.ts` (adapter)

## 2. Skill Discovery & Parsing (PRD: YAML-to-JSON)
- Status: Partially implemented
- Implemented by: `tools/claw.ts`
  - Finds `SKILL.md` files (`findSkillFiles`) and parses YAML frontmatter (`parseFrontmatter`).
  - Gap: stronger JSON Schema mapping and graceful error messages for malformed YAML.

## 3. JIT Agent Layer (Instant Soul)
- Status: Implemented
- Implemented by: `src/claw/jit.ts`
  - Generates `.simple/workdir/AGENT.md`, persists memory directories, writes logs.
  - Instrumentation: detects actionable vs text-only outputs and triggers deterministic organizer fallback when non-actionable (test/demo mode).

## 4. Autonomous Memory Architecture
- Status: Foundation present, reflection/prune incomplete
- Implemented by: `src/claw/jit.ts` (creates `/memory/{notes,logs,reflections,graph}`)
  - Gap: `claw_brain` skill (reflection, pruning, consolidation) hooks exist in `src/cli.ts` but full implementation/tests required.

## 5. Execution Engine & Env Injection
- Status: Implemented
- Implemented by: `tools/claw.ts` (skill execution shim) and `src/tools/run_command.ts` (safe command runner)
  - Ensures `CLAW_WORKSPACE`, `CLAW_SKILL_PATH`, `CLAW_DATA_DIR` are injected into skill subprocess env.

## 6. Persistence & Ghost Mode (Scheduler)
- Status: Not implemented end-to-end
- Notes: CLI flags and scaffolding (`--ghost`, `--list`, `--logs`, `--kill`) exist, but cron parsing, crontab injection, Ghost management and tests are pending.

## 7. Tests / Live Demo
- Status: Demo fixed — deterministic organizer used as fallback when JIT non-actionable.
- Files: `tests/live/claw-demo.test.ts`, instrumentation logs written by `src/claw/jit.ts`.

## 8. Remaining Work (Actionable Next Steps)
1. Triage `tinypool` worker exit reported during tests (prevent false-positive runs).
2. Harden YAML→JSON mapping in `tools/claw.ts` (map parameters → JSON Schema, clear errors for malformed frontmatter).
3. Implement `claw_brain` reflection/prune routines and unit tests.
4. Implement Ghost scheduler: natural-language cron extraction, crontab injection, `--list/--logs/--kill` functionality and tests.
5. Verify real `TypeLLM` compatibility for `gpt-5-mini` and `gemini-3-flash` (replace local stub and run integration tests).

---
Generated: 2026-02-02
