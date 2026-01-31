import { z } from 'zod';

export const name = 'helloSkill';
export const description = 'A test skill that says hello';
export const schema = z.object({
    name: z.string().describe('The name to say hello to')
});

export const execute = async (args: any) => {
    return `Hello, ${args.name}! This is a custom skill working!`;
};
