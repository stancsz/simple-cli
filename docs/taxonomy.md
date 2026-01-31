---
layout: page
title: The Taxonomy of Action
---

# The Taxonomy of Action

In Simple-CLI, capabilities are organized into a clear hierarchy, evolving from simple system primitives to high-level, context-aware expertise.

### Comparison Summary

| Category | Typical Format | Primary Goal | Source & Discovery |
| :--- | :--- | :--- | :--- |
| **Tools** | TypeScript (`src/tools`) | OS & Filesystem Primitives | Built-in / Hardcoded |
| **Scripts** | Executables (`.py`, `.sh`, etc) | Automated Task Execution | User Environment / `scripts/` |
| **Skills** | Bundle (`.md` + Script) | Contextual Domain Expertise | Dynamic / `skills/` |

---

## Tools: The Atomic Foundation

Tools are the fundamental "fingers" of the agent. They handle low-level interaction with the operating system and codebase.

*   **Role**: Providing basic senses and motor functions (e.g., reading files, running shell commands).
*   **Implementation**: Native TypeScript functions defined in the core repository.
*   **Logic**: Procedural and deterministic. They do exactly one thing reliably without needing high-level reasoning.
*   **Analogy**: The muscles and nerves of the agent.

## Scripts: The Task Automators

Scripts represent existing automation that the agent can leverage to perform specific, repetitive units of work.

*   **Role**: Bridging the gap between AI reasoning and legacy project workflows.
*   **Implementation**: Standalone executables in any language (Python, Bash, Node) located in the `/scripts` or `/bin` folders.
*   **Key Trait**: They are generally project-specific but environment-agnostic. They excel at "batch" operations like data cleaning or deployment.
*   **Analogy**: A power tool that the agent picks up from a workbench.

## Skills: Packaged Intelligence

Skills are the most advanced form of capability. They represent the agent's ability to "load" expertise on demand.

*   **Role**: Enabling high-level, specialized workflows (e.g., "Architecture Review" or "Financial Modeling").
*   **Implementation**: A managed bundle containing a specification file (`.md` or `.txt`) and an executable script or JS module.
*   **Key Trait**: **Context Awareness**. Unlike a script, a skill includes documentation that explains not just the *interface*, but the **strategy**—when it is appropriate to use and why.
*   **Discovery**: The agent "indexes" these into its mental map during initialization or via `reloadTools`.
*   **Analogy**: Expertise. If a script is knowing how to use a hammer, a skill is knowing how to frame a building.

## Binary Executables

Compiled binaries (e.g., `.exe` on Windows or ELF files on Linux) follow the same discovery rules as scripts but require an external documentation file because the agent cannot read code comments from a binary.

*   **Location**: Store binaries in `skills/` if they provide specialized domain logic, or `scripts/` if they are general-purpose automation tools.
*   **Documentation**: Always pair a binary with a matching `{name}.md` file to explain its command and parameters.

## Folder-Based Organization

If a skill or script requires multiple files (e.g., a script with several helper modules), you can organize them into a "working folder" within `skills/` or `scripts/`. Simple-CLI will automatically discover the tool if:

1.  **Direct Documentation**: A `{name}.md` file exists inside the folder.
2.  **Coupled Documentation**: A `{name}.md` file exists in the parent directory with the same name as the folder.
3.  **Recursive Search**: The registry will recursively scan subdirectories to find valid tool definitions.

---

## Why these distinctions matter

Simple-CLI is designed to be **Universal**. By supporting all three categories, it achieves:
1.  **Core Stability**: Critical system tools remain protected in the core.
2.  **Environment Integration**: The agent can wrap and use your existing project automation scripts.
3.  **Self-Evolution**: Skills empower the agent to build, document, and learn its own specialized capabilities during a session.

### Note on Attribution
To ensure transparency, all **AI-created** tools (those evolved by the agent during a session) are required to include a signature line: `[Simple-CLI AI-Created]`. This allows users to easily distinguish between the "Built-in" core and the "Evolved" capabilities of the agent.
