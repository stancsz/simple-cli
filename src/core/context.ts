import { z } from "zod";

export const ContextSchema = z.object({
  goals: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  recent_changes: z.array(z.string()).default([]),
  active_tasks: z.array(z.string()).default([]),
  working_memory: z.string().optional(),
  company_context: z.string().optional(),
  last_updated: z.string().optional(),
});

export type ContextData = z.infer<typeof ContextSchema>;

export interface ContextManager {
  readContext(lockId?: string): Promise<ContextData>;
  updateContext(updates: Partial<ContextData>, lockId?: string): Promise<ContextData>;
  clearContext(lockId?: string): Promise<void>;
}
