import { z } from "zod";

export const MemorySchema = z.object({
  id: z.string(),
  taskId: z.string(),
  timestamp: z.number(),
  userPrompt: z.string(),
  agentResponse: z.string(),
  artifacts: z.array(z.string()),
  vector: z.array(z.number()),
  company_id: z.string().optional(),
  _distance: z.number().optional(),
});

export type Memory = z.infer<typeof MemorySchema>;

export const CompanyMemorySchema = MemorySchema.extend({
  company_id: z.string(),
});

export type CompanyMemory = z.infer<typeof CompanyMemorySchema>;
