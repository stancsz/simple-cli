import fetch from "node-fetch";

interface BoltNewGenerationResult {
  code: string;
  previewUrl?: string;
  framework: string;
}

interface BoltNewFrameworksResult {
  frameworks: string[];
}

export class BoltNewClient {
  private apiBaseUrl: string;
  private apiKey?: string;

  constructor(config: { apiKey?: string; apiBaseUrl?: string } = {}) {
    this.apiKey = config.apiKey || process.env.BOLTNEW_API_KEY;
    this.apiBaseUrl = config.apiBaseUrl || "https://api.bolt.new/v1";

    if (!this.apiKey) {
      console.warn("[BoltNewClient] No API key provided. Running in simulation mode.");
    } else {
      console.warn(
        "[BoltNewClient] WARNING: Using experimental/hypothetical API endpoint. " +
        "Bolt.new does not have a public API at this time. This integration is a structural placeholder."
      );
    }
  }

  /**
   * Generates a UI component based on a description.
   * Note: This is a mocked implementation assuming a standard REST structure
   * as public documentation for Bolt.new API was not available at the time of implementation.
   * Until an official API is released, this client serves as a structural placeholder
   * that defaults to simulation mode or attempts to hit a hypothetical endpoint if an API key is provided.
   */
  async generateComponent(
    prompt: string,
    framework: string = "react"
  ): Promise<BoltNewGenerationResult> {
    if (!this.apiKey) {
      // Return a simulated response if no API key is provided (for testing/demo)
      return {
        code: `// Generated ${framework} component for: ${prompt}\n\nexport default function Component() {\n  return <div>Generated Content</div>;\n}`,
        previewUrl: "https://bolt.new/preview/simulated-id",
        framework,
      };
    }

    const url = `${this.apiBaseUrl}/generate`;
    try {
        const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ prompt, framework }),
        });

        if (!response.ok) {
        throw new Error(
            `Failed to generate component: ${response.status} ${response.statusText} - ${await response.text()}`
        );
        }

        const data: any = await response.json();
        return {
        code: data.code,
        previewUrl: data.preview_url,
        framework: data.framework || framework,
        };
    } catch (error: any) {
        // Fallback to simulation if API fails (since it likely doesn't exist)
        console.warn(`[BoltNewClient] API call failed (${error.message}). Falling back to simulation.`);
        return {
            code: `// Generated ${framework} component for: ${prompt} (Fallback)\n\nexport default function Component() {\n  return <div>Generated Content (Fallback)</div>;\n}`,
            previewUrl: "https://bolt.new/preview/fallback-id",
            framework,
        };
    }
  }

  /**
   * Lists supported frameworks.
   */
  async listFrameworks(): Promise<BoltNewFrameworksResult> {
    if (!this.apiKey) {
      return { frameworks: ["react", "vue", "svelte", "html"] };
    }

    const url = `${this.apiBaseUrl}/frameworks`;
    try {
        const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${this.apiKey}`,
        },
        });

        if (!response.ok) {
        throw new Error(
            `Failed to list frameworks: ${response.status} ${response.statusText}`
        );
        }

        return await response.json();
    } catch (error: any) {
         console.warn(`[BoltNewClient] API call failed (${error.message}). Falling back to defaults.`);
         return { frameworks: ["react", "vue", "svelte", "html"] };
    }
  }
}
