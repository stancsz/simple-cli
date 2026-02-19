import { GenerateComponentRequest, GenerateComponentResponse, ListFrameworksResponse } from './types.js';

export class V0DevClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl: string = 'https://api.v0.dev') {
    this.apiKey = apiKey || process.env.V0DEV_API_KEY || '';
    this.baseUrl = baseUrl;

    if (!this.apiKey) {
      console.warn('V0DEV_API_KEY is not set. API calls may fail.');
    }
  }

  private async request<T>(endpoint: string, method: string, body?: any): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`v0.dev API Error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      return await response.json() as T;
    } catch (error: any) {
      throw new Error(`v0.dev Request Failed: ${error.message}`);
    }
  }

  async generateComponent(prompt: string, framework: 'react' | 'vue' | 'html' = 'react'): Promise<GenerateComponentResponse> {
    // Note: The actual endpoint might differ. Adjust as needed when documentation is available.
    // Assuming /generate or similar based on typical API patterns.
    return this.request<GenerateComponentResponse>('/generate', 'POST', {
      prompt,
      framework,
      stream: false
    });
  }

  async listFrameworks(): Promise<ListFrameworksResponse> {
    // Mock implementation if API doesn't provide this endpoint, or call actual endpoint.
    // For now, return static list as per requirements.
    return Promise.resolve({
      frameworks: ['react', 'vue', 'html']
    });
  }
}
