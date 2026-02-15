import { z } from "zod";
import { existsSync } from "fs";
import { readFile, writeFile, readdir } from "fs/promises";
import { join } from "path";

export const read_file = {
    name: "read_file",
    description: "Read the contents of a file.",
    inputSchema: z.object({
        path: z.string().describe("Path to the file to read"),
    }),
    execute: async ({ path }: { path: string }) => {
        try {
            if (!existsSync(path)) return `Error: File not found: ${path}`;
            const content = await readFile(path, "utf-8");
            return content;
        } catch (e: any) {
            return `Error reading file: ${e.message}`;
        }
    },
};

export const write_file = {
    name: "write_file",
    description: "Write content to a file. Overwrites existing content.",
    inputSchema: z.object({
        path: z.string().describe("Path to the file to write"),
        content: z.string().describe("Content to write"),
    }),
    execute: async ({ path, content }: { path: string; content: string }) => {
        try {
            await writeFile(path, content, "utf-8");
            return `Successfully wrote to ${path}`;
        } catch (e: any) {
            return `Error writing file: ${e.message}`;
        }
    },
};

export const list_dir = {
    name: "list_dir",
    description: "List files in a directory.",
    inputSchema: z.object({
        path: z.string().default(".").describe("Path to directory"),
    }),
    execute: async ({ path }: { path: string }) => {
        try {
            const entries = await readdir(path, { withFileTypes: true });
            return entries
                .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
                .join("\n");
        } catch (e: any) {
            return `Error listing directory: ${e.message}`;
        }
    },
};

export const tool = [read_file, write_file, list_dir];
export default tool;
