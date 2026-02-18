import { z } from "zod";

export const CoreChangeSchema = z.object({
  filepath: z.string().describe("Relative path to the file in src/ (e.g., 'src/engine.ts')."),
  newContent: z.string().describe("The full new content of the file."),
  diff: z.string().optional().describe("A diff string for context."),
});

export const CoreProposalSchema = z.object({
  title: z.string().describe("Short title of the proposal."),
  description: z.string().describe("Detailed description of the change."),
  changes: z.array(CoreChangeSchema).describe("List of files to be modified."),
});

export const ApplyUpdateSchema = z.object({
  update_id: z.string().describe("The ID of the pending update."),
  approval_token: z.string().optional().describe("Approval token if required."),
});
