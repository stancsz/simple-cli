import { z } from "zod";

export const CoreProposalSchema = z.object({
  analysis: z.string().describe("Detailed analysis of why the change is needed."),
  change_summary: z.string().describe("Brief summary of the changes."),
  patch_file_path: z.string().describe("Path to the patch file (diff) containing the changes."),
});

export const ApplyUpdateSchema = z.object({
  update_id: z.string().describe("The ID of the pending update."),
  approval_token: z.string().optional().describe("Approval token if required."),
});
