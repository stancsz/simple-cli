export interface SOPStep {
  name?: string;
  description?: string;
  tool: string;
  args: Record<string, any>;
  condition?: string; // e.g. "result.status == 'success'" or "{{ param }} == 'true'"
  on_failure?: "retry" | "continue" | "abort";
  retry_count?: number;
}

export interface SOPDefinition {
  name: string;
  description?: string;
  params?: string[]; // List of expected parameter names
  steps: SOPStep[];
}
