import { describe, it, expect, afterAll } from 'vitest';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from 'path';

describe('Framework Integration Tutorial', () => {
  let client: Client;
  let transport: StdioClientTransport;

  it('should successfully ingest and digest the mock Roo Code framework', async () => {
    // Path to the server created in the tutorial
    const serverPath = join(process.cwd(), 'demos', 'framework-integration-walkthrough', 'roo_server.ts');

    // transport spawns the process
    transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', serverPath]
    });

    client = new Client(
      {
        name: "test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);

    // Verify tools are listed
    const tools = await client.listTools();
    expect(tools.tools).toBeDefined();
    const toolNames = tools.tools.map(t => t.name);
    expect(toolNames).toContain('roo_analyze');
    expect(toolNames).toContain('roo_fix');

    // Verify 'roo_analyze' tool execution (Ingest/Digest check)
    const analysisResult = await client.callTool({
      name: 'roo_analyze',
      arguments: {
        file_path: 'test_file.ts'
      }
    });

    // The mock CLI output should be present
    const textContent = analysisResult.content[0] as { type: 'text', text: string };
    expect(textContent.text).toContain('[Roo Code] Analyzing test_file.ts');
    expect(textContent.text).toContain('Report: Found potential bug');

    // Verify 'roo_fix' tool execution
    const fixResult = await client.callTool({
      name: 'roo_fix',
      arguments: {
        file_path: 'test_file.ts'
      }
    });

    const fixContent = fixResult.content[0] as { type: 'text', text: string };
    expect(fixContent.text).toContain('[Roo Code] Fixing test_file.ts');
    expect(fixContent.text).toContain('Success: Applied fix');
  });

  afterAll(async () => {
    if (client) {
      await client.close();
    }
    // Transport might need manual closing if client doesn't kill the process?
    // StdioClientTransport usually kills the process on close/disconnect.
  });
});
