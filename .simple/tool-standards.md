# 🛠️ Tool Creation Standards

To ensure your self-created tools are reliable and discoverable, adhere to these standards:

## 1. Interface Design
- **Communication**: Always use JSON over **stdin** for inputs and **stdout** for outputs.
- **Environment**: Use the `TOOL_INPUT` environment variable as a secondary input method.
- **Statelessness**: Tools should be as deterministic and side-effect-free as possible (unless they are explicitly state-modifying tools like `writeFiles`).

## 2. Documentation & Attribution
- **Marker**: The first line of BOTH the script and the MD file MUST be `[Simple-CLI AI-Created]`.
- **Naming**: Use camelCase for the `# toolName` (e.g., `calculateProjections`).
- **Description**: Focus on the **Strategy**—explain NOT just what the tool does, but **when** the agent should choose it over other tools.

## 3. Language Selection
- **Python**: Preferred for data processing, scraping, and logic-heavy tasks.
- **Bash/SH**: Preferred for simple file system orchestration and system-level tasks.
- **TypeScript**: Preferred for tools that require integration with the core's native libraries.
