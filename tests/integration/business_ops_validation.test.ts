import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from 'path';

describe('Business Operations MCP Server', () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    const serverPath = join(process.cwd(), 'src', 'mcp_servers', 'business_ops', 'index.ts');

    transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', serverPath],
    });

    client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should list available tools', async () => {
    const tools = await client.listTools();
    expect(tools.tools).toBeDefined();

    const toolNames = tools.tools.map(t => t.name);
    expect(toolNames).toContain('query_financials');
    expect(toolNames).toContain('update_project_status');
  });

  it('should query financials (mock)', async () => {
    const result: any = await client.callTool({
      name: 'query_financials',
      arguments: {
        period: 'current_month'
      }
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].text).toBeDefined();

    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('revenue');
    expect(data).toHaveProperty('expenses');
    expect(data).toHaveProperty('profit');
    expect(data.currency).toBe('USD');
  });

  it('should update project status (mock)', async () => {
    const result: any = await client.callTool({
      name: 'update_project_status',
      arguments: {
        ticket_id: 'PROJ-123',
        status: 'in_progress',
        comment: 'Starting work'
      }
    });

    expect(result.content[0].text).toContain("Updated ticket PROJ-123 to 'in_progress'");
    expect(result.content[0].text).toContain('Starting work');
  });
});
