import { Tool, loadAllTools } from '../registry.js';
import { z } from 'zod';

export const name = 'get_skill_map';
export const description = 'Export the complete set of available tools and skills in a standardized OpenClaw manifest format.';
export const permission = 'read';

export const inputSchema = z.object({
    format: z.enum(['json', 'markdown']).default('json').describe('The format to export the skill map in')
});

export const execute = async (args: Record<string, unknown>, context?: any): Promise<any> => {
    let tools: Map<string, Tool>;
    if (context && context.getTools) {
        tools = context.getTools();
    } else {
        tools = await loadAllTools();
    }
    const manifest: any = {
        version: "1.0.0",
        agent: "simple-cli",
        skills: []
    };

    for (const tool of tools.values()) {
        manifest.skills.push({
            name: tool.name,
            description: tool.description,
            parameters: (tool.inputSchema as any)?._def?.shape ? Object.keys((tool.inputSchema as any)._def.shape) : [],
            source: tool.source || 'builtin'
        });
    }

    if (args.format === 'markdown') {
        let md = `# Simple-CLI Skill Map\n\n`;
        for (const skill of manifest.skills) {
            md += `### ${skill.name} (${skill.source})\n${skill.description}\n\n`;
        }
        return md;
    }

    return manifest;
};

export const tool: Tool = {
    name,
    description,
    permission,
    inputSchema,
    execute
};
