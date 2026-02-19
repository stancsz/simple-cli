export interface CoreChange {
  filepath: string; // Relative to project root, must start with src/
  newContent: string;
  diff?: string;
}

export interface CoreProposal {
  id: string;
  title: string; // Mapped from description
  description: string; // Mapped from description + reasoning
  changes: CoreChange[];
  riskLevel: 'low' | 'high' | 'critical';
  status: 'pending' | 'applied' | 'rejected';
  createdAt: number;
  approvalToken?: string;
  rollbackPlan?: string;
  reasoning: string; // New field
}

export interface StoredProposal extends CoreProposal {
  // Any extra fields stored in JSON
}
