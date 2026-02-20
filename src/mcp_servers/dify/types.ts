export interface DifyAppConfig {
  app: {
    name: string;
    description?: string;
    mode: "chat" | "workflow" | "agent-chat" | "advanced-chat";
    icon?: string;
    icon_background?: string;
  };
  model_config?: {
    provider: string;
    model: string;
    configs: {
      prompt_template: string;
      opening_statement?: string;
      suggested_questions?: string[];
      model_parameters?: Record<string, any>;
    };
  };
}

export interface DifyWorkflowRunRequest {
  inputs: Record<string, any>;
  response_mode: "streaming" | "blocking";
  user: string;
}

export interface DifyChatMessageRequest {
  query: string;
  inputs: Record<string, any>;
  response_mode: "streaming" | "blocking";
  user: string;
  conversation_id?: string;
  files?: Array<{
    type: "image";
    transfer_method: "remote_url" | "local_file";
    url?: string;
    upload_file_id?: string;
  }>;
}

export interface DifyResponse {
    code?: number;
    message?: string;
    status?: string;
    data?: any;
    [key: string]: any;
}
