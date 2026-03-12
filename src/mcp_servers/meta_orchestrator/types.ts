import { z } from "zod";

export const AgencyDescriptorSchema = z.object({
  agency_id: z.string().describe("The unique identifier of the agency."),
  endpoint: z.string().url().describe("The base URL for RPC communication with this agency."),
  capabilities: z.array(z.object({
    name: z.string(),
    description: z.string(),
    version: z.string().optional()
  })).describe("List of capabilities this agency provides."),
  status: z.enum(["active", "inactive", "maintenance"]).describe("Current operational status."),
});

export const CrossAgencyTaskSchema = z.object({
  task_id: z.string().describe("The unique identifier for this task."),
  target_agency: z.string().describe("The agency ID handling this task."),
  description: z.string().describe("The task description."),
  status: z.enum(["pending", "in_progress", "completed", "failed", "rejected"]).describe("Current status of the task."),
  result: z.any().optional().describe("Task result if completed."),
  error: z.string().optional().describe("Task error if failed."),
  created_at: z.number().describe("Timestamp when the task was delegated."),
  updated_at: z.number().describe("Timestamp when the task was last updated.")
});

export type AgencyDescriptor = z.infer<typeof AgencyDescriptorSchema>;
export type CrossAgencyTask = z.infer<typeof CrossAgencyTaskSchema>;
