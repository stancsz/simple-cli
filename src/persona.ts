import { z } from "zod";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { LLMResponse } from "./llm.js";

const PersonaConfigSchema = z.object({
  name: z.string(),
  role: z.string(),
  voice: z.object({
    tone: z.string(),
  }),
  emoji_usage: z.boolean(),
  catchphrases: z.object({
    greeting: z.array(z.string()),
    signoff: z.array(z.string()),
  }),
  working_hours: z.string(),
  response_latency: z.object({
    min: z.number(),
    max: z.number(),
  }),
  enabled: z.boolean().optional().default(true),
});

export type PersonaConfig = z.infer<typeof PersonaConfigSchema>;

export class PersonaEngine {
  private config: PersonaConfig | null = null;
  private configPath: string;

  constructor(cwd: string = process.cwd()) {
    this.configPath = join(cwd, ".agent", "persona.json");
  }

  async loadConfig(): Promise<void> {
    if (!existsSync(this.configPath)) {
      this.config = null;
      return;
    }
    try {
      const content = await readFile(this.configPath, "utf-8");
      const parsed = JSON.parse(content);
      this.config = PersonaConfigSchema.parse(parsed);
    } catch (e) {
      console.error("Failed to load persona config:", e);
      this.config = null;
    }
  }

  async injectPersonality(systemPrompt: string): Promise<string> {
    if (!this.config) {
      await this.loadConfig();
    }

    if (!this.config || !this.config.enabled) {
      return systemPrompt;
    }

    let personalityPrompt = `You are ${this.config.name}, a ${this.config.role}.`;
    if (this.config.voice.tone) {
      personalityPrompt += ` Your voice is ${this.config.voice.tone}.`;
    }
    if (this.config.working_hours) {
      personalityPrompt += ` Your working hours are ${this.config.working_hours}.`;
    }

    return `${personalityPrompt}\n\n${systemPrompt}`;
  }

  async transform(response: LLMResponse): Promise<LLMResponse> {
    // Ensure config is loaded
    if (!this.config) {
      await this.loadConfig();
    }

    // If still no config or disabled, return original
    if (!this.config || !this.config.enabled) {
      return response;
    }

    let message = response.message || "";

    // Prefix with greeting
    if (this.config.catchphrases?.greeting?.length > 0) {
      const greeting = this.getRandomElement(this.config.catchphrases.greeting);
      message = `${greeting} ${message}`;
    }

    // Suffix with signoff
    if (this.config.catchphrases?.signoff?.length > 0) {
      const signoff = this.getRandomElement(this.config.catchphrases.signoff);
      message = `${message}\n\n${signoff}`;
    }

    // Emoji usage
    if (this.config.emoji_usage) {
       const emojis = ["😊", "👍", "🚀", "🤖", "💻", "✨"];
       // Check if message already has emojis (basic check)
       if (!/[\u{1F600}-\u{1F64F}]/u.test(message)) {
         message += ` ${this.getRandomElement(emojis)}`;
       }
    }

    // Simulate latency
    if (this.config.response_latency) {
      const { min, max } = this.config.response_latency;
      const delay = Math.floor(Math.random() * (max - min + 1)) + min;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    return {
      ...response,
      message,
    };
  }

  private getRandomElement<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }
}
