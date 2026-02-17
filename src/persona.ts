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
    const personality = this.getPersonalityDescription();
    if (!personality) return systemPrompt;
    return `${personality}\n\n${systemPrompt}`;
  }

  getPersonalityDescription(): string {
    if (!this.config || !this.config.enabled) return "";

    let personalityPrompt = `You are ${this.config.name}, a ${this.config.role}.`;
    if (this.config.voice && this.config.voice.tone) {
      personalityPrompt += ` Your voice is ${this.config.voice.tone}.`;
    }
    if (this.config.working_hours) {
      personalityPrompt += ` Your working hours are ${this.config.working_hours}.`;
    }
    return personalityPrompt;
  }

  async transformResponse(response: LLMResponse, onTyping?: () => void): Promise<LLMResponse> {
    if (!this.config || !this.config.enabled) return response;

    // Working Hours Check
    if (this.config.working_hours && !this.isWithinWorkingHours(this.config.working_hours)) {
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

    // Initialize deterministic PRNG based on message content
    let seed = this.hashString(message + (this.config.name || ""));
    const nextRandom = () => {
        seed++;
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    };

    const getRandomElement = <T>(arr: T[]): T => {
        return arr[Math.floor(nextRandom() * arr.length)];
    };

    // Inject Greeting
    if (this.config.catchphrases?.greeting?.length > 0) {
      const greeting = getRandomElement(this.config.catchphrases.greeting);
      if (!message.trim().startsWith(greeting)) {
         message = `${greeting} ${message}`;
      }
    }

    // Inject Filler Catchphrases (Protected Code Blocks)
    if (this.config.catchphrases?.filler && this.config.catchphrases.filler.length > 0) {
      // Split message by code blocks to protect them
      const parts = message.split(/(```[\s\S]*?```)/g);
      for (let i = 0; i < parts.length; i += 2) {
          if (parts[i]) {
              parts[i] = this.insertCatchphrases(parts[i], this.config.catchphrases.filler, nextRandom);
          }
      }
      message = parts.join("");
    }

    // Inject Emojis
    if (this.config.emoji_usage) {
      // Simple check to avoid double emojis if LLM already added some common ones
      if (!/[\u{1F600}-\u{1F64F}]/u.test(message)) {
        message += ` ${getRandomElement(DEFAULT_EMOJIS)}`;
      }
    }

    // Inject Signoff
    if (this.config.catchphrases?.signoff?.length > 0) {
      const signoff = getRandomElement(this.config.catchphrases.signoff);
      // Avoid appending if already ends with signoff-like structure
      if (!message.trim().endsWith(signoff)) {
          message = `${message}\n\n${signoff}`;
      }
    }

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
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;

    if (onTyping && delay > 100) {
        onTyping();
    }

    if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  isWithinWorkingHours(workingHours: string): boolean {
    if (!workingHours) return true;
    const match = workingHours.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
    if (!match) return true;

    const startH = parseInt(match[1], 10);
    const startM = parseInt(match[2], 10);
    const endH = parseInt(match[3], 10);
    const endM = parseInt(match[4], 10);

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

  private hashString(str: string): number {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  private insertCatchphrases(text: string, phrases: string[], randomFn: () => number): string {
    if (!phrases || phrases.length === 0) return text;
    // Insert a catchphrase after a sentence ending with roughly 20% probability
    return text.replace(/([.!?])\s+/g, (match, p1) => {
      if (randomFn() < 0.2) {
        const phrase = phrases[Math.floor(randomFn() * phrases.length)];
        return `${p1} ${phrase} `;
      }
      return match;
    });
  }
}
