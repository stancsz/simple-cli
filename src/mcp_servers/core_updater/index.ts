import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { join, resolve, dirname, sep } from "path";
import { readFile, writeFile, mkdir, copyFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import * as Diff from "diff";

import { CoreProposalSchema, ApplyUpdateSchema } from "./schema.js";
import { CoreProposal } from "./types.js";
import { CoreProposalStorage } from "./storage.js";
import { EpisodicMemory } from "../../brain/episodic.js";
import { loadConfig } from "../../config.js";

export class CoreUpdaterServer {
  private server: McpServer;
  private storage: CoreProposalStorage;
  private memory: EpisodicMemory;
  private rootDir: string;
  private srcDir: string;
  private patchesDir: string;

  constructor(rootDir: string = process.cwd()) {
    this.rootDir = resolve(rootDir);
    this.srcDir = join(this.rootDir, "src");
    this.patchesDir = join(this.rootDir, "src", "mcp_servers", "core_updater", "patches");
    this.storage = new CoreProposalStorage(rootDir);
    this.memory = new EpisodicMemory();
    this.server = new McpServer({
      name: "core_updater",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "propose_core_update",
      "Propose a change to core files using a patch. Requires approval or low risk + YOLO mode to apply.",
      {
        analysis: CoreProposalSchema.shape.analysis,
        change_summary: CoreProposalSchema.shape.change_summary,
        patch_file_path: CoreProposalSchema.shape.patch_file_path,
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
    const fullPath = resolve(this.rootDir, filepath);
    const srcDirWithSep = this.srcDir.endsWith(sep) ? this.srcDir : this.srcDir + sep;

    if (fullPath !== this.srcDir && !fullPath.startsWith(srcDirWithSep)) {
      return { isValid: false, error: "Path traversal detected. File must be inside src/." };
    }

    return { isValid: true, fullPath };
  }

  public async handleProposal(args: z.infer<typeof CoreProposalSchema>) {
    const patchPath = resolve(process.cwd(), args.patch_file_path);
    if (!existsSync(patchPath)) {
      return {
        content: [{ type: "text" as const, text: `Error: Patch file '${args.patch_file_path}' not found.` }],
        isError: true,
      };
    }

    let patchContent: string;
    try {
      patchContent = await readFile(patchPath, "utf-8");
    } catch (e) {
      return {
        content: [{ type: "text" as const, text: `Error reading patch file: ${e}` }],
        isError: true,
      };
    }

    const patches = Diff.parsePatch(patchContent);
    if (patches.length === 0) {
      return {
        content: [{ type: "text" as const, text: "Error: Patch file contains no valid patches." }],
        isError: true,
      };
    }

    const affectedFiles: string[] = [];
    for (const patch of patches) {
      let filePath = patch.newFileName || patch.oldFileName;
      if (!filePath) continue;

      if (filePath.startsWith("a/") || filePath.startsWith("b/")) {
        filePath = filePath.substring(2);
      } else if (filePath.startsWith("Before: ") || filePath.startsWith("After: ")) {
          filePath = filePath.split(": ")[1];
      }

      const validation = this.validatePath(filePath);
      if (!validation.isValid) {
        return {
          content: [{ type: "text" as const, text: `Error: Patch affects file outside src/: ${filePath}` }],
          isError: true,
        };
      }
      affectedFiles.push(filePath);
    }

    let riskLevel: 'low' | 'high' | 'critical' = 'low';
    const criticalFiles = ['src/builtins.ts', 'src/engine.ts', 'src/cli.ts'];

    for (const file of affectedFiles) {
      if (criticalFiles.some(cf => file.endsWith(cf) || cf.endsWith(file))) {
        riskLevel = 'critical';
        break;
      }
      try {
        const pastFailures = await this.memory.recall(`failure error bug ${file}`, 3);
        if (pastFailures.length > 0) {
          riskLevel = 'high';
        }
      } catch (e) {
        console.warn("Failed to check memory:", e);
      }
    }

    const id = randomUUID();
    const token = randomUUID().substring(0, 8);

    if (!existsSync(this.patchesDir)) {
      await mkdir(this.patchesDir, { recursive: true });
    }
    const storedPatchPath = join(this.patchesDir, `${id}.patch`);
    await writeFile(storedPatchPath, patchContent);

    const proposal: CoreProposal = {
      id,
      title: args.change_summary,
      description: args.analysis,
      patchPath: storedPatchPath,
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

    const config = await loadConfig(this.rootDir);
    const yoloMode = config.yoloMode === true;

    let approved = false;
    let reason = "";

    if (args.approval_token === proposal.approvalToken) {
      approved = true;
      reason = "Valid approval token provided.";
    } else {
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

    const backupId = randomUUID();
    const backupDir = join(this.rootDir, ".agent", "backups", backupId);
    await mkdir(backupDir, { recursive: true });

    let backups: { src: string, dest: string }[] = [];
    let newFiles: string[] = [];
    let patches: Diff.ParsedDiff[] = [];

    try {
      if (!existsSync(proposal.patchPath)) {
        throw new Error(`Stored patch file not found: ${proposal.patchPath}`);
      }
      const patchContent = await readFile(proposal.patchPath, "utf-8");
      patches = Diff.parsePatch(patchContent);

      // Pass 1: Validate and Backup
      for (const patch of patches) {
        let filePath = patch.oldFileName || patch.newFileName;
        if (!filePath) continue;
        if (filePath.startsWith("a/") || filePath.startsWith("b/")) filePath = filePath.substring(2);

        const validation = this.validatePath(filePath);
        if (!validation.isValid) throw new Error(`Invalid path in patch: ${filePath}`);

        const fullPath = validation.fullPath!;
        const backupPath = join(backupDir, filePath);
        const backupFileDir = dirname(backupPath);
        if (!existsSync(backupFileDir)) await mkdir(backupFileDir, { recursive: true });

        if (existsSync(fullPath)) {
          // Check if we already backed up this file (in case of multiple patches per file)
          const alreadyBackedUp = backups.some(b => b.dest === fullPath);
          if (!alreadyBackedUp) {
              await copyFile(fullPath, backupPath);
              backups.push({ src: backupPath, dest: fullPath });
          }
        } else {
          // If it doesn't exist, it's a new file.
          // But check if we already marked it as new
          if (!newFiles.includes(fullPath)) {
              newFiles.push(fullPath);
          }
        }
      }

      // Pass 2: Apply
      for (const patch of patches) {
        let filePath = patch.oldFileName || patch.newFileName;
        if (!filePath) continue;
        if (filePath.startsWith("a/") || filePath.startsWith("b/")) filePath = filePath.substring(2);

        const fullPath = resolve(this.rootDir, filePath);

        if (existsSync(fullPath)) {
          const originalContent = await readFile(fullPath, "utf-8");
          const appliedContent = Diff.applyPatch(originalContent, patch);
          if (appliedContent === false) throw new Error(`Failed to apply patch to ${filePath}. Hunk mismatch.`);
          await writeFile(fullPath, appliedContent);
        } else {
          const appliedContent = Diff.applyPatch("", patch);
          if (appliedContent === false) throw new Error(`Failed to apply patch to new file ${filePath}.`);
          const dir = dirname(fullPath);
          if (!existsSync(dir)) await mkdir(dir, { recursive: true });
          await writeFile(fullPath, appliedContent);
        }
      }

      proposal.status = 'applied';
      await this.storage.save(proposal);

      try {
        await this.memory.store(
          `update-${proposal.id}`,
          `Apply Core Update: ${proposal.title}`,
          `Success. Backup ID: ${backupId}`,
          [proposal.patchPath]
        );
      } catch { }

      return {
        content: [{ type: "text" as const, text: `Update Applied Successfully.\nBackup ID: ${backupId}` }]
      };

    } catch (e) {
      // Rollback
      console.error(`Error applying update: ${e}. Rolling back...`);
      try {
        // Restore backups
        for (const backup of backups) {
             const dir = dirname(backup.dest);
             if (!existsSync(dir)) await mkdir(dir, { recursive: true });
             await copyFile(backup.src, backup.dest);
        }
        // Delete new files
        for (const file of newFiles) {
             if (existsSync(file)) await unlink(file);
        }
      } catch (rollbackError) {
         return {
           content: [{ type: "text" as const, text: `CRITICAL ERROR: Update failed AND rollback failed. Manual intervention required. Backup ID: ${backupId}\nOriginal Error: ${e}\nRollback Error: ${rollbackError}` }],
           isError: true
         };
      }

      return {
        content: [{ type: "text" as const, text: `Error applying update: ${e}. Changes were rolled back. Backup ID: ${backupId}` }],
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
