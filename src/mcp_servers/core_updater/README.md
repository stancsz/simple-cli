# Core Updater MCP Server

A secure server for proposing and applying changes to core `src/` files.

## Features

- **Read Core Files**: Safely read files within the `src/` directory.
- **Propose Updates**: Create proposals for core changes, stored in `.agent/pending_updates/`.
- **Apply Updates**: Apply pending updates with safety checks:
    - Requires explicit approval (token) for critical files (`src/builtins.ts`, `src/engine.ts`).
    - Respects `yoloMode` configuration for low-risk changes.
    - Creates backups before modifying files.
    - Integrates with Brain MCP for historical context.

## Tools

### `read_core_file`
Reads a file from the `src/` directory.
- `filepath`: Relative path to the file (must start with `src/`).

### `propose_core_update`
Proposes a change to core files.
- `title`: Short title.
- `description`: Detailed description.
- `changes`: Array of `{ filepath, newContent, diff? }`.

### `apply_core_update`
Applies a pending update.
- `update_id`: ID of the proposal.
- `approval_token`: Token required for high-risk changes or if `yoloMode` is disabled.
