
export interface GenerateComponentRequest {
  prompt: string;
  framework?: 'react' | 'vue' | 'html';
  model?: string;
  stream?: boolean;
}

export interface GenerateComponentResponse {
  id: string;
  code: string;
  language: string;
  framework: string;
  model: string;
  preview_url?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ListFrameworksResponse {
  frameworks: string[];
}

export interface ErrorResponse {
  error: {
    message: string;
    code: string;
    status: number;
  };
}
