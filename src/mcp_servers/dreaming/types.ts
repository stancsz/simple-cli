export interface FailureLog {
  id: string;
  timestamp: string;
  task: string;
  error: string;
  context?: string;
  sourceFile: string;
}

export interface DreamStrategy {
  id: string;
  originalFailureId: string;
  task: string;
  proposedApproach: string; // From LLM
  outcome: "success" | "failure";
  executionResult: string; // From CrewAI/Delegate
  timestamp: string;
}

export interface DreamingSession {
  id: string;
  startTime: string;
  endTime?: string;
  failuresProcessed: number;
  strategiesGenerated: number;
  successfulStrategies: number;
  logs: string[];
}
