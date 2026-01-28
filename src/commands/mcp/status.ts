import { Command } from '@oclif/core';
import * as ui from '../../lib/ui.js';
import { getMCPManager, MCPServerStatus } from '../../mcp/manager.js';

export default class MCPStatus extends Command {
  static description = 'Show MCP server status';

  static examples = ['<%= config.bin %> mcp status'];

  async run(): Promise<void> {
    const manager = getMCPManager();
    const statuses = manager.getAllServerStatuses();

    if (statuses.size === 0) {
      ui.log('No MCP servers configured');
      ui.note('Create a mcp.json file to configure MCP servers', 'Hint');
      return;
    }

    ui.log('MCP Servers:\n');

    const statusIcon = {
      [MCPServerStatus.CONNECTED]: ui.theme.success('●'),
      [MCPServerStatus.CONNECTING]: ui.theme.warning('○'),
      [MCPServerStatus.DISCONNECTED]: ui.theme.muted('○'),
      [MCPServerStatus.ERROR]: ui.theme.error('●'),
    };

    for (const [name, status] of statuses) {
      ui.log(`  ${statusIcon[status]} ${name}: ${status}`);
    }

    // Show tool count
    const tools = manager.getAllTools();
    const resources = manager.getAllResources();
    const prompts = manager.getAllPrompts();

    ui.log(`\nDiscovered: ${tools.length} tools, ${resources.length} resources, ${prompts.length} prompts`);
  }
}
