import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";
import { readdir, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, basename } from "path";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);

export class SkillsMpServer {
  private server: McpServer;
  private skillsDir: string;

  constructor() {
    this.server = new McpServer({
      name: "skillsmp",
      version: "1.0.0",
    });

    // Default skills directory: .agent/skills
    this.skillsDir = join(process.cwd(), ".agent", "skills");
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "skillsmp_search",
      "Search for skills on SkillsMP (requires SKILLSMP_API_KEY).",
      {
        query: z.string().describe("The search query (e.g., 'git', 'web scraping')."),
      },
      async ({ query }) => {
        const apiKey = process.env.SKILLSMP_API_KEY;
        if (!apiKey) {
          return {
            content: [
              {
                type: "text",
                text: "Error: SKILLSMP_API_KEY environment variable is not set. Please set it to use the search functionality. Alternatively, if you know the GitHub repository URL of a skill, you can use 'skillsmp_install' directly.",
              },
            ],
            isError: true,
          };
        }

        try {
          const response = await fetch(`https://skillsmp.com/api/v1/skills/search?q=${encodeURIComponent(query)}`, {
            headers: {
              "Authorization": `Bearer ${apiKey}`
            }
          });

          if (!response.ok) {
            return {
              content: [{ type: "text", text: `Error searching skills: ${response.statusText}` }],
              isError: true,
            };
          }

          const data = await response.json();
          // Assuming data structure based on typical API response, likely an array or object with 'skills'
          // Adapt based on actual API response if known, otherwise return raw JSON for now
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };

        } catch (error: any) {
          return {
            content: [{ type: "text", text: `Failed to search skills: ${error.message}` }],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "skillsmp_install",
      "Install a skill from a GitHub repository.",
      {
        url: z.string().describe("The GitHub URL or 'owner/repo' string of the skill."),
        name: z.string().optional().describe("Optional name for the local skill directory. Defaults to repo name."),
      },
      async ({ url, name }) => {
        // Expand owner/repo to full URL if needed
        let repoUrl = url;
        // Basic validation for owner/repo pattern or URL
        if (!url.match(/^(https?:\/\/|git@).+/) && url.match(/^[\w.-]+\/[\w.-]+$/)) {
             repoUrl = `https://github.com/${url}.git`;
        } else if (!url.match(/^(https?:\/\/|git@).+/)) {
             // If not a URL and not owner/repo, it might be invalid or just a name.
             // But strict validation helps.
             return {
                 content: [{ type: "text", text: "Invalid URL or repository format. Please provide a valid GitHub URL or 'owner/repo' string." }],
                 isError: true
             };
        }

        // Determine local directory name
        let skillName = name;
        if (!skillName) {
            // Extract from URL
            const parts = repoUrl.split("/");
            let lastPart = parts[parts.length - 1];
            if (lastPart.endsWith(".git")) {
                lastPart = lastPart.slice(0, -4);
            }
            skillName = lastPart;
        }

        // Validate skillName for path traversal
        if (!skillName || !/^[a-zA-Z0-9._-]+$/.test(skillName)) {
             return {
                content: [{ type: "text", text: "Invalid skill name. Must contain only alphanumeric characters, dots, underscores, or hyphens." }],
                isError: true
             };
        }

        const targetDir = join(this.skillsDir, skillName);

        try {
            // Ensure .agent/skills exists
            if (!existsSync(this.skillsDir)) {
                await mkdir(this.skillsDir, { recursive: true });
            }

            if (existsSync(targetDir)) {
                return {
                    content: [{ type: "text", text: `Skill '${skillName}' already exists at ${targetDir}. Use 'skillsmp_update' (not implemented) or delete the directory to reinstall.` }],
                    isError: true
                };
            }

            // Clone using execFile for safety
            await execFileAsync('git', ['clone', repoUrl, targetDir]);

            // Validate SKILL.md
            const skillMdPath = join(targetDir, "SKILL.md");
            if (!existsSync(skillMdPath)) {
                 return {
                    content: [{ type: "text", text: `Warning: Skill installed to ${targetDir}, but no SKILL.md found. This might not be a valid agent skill.` }],
                 };
            }

            return {
                content: [{ type: "text", text: `Successfully installed skill '${skillName}' to ${targetDir}.` }],
            };

        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Failed to install skill: ${error.message}` }],
                isError: true
            };
        }
      }
    );

    this.server.tool(
      "skillsmp_list",
      "List installed skills.",
      {},
      async () => {
        if (!existsSync(this.skillsDir)) {
             return { content: [{ type: "text", text: "No skills installed (skills directory does not exist)." }] };
        }

        try {
            const entries = await readdir(this.skillsDir, { withFileTypes: true });
            const skills = [];
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const skillPath = join(this.skillsDir, entry.name);
                    const hasSkillMd = existsSync(join(skillPath, "SKILL.md"));
                    skills.push(`- ${entry.name} ${hasSkillMd ? "(valid)" : "(no SKILL.md)"}`);
                }
            }

            if (skills.length === 0) {
                return { content: [{ type: "text", text: "No skills installed." }] };
            }

            return { content: [{ type: "text", text: skills.join("\n") }] };
        } catch (error: any) {
             return {
                content: [{ type: "text", text: `Error listing skills: ${error.message}` }],
                isError: true
            };
        }
      }
    );

    this.server.tool(
      "skillsmp_read",
      "Read the content of a skill's SKILL.md file.",
      {
        name: z.string().describe("The name of the installed skill."),
      },
      async ({ name }) => {
        // Validate name for path traversal
        if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
            return {
                content: [{ type: "text", text: "Invalid skill name." }],
                isError: true
            };
        }

        const skillPath = join(this.skillsDir, name);
        const skillMdPath = join(skillPath, "SKILL.md");

        if (!existsSync(skillMdPath)) {
            return {
                content: [{ type: "text", text: `Skill '${name}' not found or does not have a SKILL.md file.` }],
                isError: true
            };
        }

        try {
            const content = await readFile(skillMdPath, "utf-8");
            return {
                content: [{ type: "text", text: content }]
            };
        } catch (error: any) {
             return {
                content: [{ type: "text", text: `Error reading skill: ${error.message}` }],
                isError: true
            };
        }
      }
    );

    this.server.tool(
        "skillsmp_use",
        "Use a skill by reading its instructions (alias for read).",
        {
          name: z.string().describe("The name of the installed skill."),
        },
        async ({ name }) => {
            // Validate name for path traversal
            if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
                return {
                    content: [{ type: "text", text: "Invalid skill name." }],
                    isError: true
                };
            }

            const skillPath = join(this.skillsDir, name);
            const skillMdPath = join(skillPath, "SKILL.md");

            if (!existsSync(skillMdPath)) {
                return {
                    content: [{ type: "text", text: `Skill '${name}' not found or does not have a SKILL.md file.` }],
                    isError: true
                };
            }

            try {
                const content = await readFile(skillMdPath, "utf-8");
                return {
                    content: [{ type: "text", text: `Activated skill '${name}'. Here are the instructions:\n\n${content}` }]
                };
            } catch (error: any) {
                 return {
                    content: [{ type: "text", text: `Error using skill: ${error.message}` }],
                    isError: true
                };
            }
        }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("SkillsMP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new SkillsMpServer();
  server.run().catch((err) => {
    console.error("Fatal error in SkillsMP Server:", err);
    process.exit(1);
  });
}
