# Windsurf MCP Server

This MCP server integrates the Windsurf AI Framework (collaborative coding environment) into the Simple CLI ecosystem.

## Features

- **Session Management**: Create and join collaborative coding sessions.
- **Code Editing**: Direct code editing via Windsurf task files.
- **Feedback Loop**: Retrieve feedback from the collaborative session.
- **Brain Integration**: Automatically logs sessions and feedback to the central Brain.

## Tools

- `windsurf_create_session`: Create a new collaborative session.
- `windsurf_join_session`: Join an existing session.
- `windsurf_edit_code`: Edit code in a specific file.
- `windsurf_get_feedback`: Get feedback on code changes.

## Usage

This server is automatically discovered and used by the Simple CLI orchestrator. Ensure `windsurf` CLI is installed and available in your PATH.
