import { GenerateComponentRequest, GenerateComponentResponse, ListFrameworksResponse } from './types.js';

export class V0DevClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl: string = 'https://api.v0.dev') {
    this.apiKey = apiKey || process.env.V0DEV_API_KEY || '';
    this.baseUrl = baseUrl;

    if (!this.apiKey) {
      console.warn('V0DEV_API_KEY is not set. Running in simulation mode.');
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
      throw error;
    }
  }

  async generateComponent(prompt: string, framework: 'react' | 'vue' | 'html' = 'react'): Promise<GenerateComponentResponse> {
    // Attempt real API call if key is present
    if (this.apiKey) {
      try {
        const result = await this.request<GenerateComponentResponse>('/v1/generate', 'POST', {
          prompt,
          framework,
          stream: false
        });
        // Ensure preview_url is present if API returns it, or construct it if we know the ID pattern
        if (!result.preview_url && result.id) {
           result.preview_url = `https://v0.dev/r/${result.id}`;
        }
        return result;
      } catch (error: any) {
        console.warn(`Real API call failed: ${error.message}. Falling back to simulation.`);
      }
    }

    // Simulation Fallback
    return this.simulateGeneration(prompt, framework);
  }

  async listFrameworks(): Promise<ListFrameworksResponse> {
    return Promise.resolve({
      frameworks: ['react', 'vue', 'html']
    });
  }

  private simulateGeneration(prompt: string, framework: string): GenerateComponentResponse {
    const code = this.getSimulatedCode(prompt, framework);
    const id = `sim-${Date.now()}`;
    return {
      id,
      code,
      language: 'typescript',
      framework,
      model: 'v0-simulated',
      preview_url: `https://v0.dev/r/${id}`,
      usage: {
        prompt_tokens: prompt.length / 4,
        completion_tokens: code.length / 4,
        total_tokens: (prompt.length + code.length) / 4
      }
    };
  }

  private getSimulatedCode(prompt: string, framework: string): string {
    if (framework === 'react') {
      return `import React from 'react';

export default function GeneratedComponent() {
  return (
    <div className="p-4 border rounded shadow-sm">
      <h1 className="text-xl font-bold mb-2">Generated UI</h1>
      <p className="text-gray-600">Based on prompt: "${prompt}"</p>
      <div className="mt-4">
        <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
          Action
        </button>
      </div>
    </div>
  );
}`;
    } else if (framework === 'vue') {
      return `<template>
  <div class="p-4 border rounded shadow-sm">
    <h1 class="text-xl font-bold mb-2">Generated UI</h1>
    <p class="text-gray-600">Based on prompt: "${prompt}"</p>
    <div class="mt-4">
      <button class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
        Action
      </button>
    </div>
  </div>
</template>

<script setup>
// Vue component logic
</script>`;
    } else {
      return `<!-- HTML Component -->
<div class="p-4 border rounded shadow-sm">
  <h1 class="text-xl font-bold mb-2">Generated UI</h1>
  <p class="text-gray-600">Based on prompt: "${prompt}"</p>
  <div class="mt-4">
    <button class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">
      Action
    </button>
  </div>
</div>`;
    }
  }
}
