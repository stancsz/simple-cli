import { z } from "zod";

export const ProposeCoreUpdateSchema = z.object({
  description: z.string().describe("Short description of the update."),
  file_path: z.string().describe("Relative path to the file in src/ (e.g., 'src/engine.ts')."),
  new_content: z.string().describe("The full new content of the file."),
  reasoning: z.string().describe("Reasoning for the change (why is this needed?)."),
});

export const ApplyCoreUpdateSchema = z.object({
  proposal_id: z.string().describe("The ID of the pending update."),
  approval_token: z.string().optional().describe("Approval token required for high-risk changes or if YOLO mode is off."),
});
