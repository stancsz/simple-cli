export interface CursorTask {
  title: string;
  description: string;
  files?: string[];
  instructions?: string;
  context?: string;
}

export interface CursorOpenInput {
  paths: string[];
  newWindow?: boolean;
}

export interface CursorExecuteTaskInput {
  title: string;
  description: string;
  files?: string[];
  context?: string;
}

export interface CursorEditFileInput {
  file: string;
  instructions: string;
  context?: string;
}

export interface CursorGenerateCodeInput {
  description: string;
  outputFile?: string;
  context?: string;
}
