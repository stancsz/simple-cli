import { z } from "zod";
import { randomUUID } from "crypto";
import { resolve, sep } from "path";
import { existsSync } from "fs";
import { CoreProposalStorage } from "../storage.js";
import { ProposeCoreUpdateSchema } from "../schema.js";
import { CoreProposal } from "../types.js";
import { EpisodicMemory } from "../../../brain/episodic.js";

export async function proposeCoreUpdate(
  args: z.infer<typeof ProposeCoreUpdateSchema>,
  storage: CoreProposalStorage,
  memory: EpisodicMemory,
  rootDir: string
) {
  const { description, file_path, new_content, reasoning } = args;

  // 1. Validate Path
  if (!file_path.startsWith("src/")) {
    return {
      content: [{ type: "text" as const, text: "Error: File path must start with 'src/'." }],
      isError: true,
    };
  }

  const fullPath = resolve(rootDir, file_path);
  const srcDir = resolve(rootDir, "src");
  const srcDirWithSep = srcDir.endsWith(sep) ? srcDir : srcDir + sep;

  if (fullPath !== srcDir && !fullPath.startsWith(srcDirWithSep)) {
    return {
      content: [{ type: "text" as const, text: "Error: Path traversal detected. File must be inside src/." }],
      isError: true,
    };
  }

  // 2. Risk Assessment
  let riskLevel: 'low' | 'high' | 'critical' = 'low';
  const criticalFiles = ['src/builtins.ts', 'src/engine.ts', 'src/config.ts'];

  if (criticalFiles.includes(file_path)) {
    riskLevel = 'critical';
  } else {
    // Check memory for past failures related to this file
    try {
      const failures = await memory.recall(`failure error bug ${file_path}`, 3);
      if (failures.length > 0) {
        riskLevel = 'high';
      }
    } catch (e) {
      console.warn("Memory check failed:", e);
    }
  }

  // 3. Create Proposal
  const id = randomUUID();
  const token = randomUUID().substring(0, 8); // Simple token
  const proposal: CoreProposal = {
    id,
    title: description.substring(0, 50) + (description.length > 50 ? "..." : ""),
    description,
    reasoning,
    changes: [{
      filepath: file_path,
      newContent: new_content
    }],
    riskLevel,
    status: 'pending',
    createdAt: Date.now(),
    approvalToken: token,
  };

  await storage.save(proposal);

  return {
    content: [{
      type: "text" as const,
      text: `Proposal Created.\nID: ${id}\nRisk Level: ${riskLevel}\nApproval Token: ${token}\n\nTo apply, use 'apply_core_update(proposal_id="${id}", approval_token="${token}")'.`
    }],
  };
}
