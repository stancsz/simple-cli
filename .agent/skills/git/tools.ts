import { z } from "zod";
import { exec } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";

export const run_shell = {
    name: "run_shell",
    description: "Execute a shell command and return the output.",
    inputSchema: z.object({
        command: z.string().describe("The command to execute in the shell"),
    }),
    execute: async ({ command }: { command: string }) => {
        return new Promise((resolve) => {
            exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
                if (error) {
                    resolve(`Error: ${error.message}\nStderr: ${stderr}`);
                } else {
                    resolve(stdout.trim() || (stderr ? `Stderr: ${stderr}` : "Command executed successfully with no output."));
                }
            });
        });
    },
};

export const pr_comment = {
    name: "pr_comment",
    description: "Post a comment on a GitHub Pull Request.",
    inputSchema: z.object({
        pr_number: z.number().describe("The PR number"),
        body: z.string().describe("The comment body (markdown supported)"),
    }),
    execute: async ({ pr_number, body }: { pr_number: number; body: string }) => {
        try {
            const commentFile = join(process.cwd(), `.pr_comment_${Date.now()}.txt`);
            await writeFile(commentFile, body, "utf-8");

            return new Promise((resolve) => {
                exec(`gh pr comment ${pr_number} --body-file "${commentFile}"`, (error, stdout, stderr) => {
                    if (error) {
                        resolve(`Failed to comment: ${error.message}`);
                    } else {
                        resolve(`Comment posted on PR #${pr_number}`);
                    }
                });
            }).finally(async () => {
                try {
                    await unlink(commentFile);
                } catch { }
            });

        } catch (e: any) {
            return `Error preparing comment: ${e.message}`;
        }
    },
};

export const tool = [run_shell, pr_comment];
export default tool;
