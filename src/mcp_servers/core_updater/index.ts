import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { join, dirname, resolve, sep } from "path";
import { readFile, writeFile, mkdir, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { randomUUID } from "crypto";

import { CoreProposalSchema, ApplyUpdateSchema } from "./schema.js";
import { CoreProposal, CoreChange } from "./types.js";
import { CoreProposalStorage } from "./storage.js";
import { EpisodicMemory } from "../../brain/episodic.js";
import { loadConfig } from "../../config.js";

export class CoreUpdaterServer {
  private server: McpServer;
  private storage: CoreProposalStorage;
  private memory: EpisodicMemory;
  private rootDir: string;
  private srcDir: string;

  constructor(rootDir: string = process.cwd()) {
    this.rootDir = resolve(rootDir);
    this.srcDir = join(this.rootDir, "src");
    this.storage = new CoreProposalStorage(rootDir);
    this.memory = new EpisodicMemory(rootDir);
    this.server = new McpServer({
      name: "core_updater",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "read_core_file",
      "Safely read a core file from the src/ directory.",
      {
        filepath: z.string().describe("Relative path to the file (must start with src/)."),
      },
      async (args) => this.readCoreFile(args)
    );

    this.server.tool(
      "propose_core_update",
      "Propose a change to core files. Requires approval or low risk + YOLO mode to apply.",
      {
        title: CoreProposalSchema.shape.title,
        description: CoreProposalSchema.shape.description,
        changes: CoreProposalSchema.shape.changes,
      },
      async (args) => this.handleProposal(args)
    );

    this.server.tool(
      "apply_core_update",
      "Apply a pending core update. Requires approval token for high-risk changes.",
      {
        update_id: ApplyUpdateSchema.shape.update_id,
        approval_token: ApplyUpdateSchema.shape.approval_token,
      },
      async (args) => this.handleApply(args)
    );
  }

  private validatePath(filepath: string): { isValid: boolean; error?: string; fullPath?: string } {
    // 1. Basic check
    if (!filepath.startsWith("src/")) {
      return { isValid: false, error: "Path must start with 'src/'." };
    }

    // 2. Resolve path
    const fullPath = resolve(this.rootDir, filepath);

    // 3. Check if it is within srcDir
    // Ensure srcDir has trailing separator to avoid partial matches (e.g. src-backup)
    const srcDirWithSep = this.srcDir.endsWith(sep) ? this.srcDir : this.srcDir + sep;

    // Also handle exact match if needed, though files are usually inside src/
    if (fullPath !== this.srcDir && !fullPath.startsWith(srcDirWithSep)) {
      return { isValid: false, error: "Path traversal detected. File must be inside src/." };
    }

    return { isValid: true, fullPath };
  }

  public async readCoreFile({ filepath }: { filepath: string }) {
    const validation = this.validatePath(filepath);
    if (!validation.isValid) {
      return {
        content: [{ type: "text" as const, text: `Error: ${validation.error}` }],
        isError: true,
      };
    }

    const fullPath = validation.fullPath!;

    if (!existsSync(fullPath)) {
      return {
        content: [{ type: "text" as const, text: `Error: File '${filepath}' not found.` }],
        isError: true,
      };
    }
    try {
      const content = await readFile(fullPath, "utf-8");
      return {
        content: [{ type: "text" as const, text: content }],
      };
    } catch (e) {
      return {
        content: [{ type: "text" as const, text: `Error reading file: ${e}` }],
        isError: true,
      };
    }
  }

  public async handleProposal(args: z.infer<typeof CoreProposalSchema>) {
    // 1. Validate paths
    for (const change of args.changes) {
      const validation = this.validatePath(change.filepath);
      if (!validation.isValid) {
        return {
          content: [{ type: "text" as const, text: `Error: Invalid path '${change.filepath}': ${validation.error}` }],
          isError: true,
        };
      }
    }

    // 2. Check Risk Level
    let riskLevel: 'low' | 'high' | 'critical' = 'low';
    const criticalFiles = ['src/builtins.ts', 'src/engine.ts'];

    for (const change of args.changes) {
      if (criticalFiles.includes(change.filepath)) {
        riskLevel = 'critical';
        break;
      }
      // Check history for failures (simplified check)
      try {
        const pastFailures = await this.memory.recall(`failure error bug ${change.filepath}`, 3);
        if (pastFailures.length > 0) {
          // Found past failures, elevate risk
          riskLevel = 'high';
        }
      } catch (e) {
        console.warn("Failed to check memory:", e);
      }
    }

    // 3. Create Proposal
    const id = randomUUID();
    const token = randomUUID().substring(0, 8); // Simple token
    const proposal: CoreProposal = {
      id,
      title: args.title,
      description: args.description,
      changes: args.changes.map(c => ({ ...c })), // Copy
      riskLevel,
      status: 'pending',
      createdAt: Date.now(),
      approvalToken: token,
    };

    await this.storage.save(proposal);

    return {
      content: [{
        type: "text" as const,
        text: `Proposal Created.\nID: ${id}\nRisk Level: ${riskLevel}\nApproval Token: ${token}\n\nTo apply, use 'apply_core_update(update_id="${id}", approval_token="${token}")'.`
      }],
    };
  }

  public async handleApply(args: z.infer<typeof ApplyUpdateSchema>) {
    const proposal = await this.storage.get(args.update_id);
    if (!proposal) {
      return {
        content: [{ type: "text" as const, text: `Error: Proposal '${args.update_id}' not found.` }],
        isError: true,
      };
    }

    if (proposal.status !== 'pending') {
      return {
        content: [{ type: "text" as const, text: `Error: Proposal is already ${proposal.status}.` }],
        isError: true
      };
    }

    // Load Config for YOLO mode
    const config = await loadConfig(this.rootDir);
    const yoloMode = config.yoloMode === true;

    // Verify Safety
    let approved = false;
    let reason = "";

    if (args.approval_token === proposal.approvalToken) {
      approved = true;
      reason = "Valid approval token provided.";
    } else {
      // Check YOLO conditions
      if (yoloMode && proposal.riskLevel === 'low') {
        approved = true;
        reason = "YOLO mode enabled and risk is low.";
      } else if (yoloMode && proposal.riskLevel !== 'low') {
        reason = `YOLO mode enabled but risk is ${proposal.riskLevel} (requires token).`;
      } else {
        reason = "Approval token required.";
      }
    }

    if (!approved) {
      return {
        content: [{ type: "text" as const, text: `Update Rejected: ${reason}` }],
        isError: true
      };
    }

    // Backup & Apply
    const backupId = randomUUID();
    const backupDir = join(this.rootDir, ".agent", "backups", backupId);
    await mkdir(backupDir, { recursive: true });

    try {
      for (const change of proposal.changes) {
        // Re-validate just in case (though proposal should be safe if created via tool)
        const validation = this.validatePath(change.filepath);
        if (!validation.isValid) throw new Error(`Invalid path in proposal: ${change.filepath}`);

        const fullPath = validation.fullPath!;

        // Backup
        if (existsSync(fullPath)) {
          const backupPath = join(backupDir, change.filepath.replace(/\//g, "_"));
          await copyFile(fullPath, backupPath);
        }

        // Apply
        const dir = dirname(fullPath);
        if (!existsSync(dir)) await mkdir(dir, { recursive: true });
        await writeFile(fullPath, change.newContent);
      }

      // Update status
      proposal.status = 'applied';
      await this.storage.save(proposal); // Or delete? Let's keep for history.
      // Actually, maybe move to 'history'? For now, just mark applied.

      // Log to memory
      try {
        await this.memory.store(
          `update-${proposal.id}`,
          `Apply Core Update: ${proposal.title}`,
          `Success. Backup ID: ${backupId}`,
          proposal.changes.map(c => c.filepath)
        );
      } catch { }

      return {
        content: [{ type: "text" as const, text: `Update Applied Successfully.\nBackup ID: ${backupId}` }]
      };

    } catch (e) {
      return {
        content: [{ type: "text" as const, text: `Error applying update: ${e}. Changes may be partially applied. Check backups in ${backupId}.` }],
        isError: true
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Core Updater MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new CoreUpdaterServer();
  server.run().catch((err) => {
    console.error("Fatal error in Core Updater MCP Server:", err);
    process.exit(1);
  });
}
