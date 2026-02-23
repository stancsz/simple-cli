import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import simpleGit from "simple-git";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";

// Initialize git client
const git = simpleGit();

export class RoadmapSyncServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "roadmap_sync",
      version: "1.0.0",
    });
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "scan_recent_activity",
      "Scan recent git activity (commits, PRs) for completed items.",
      {
        limit: z.number().optional().default(50).describe("Number of commits to scan."),
      },
      async ({ limit = 50 }) => {
        try {
          const log = await git.log({ maxCount: limit });
          const activity = log.all.map((commit) => ({
            hash: commit.hash,
            date: commit.date,
            message: commit.message,
            author_name: commit.author_name,
            body: commit.body,
          }));

          const completedItems = activity.filter((commit) => {
            const msg = (commit.message + "\n" + commit.body).toLowerCase();
            return (
              msg.includes("[x]") ||
              msg.includes("feat:") ||
              msg.includes("fix:") ||
              msg.includes("implemented:") ||
              msg.includes("completed:")
            );
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(completedItems, null, 2),
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [{ type: "text", text: `Error scanning git activity: ${error.message}` }],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "update_roadmap",
      "Update docs/ROADMAP.md and docs/todo.md based on recent activity.",
      {},
      async () => {
        try {
          // 1. Get recent activity
          const log = await git.log({ maxCount: 50 });
          const relevantCommits = log.all.filter((commit) => {
            const msg = (commit.message + "\n" + commit.body).toLowerCase();
            return (
              msg.includes("[x]") ||
              msg.includes("feat:") ||
              msg.includes("fix:") ||
              msg.includes("implemented:") ||
              msg.includes("completed:")
            );
          });

          if (relevantCommits.length === 0) {
            return {
              content: [{ type: "text", text: "No relevant activity found to update roadmap." }],
            };
          }

          const cwd = process.cwd();
          const roadmapPath = join(cwd, "docs", "ROADMAP.md");
          const todoPath = join(cwd, "docs", "todo.md");

          let roadmapContent = "";
          let todoContent = "";
          let roadmapUpdated = false;
          let todoUpdated = false;

          if (existsSync(roadmapPath)) {
            roadmapContent = await readFile(roadmapPath, "utf-8");
          }
          if (existsSync(todoPath)) {
            todoContent = await readFile(todoPath, "utf-8");
          }

          const changes: string[] = [];

          for (const commit of relevantCommits) {
            // Extract feature name/description from commit
            // Simple heuristic: take the first line, remove prefixes
            let feature = commit.message.split("\n")[0];
            feature = feature
              .replace(/^(feat|fix|chore|docs|refactor)(\(.*\))?:/, "")
              .replace(/^\[x\]/, "")
              .trim();

            if (!feature) continue;

            const date = new Date(commit.date).toISOString().split("T")[0]; // YYYY-MM-DD
            const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

            // Heuristic matching: Try to match the feature text in the markdown files
            // We look for "- [ ] ... feature ..."
            // We use a simplified version of the feature text for matching (remove punctuation, lowercase)
            const simplifiedFeature = feature.toLowerCase().replace(/[^\w\s]/g, "");
            const keywords = simplifiedFeature.split(/\s+/).filter(w => w.length > 3); // Filter short words

            if (keywords.length === 0) continue;

            // Update ROADMAP.md
            if (roadmapContent) {
                const lines = roadmapContent.split('\n');
                let fileModified = false;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    // Match unchecked items
                    if (line.trim().startsWith("- [ ]")) {
                        const lineLower = line.toLowerCase();
                        // Check if all keywords are present (naive but safer than single keyword)
                        // Or at least a significant portion? Let's require all significant keywords for now.
                        // Or better: use fuzzy matching score?
                        // Let's stick to "contains all keywords" for high precision, or "contains phrase" if possible.

                        // Check if the commit message references the item directly
                        // Or if the item text is in the commit message.

                        // Let's try: if the line contains the feature text (fuzzy).
                        const lineSimplified = lineLower.replace(/[^\w\s]/g, "");

                        // If line contains the simplified feature, OR simplified feature contains the line content (minus checklist)
                        if (lineSimplified.includes(simplifiedFeature) || simplifiedFeature.includes(lineSimplified.replace(/^-\s*\[\s*\]\s*/, ''))) {
                             lines[i] = line.replace("- [ ]", "- [x]") + ` (Completed: ${date})`;
                             fileModified = true;
                             changes.push(`ROADMAP: Marked '${line.trim()}' as completed.`);
                        }
                    }
                }
                if (fileModified) {
                    roadmapContent = lines.join('\n');
                    roadmapUpdated = true;
                }
            }

            // Update todo.md
            if (todoContent) {
                const lines = todoContent.split('\n');
                let fileModified = false;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    // Match unchecked items that are NOT struck through
                    if (line.trim().startsWith("- [ ]") && !line.includes("~~")) {
                         const lineLower = line.toLowerCase();
                         const lineSimplified = lineLower.replace(/[^\w\s]/g, "");

                         if (lineSimplified.includes(simplifiedFeature) || simplifiedFeature.includes(lineSimplified.replace(/^-\s*\[\s*\]\s*/, ''))) {
                             // Strike through
                             // Usually: - [ ] Item -> - [x] ~~Item~~
                             // Or just - [x] Item
                             // Prompt said: "Update docs/todo.md by striking through completed items."
                             // So: - [ ] Item -> - [x] ~~Item~~
                             lines[i] = line.replace("- [ ]", "- [x]").replace(/\[\s*\]\s*(.*)/, "[x] ~~$1~~");
                             // Wait, regex replace above is tricky if line has other stuff.
                             // safer:
                             const content = line.substring(line.indexOf("]") + 1).trim();
                             lines[i] = `- [x] ~~${content}~~`;
                             fileModified = true;
                             changes.push(`TODO: Struck through '${line.trim()}'.`);
                         }
                    }
                    // Also handle items that are already checked but not struck through?
                    else if (line.trim().startsWith("- [x]") && !line.includes("~~")) {
                         const lineLower = line.toLowerCase();
                         const lineSimplified = lineLower.replace(/[^\w\s]/g, "");
                         if (lineSimplified.includes(simplifiedFeature) || simplifiedFeature.includes(lineSimplified.replace(/^-\s*\[\s*x\]\s*/, ''))) {
                             const content = line.substring(line.indexOf("]") + 1).trim();
                             lines[i] = `- [x] ~~${content}~~`;
                             fileModified = true;
                             changes.push(`TODO: Struck through '${line.trim()}' (was already checked).`);
                         }
                    }
                }
                if (fileModified) {
                    todoContent = lines.join('\n');
                    todoUpdated = true;
                }
            }
          }

          // Add Last Updated Footer to ROADMAP.md
          if (roadmapUpdated || todoUpdated) {
              const today = new Date().toISOString().split("T")[0];
              const footer = `\n\n> **Last Updated:** ${today} (Automated via Roadmap Sync)`;

              if (roadmapUpdated) {
                  // Check if footer exists
                  if (roadmapContent.includes("> **Last Updated:**")) {
                      roadmapContent = roadmapContent.replace(/> \*\*Last Updated:\*\* .*/, `> **Last Updated:** ${today} (Automated via Roadmap Sync)`);
                  } else {
                      roadmapContent += footer;
                  }
                  await writeFile(roadmapPath, roadmapContent, "utf-8");
              }

              if (todoUpdated) {
                   await writeFile(todoPath, todoContent, "utf-8");
              }

              return {
                  content: [{ type: "text", text: `Updated roadmap and todo files.\nChanges:\n${changes.join('\n')}` }]
              };
          } else {
               return {
                  content: [{ type: "text", text: "No matching items found in documentation to update." }]
              };
          }

        } catch (error: any) {
          return {
            content: [{ type: "text", text: `Error updating roadmap: ${error.message}` }],
            isError: true,
          };
        }
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Roadmap Sync MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const server = new RoadmapSyncServer();
  server.run().catch((err) => {
    console.error("Fatal error in Roadmap Sync MCP Server:", err);
    process.exit(1);
  });
}
