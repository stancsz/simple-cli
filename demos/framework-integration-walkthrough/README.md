# Framework Integration Walkthrough: Roo Code

This directory contains the artifacts for the "Integrate a New Framework" tutorial.

## Files

- `mock-roo-cli.ts`: A mock CLI tool that simulates the behavior of "Roo Code" (a hypothetical AI coding assistant).
- `roo_server.ts`: The reference implementation of an MCP server that wraps the mock CLI.

## Usage

You can run the mock CLI directly to see what it does:

```bash
npx tsx demos/framework-integration-walkthrough/mock-roo-cli.ts analyze test.ts
```

You can run the MCP server (it expects JSON-RPC over stdio):

```bash
npx tsx demos/framework-integration-walkthrough/roo_server.ts
```
