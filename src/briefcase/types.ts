export interface CompanyProfile {
  name: string;
  description?: string;
  brandVoice?: string;
  internalDocs?: string[];
  sops?: string[];
  preferences?: Record<string, any>;
}

export interface Document {
  id: string; // filename or unique ID
  text: string;
  metadata?: Record<string, any>;
  vector?: number[];
  _distance?: number;
}
