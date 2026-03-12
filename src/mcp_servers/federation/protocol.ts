import { z } from "zod";

// Base entity for capability discovery
export const CapabilitySchema = z.object({
  name: z.string().describe("Name of the capability (e.g., 'legal_review', 'code_review')."),
  description: z.string().describe("A human-readable description of what this capability does."),
  version: z.string().optional().default("1.0.0").describe("The version of this capability."),
});

// Profile for an agency participating in the federation
export const AgencyProfileSchema = z.object({
  agency_id: z.string().describe("The unique identifier of the agency."),
  endpoint: z.string().url().describe("The base URL for RPC communication with this agency."),
  capabilities: z.array(CapabilitySchema).describe("List of capabilities this agency provides."),
  status: z.enum(["active", "inactive", "maintenance"]).default("active").describe("Current operational status."),
  supported_protocols: z.array(z.string()).default(["mcp/1.0"]).describe("Protocols supported by this agency."),
});

// Request payload for delegating a task to another agency
export const TaskDelegationRequestSchema = z.object({
  task_id: z.string().describe("The unique identifier for this delegated task."),
  agency_id: z.string().describe("The target agency ID to delegate to."),
  task_description: z.string().describe("The detailed description of the task to perform."),
  capability_required: z.string().optional().describe("The specific capability requested, if any."),
  context: z.record(z.any()).optional().describe("Additional contextual data required for the task."),
  reply_to: z.string().url().optional().describe("Optional callback URL for asynchronous completion."),
});

// Response payload from a delegated task
export const TaskDelegationResponseSchema = z.object({
  task_id: z.string().describe("The unique identifier of the delegated task."),
  status: z.enum(["accepted", "completed", "failed", "rejected"]).describe("The result status of the delegation."),
  result: z.any().optional().describe("The final output or result of the task if completed."),
  error: z.string().optional().describe("Error message if the task failed or was rejected."),
});

export type Capability = z.infer<typeof CapabilitySchema>;
export type AgencyProfile = z.infer<typeof AgencyProfileSchema>;
export type TaskDelegationRequest = z.infer<typeof TaskDelegationRequestSchema>;
export type TaskDelegationResponse = z.infer<typeof TaskDelegationResponseSchema>;
