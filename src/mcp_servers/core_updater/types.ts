export interface CoreProposal {
  id: string;
  title: string;
  description: string;
  patchPath: string; // The path to the stored patch file
  riskLevel: 'low' | 'high' | 'critical';
  status: 'pending' | 'applied' | 'rejected';
  createdAt: number;
  approvalToken?: string;
  rollbackPlan?: string;
}

export interface StoredProposal extends CoreProposal {
  // Any extra fields stored in JSON
}
