import { z } from "zod";
import { resolve, join, dirname } from "path";
import { mkdir, copyFile, writeFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { CoreProposalStorage } from "../storage.js";
import { ApplyCoreUpdateSchema } from "../schema.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { loadConfig } from "../../../config.js";

const execAsync = promisify(exec);

export async function applyCoreUpdate(
  args: z.infer<typeof ApplyCoreUpdateSchema>,
  storage: CoreProposalStorage,
  memory: EpisodicMemory,
  rootDir: string
) {
  const { proposal_id, approval_token } = args;

  // 1. Load Proposal
  const proposal = await storage.get(proposal_id);
  if (!proposal) {
    return {
      content: [{ type: "text" as const, text: `Error: Proposal '${proposal_id}' not found.` }],
      isError: true,
    };
  }

  if (proposal.status !== 'pending') {
    return {
      content: [{ type: "text" as const, text: `Error: Proposal is already ${proposal.status}.` }],
      isError: true
    };
  }

  // 2. Load Config for YOLO Mode
  const config = await loadConfig(rootDir);
  const yoloMode = config.yoloMode === true;

  // 3. Verify Safety
  let approved = false;
  let reason = "";

  if (approval_token && approval_token === proposal.approvalToken) {
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

  // 4. Backup
  const backupId = `${Date.now()}_${proposal.id}`;
  const backupDir = join(rootDir, "src", `backup_${backupId}`);
  await mkdir(backupDir, { recursive: true });

  try {
    for (const change of proposal.changes) {
      const fullPath = resolve(rootDir, change.filepath);
      if (existsSync(fullPath)) {
        const backupPath = join(backupDir, change.filepath.replace(/\//g, "_"));
        await copyFile(fullPath, backupPath);
      }
    }

    // 5. Apply & Verify
    for (const change of proposal.changes) {
      const fullPath = resolve(rootDir, change.filepath);
      const dir = dirname(fullPath);
      if (!existsSync(dir)) await mkdir(dir, { recursive: true });
      await writeFile(fullPath, change.newContent);
    }

    // Syntax Check (tsc --noEmit)
    // We run this from rootDir. If it fails, we revert.
    try {
      // Using npx tsc to ensure we use the project's typescript
      // This might be slow, but it's safe.
      await execAsync("npx tsc --noEmit", { cwd: rootDir });
    } catch (e: any) {
      // Revert!
      for (const change of proposal.changes) {
        const fullPath = resolve(rootDir, change.filepath);
        const backupPath = join(backupDir, change.filepath.replace(/\//g, "_"));
        if (existsSync(backupPath)) {
          await copyFile(backupPath, fullPath);
        } else {
          // If no backup exists, it was a new file. Delete it to revert.
          if (existsSync(fullPath)) {
            await unlink(fullPath);
          }
        }
      }
      throw new Error(`Syntax check failed: ${e.stdout || e.message}`);
    }

    // 6. Finalize
    proposal.status = 'applied';
    await storage.save(proposal);

    // Log to Memory (Brain)
    try {
      await memory.store(
        `update-${proposal.id}`,
        `Apply Core Update: ${proposal.title}`,
        `Success. Backup ID: ${backupId}\nReasoning: ${proposal.reasoning}`,
        proposal.changes.map(c => c.filepath)
      );
    } catch (e) {
      console.warn("Failed to log to brain:", e);
    }

    return {
      content: [{ type: "text" as const, text: `Update Applied Successfully.\nBackup ID: ${backupId}` }]
    };

  } catch (e: any) {
    return {
      content: [{ type: "text" as const, text: `Error applying update: ${e.message}. Changes reverted from backup ${backupId}.` }],
      isError: true
    };
  }
}
