import { z } from 'zod';

/**
 * Example Project-Level Tool
 * This tool is loaded from the /tools directory in the project root.
 */
export const tool = {
    name: 'helloProject',
    description: 'A sample tool stored in the project-level tools folder',
    permission: 'read',
    inputSchema: z.object({
        name: z.string().describe('The name to greet')
    }),
    execute: async ({ name }: { name: string }) => {
        return `Hello ${name}! This message comes from a tool in your project's /tools folder.`;
    }
};
