# SWE-agent MCP Server

A Model Context Protocol (MCP) server for SWE-agent, an AI-powered tool for automated software engineering that fixes GitHub issues.

## Overview

This MCP server provides programmatic access to SWE-agent, allowing AI assistants to run automated code fixes on GitHub issues using various AI models.

## Installation

### Prerequisites

1. **SWE-agent installation**:
   ```bash
   # Install SWE-agent first
   pip install swe-agent
   # Or follow instructions at: https://github.com/princeton-nlp/SWE-agent
   ```

2. **Configure MCP server**:
   Add this server to your MCP client configuration (e.g., Claude Desktop's `claude_desktop_config.json`):
   ```json
   "mcpServers": {
     "swe-agent": {
       "command": "node",
       "args": ["/path/to/this/directory/index.js"],
       "env": {
         "NODE_OPTIONS": "--no-warnings"
       }
     }
   }
   ```

## Building the Server

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run the server directly (for testing)
npm start
```

## Available Tools

### `run_swe_agent`

Run the SWE-agent to fix a specified GitHub issue using AI, with options for model, repository, and configuration.

**Arguments:**
- `model_name` (optional): Name of the AI model to use (e.g., "gpt4", "claude-3-opus")
- `issue_url` (optional): URL of the GitHub issue to fix
- `repo_path` (optional): Path to the local repository
- `config_file` (optional): Path to the configuration YAML file

**Usage Notes:**
- At least one of `issue_url` or `repo_path` must be provided
- The tool follows SWE-agent's standard usage patterns
- Output includes both stdout and stderr from the SWE-agent process

## Usage Examples

### Fix a GitHub Issue
```javascript
// Example tool call
{
  "name": "run_swe_agent",
  "arguments": {
    "issue_url": "https://github.com/owner/repo/issues/1",
    "model_name": "gpt4"
  }
}
```

### Analyze Local Repository
```javascript
{
  "name": "run_swe_agent",
  "arguments": {
    "repo_path": "/path/to/repo",
    "config_file": "swe_config.yaml"
  }
}
```

## Error Handling

The server provides detailed error messages including:
- Missing required arguments
- SWE-agent process execution errors
- Standard error output from the SWE-agent tool

## Security Considerations

⚠️ **Important**: SWE-agent can make changes to your codebase. Ensure you:
- Use the tool in a controlled environment
- Review changes before committing
- Test thoroughly after automated fixes
- Consider running in a sandboxed environment for production repositories

## Troubleshooting

1. **"Command not found: swe-agent"**: Ensure SWE-agent is installed and in your PATH
2. **Permission errors**: Check repository permissions and SWE-agent configuration
3. **Model access errors**: Verify your AI model API keys and access

## License

This MCP server is provided as-is. See SWE-agent's own licensing for the underlying tool.