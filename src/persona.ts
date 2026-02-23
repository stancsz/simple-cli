import { z } from "zod";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { LLMResponse } from "./llm.js";

const DEFAULT_EMOJIS = ["😊", "👍", "🚀", "🤖", "💻", "✨", "💡", "🔥"];

export const PersonaConfigSchema = z.object({
  name: z.string(),
  role: z.string(),
  voice: z.object({
    tone: z.string(),
  }),
  emoji_usage: z.boolean(),
  catchphrases: z.object({
    greeting: z.array(z.string()),
    signoff: z.array(z.string()),
    filler: z.array(z.string()).optional(),
  }),
  working_hours: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/, "Invalid working hours format (HH:mm-HH:mm)").optional(),
  response_latency: z.object({
    min: z.number(),
    max: z.number(),
  }).optional(),
  enabled: z.boolean().optional().default(true),
});

export type PersonaConfig = z.infer<typeof PersonaConfigSchema>;

export class PersonaEngine {
  private config: PersonaConfig | null = null;
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  getConfig(): PersonaConfig | null {
    return this.config;
  }

  async loadConfig(): Promise<void> {
    if (this.config) return;

    let configPath = join(this.cwd, ".agent", "config", "persona.json");

    // Support Company Override
    const company = process.env.JULES_COMPANY;
    if (company) {
      const companyConfigPath = join(this.cwd, ".agent", "companies", company, "config", "persona.json");
      if (existsSync(companyConfigPath)) {
        configPath = companyConfigPath;
      }
    }

    if (!existsSync(configPath)) {
      // Try fallback locations
      const legacyPath = join(this.cwd, ".agent", "persona.json");
      if (existsSync(legacyPath)) {
        configPath = legacyPath;
      } else {
        return;
      }
    }

    try {
      const content = await readFile(configPath, "utf-8");
      const parsed = JSON.parse(content);
      this.config = PersonaConfigSchema.parse(parsed);
    } catch (e) {
      console.error(`[Persona] Failed to load config from ${configPath}:`, e);
    }
  }

  injectPersonality(systemPrompt: string): string {
    if (!this.config || !this.config.enabled) return systemPrompt;

    let personalityPrompt = `You are ${this.config.name}, a ${this.config.role}.`;
    if (this.config.voice && this.config.voice.tone) {
      personalityPrompt += ` Your voice is ${this.config.voice.tone}.`;
    }
    if (this.config.working_hours) {
      personalityPrompt += ` Your working hours are ${this.config.working_hours}.`;
    }

    return `${personalityPrompt}\n\n${systemPrompt}`;
  }

  formatMessage(message: string): string {
    if (!this.config || !this.config.enabled) return message;

    // Inject Greeting
    if (this.config.catchphrases?.greeting?.length > 0) {
      const greeting = this.getRandomElement(this.config.catchphrases.greeting);
      if (!message.trim().startsWith(greeting)) {
        message = `${greeting} ${message}`;
      }
    }

    // Inject Filler Catchphrases
    if (this.config.catchphrases?.filler && this.config.catchphrases.filler.length > 0) {
      message = this.insertCatchphrases(message, this.config.catchphrases.filler);
    }

    // Inject Emojis
    if (this.config.emoji_usage) {
      // Simple check to avoid double emojis if LLM already added some common ones
      if (!/[\u{1F600}-\u{1F64F}]/u.test(message)) {
        message += ` ${this.getRandomElement(DEFAULT_EMOJIS)}`;
      }
    }

    // Inject Signoff
    if (this.config.catchphrases?.signoff?.length > 0) {
      const signoff = this.getRandomElement(this.config.catchphrases.signoff);
      // Avoid appending if already ends with signoff-like structure
      if (!message.trim().endsWith(signoff)) {
        message = `${message}\n\n${signoff}`;
      }
    }

    return message;
  }

  async transformResponse(response: LLMResponse, onTyping?: () => void): Promise<LLMResponse> {
    if (!this.config || !this.config.enabled) return response;

    // Working Hours Check
    if (!this.isWithinWorkingHours()) {
      // Simulate typing even for offline message
      if (this.config.response_latency) {
        await this.simulateTyping("", this.config.response_latency, onTyping);
      }
      return {
        ...response,
        message: `I am currently offline. My working hours are ${this.config.working_hours}.`,
        thought: "Working hours check failed. Sending offline message.",
      };
    }

    let message = response.message || "";
    let thought = response.thought;

    message = this.formatMessage(message);

    // Simulate Latency
    if (this.config.response_latency) {
      await this.simulateTyping(message, this.config.response_latency, onTyping);
    }

    return {
      ...response,
      message,
      thought
    };
  }

  async simulateTyping(response: string, latencyConfig: { min: number, max: number }, onTyping?: () => void): Promise<void> {
    const { min, max } = latencyConfig;

    // Calculate proportional delay (approx 30ms per character ~ 2000 chars/min)
    let delay = response.length * 30;

    // Apply constraints
    delay = Math.max(min, delay);
    delay = Math.min(max, delay);

    // Add jitter (±10%)
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    delay = Math.floor(delay + jitter);

    if (onTyping && delay > 100) {
      onTyping();
    }

    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  isWithinWorkingHours(workingHours?: string): boolean {
    const hours = workingHours || this.config?.working_hours;
    if (!hours) return true;
    const match = hours.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
    if (!match) return true;

    const [_, startH, startM, endH, endM] = match.map(Number);
    const now = new Date();
    const currentH = now.getHours();
    const currentM = now.getMinutes();

    const currentMinutes = currentH * 60 + currentM;
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      // Overnight shift
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
  }

  private getRandomElement<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private insertCatchphrases(text: string, phrases: string[]): string {
    if (!phrases || phrases.length === 0) return text;
    // Insert a catchphrase after a sentence ending with roughly 20% probability
    return text.replace(/([.!?])\s+/g, (match, p1) => {
      if (Math.random() < 0.2) {
        const phrase = this.getRandomElement(phrases);
        return `${p1} ${phrase} `;
      }
      return match;
    });
  }
}
