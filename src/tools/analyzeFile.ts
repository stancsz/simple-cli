/**
 * Tool: analyzeFile
 * Structured analysis of a Source File (TS/JS) using ts-morph
 */

import { Project, ScriptTarget } from 'ts-morph';
import { z } from 'zod';
import { readFile } from 'fs/promises';

export const name = 'analyzeFile';

export const description = 'Perform structured analysis of a TypeScript/JavaScript file to extract classes, functions, and interfaces.';

export const permission = 'read' as const;

export const schema = z.object({
    path: z.string().describe('Path to the file to analyze')
});

export const execute = async (args: Record<string, unknown>): Promise<unknown> => {
    const parsed = schema.parse(args);
    const path = parsed.path;

    try {
        const content = await readFile(path, 'utf-8');
        const project = new Project({
            compilerOptions: { target: ScriptTarget.ESNext, allowJs: true },
            useInMemoryFileSystem: true
        });
        const sourceFile = project.createSourceFile(path, content);

        return {
            path,
            classes: sourceFile.getClasses().map(c => ({
                name: c.getName(),
                methods: c.getMethods().map(m => m.getName()),
                properties: c.getProperties().map(p => p.getName())
            })),
            functions: sourceFile.getFunctions().map(f => ({
                name: f.getName(),
                params: f.getParameters().map(p => p.getName())
            })),
            interfaces: sourceFile.getInterfaces().map(i => i.getName()),
            types: sourceFile.getTypeAliases().map(t => t.getName()),
            exports: sourceFile.getExportedDeclarations().keys()
        };
    } catch (error) {
        throw new Error(`Failed to analyze file ${path}: ${error instanceof Error ? error.message : error}`);
    }
};
