export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'implemented';

export interface Proposal {
  id: string;
  title: string;
  description: string;
  affectedFiles: string[];
  patch: string; // Diff or instructions for the change
  status: ProposalStatus;
  reviewToken?: string; // Token required for applying the change
  createdAt: number;
  updatedAt: number;
}

export interface LogEntry {
  sop: string;
  result: {
    success: boolean;
    output?: any;
    logs: {
      step: string;
      status: string;
      output: string;
      timestamp: string;
    }[];
  };
  timestamp: string;
}

export interface AnalysisResult {
  analysis: string;
  improvement_needed: boolean;
  suggested_instructions?: string;
}
