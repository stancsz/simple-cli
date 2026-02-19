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
    emoji_usage: z.string().optional().default("moderate"), // "none", "moderate", "high"
    catchphrases: z.array(z.string()).optional().default([]),
  }),
  working_hours: z.string().optional(), // "HH:mm-HH:mm" or "HH:mm-HH:mm Timezone"
  response_latency: z.object({
    min_ms: z.number(),
    max_ms: z.number(),
    simulate_typing: z.boolean().optional().default(true),
  }).optional(),
  enabled: z.boolean().optional().default(true),
});

export type PersonaConfig = z.infer<typeof PersonaConfigSchema>;

export class PersonaEngine {
  private static instance: PersonaEngine;
  private config: PersonaConfig | null = null;
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  public static getInstance(): PersonaEngine {
    if (!PersonaEngine.instance) {
      PersonaEngine.instance = new PersonaEngine();
    }
    return PersonaEngine.instance;
  }

  getConfig(): PersonaConfig | null {
    return this.config;
  }

  async loadConfig(): Promise<void> {
    if (this.config) return;

    let configPath = join(this.cwd, "persona.json");

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
        // Try .agent/config/persona.json
        const agentConfigPath = join(this.cwd, ".agent", "config", "persona.json");
         if (existsSync(agentConfigPath)) {
            configPath = agentConfigPath;
         } else {
             return;
         }
      }
    }

    try {
      const content = await readFile(configPath, "utf-8");
      const parsed = JSON.parse(content);
      // Map old schema to new if necessary, but we are enforcing new schema
      // However, to be safe with existing files if any:
      // The old schema had catchphrases as object { greeting, signoff, filler }
      // The new schema has catchphrases as string[]
      // We should probably adapt if we want backward compatibility, but the instruction implies a new schema.
      // I'll stick to the requested schema.

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
    if (this.config.voice.catchphrases && this.config.voice.catchphrases.length > 0) {
       personalityPrompt += ` You occasionally use catchphrases like: ${this.config.voice.catchphrases.join(", ")}.`;
    }

    return `${personalityPrompt}\n\n${systemPrompt}`;
  }

  async transformResponse(response: LLMResponse, onTyping?: () => void): Promise<LLMResponse> {
    if (!this.config || !this.config.enabled) return response;

    // Working Hours Check
    // transformResponse is usually called after LLM generation, but we might want to intercept before if strictly enforcing offline mode.
    // However, LLM generation usually happens if we are "online".
    // If we are "offline", the interface layer should ideally catch it.
    // But if we are here, we can still simulate latency.

    let message = response.message || "";
    const thought = response.thought;

    // Inject Catchphrases (Simple random insertion)
    if (this.config.voice.catchphrases && this.config.voice.catchphrases.length > 0) {
         if (Math.random() < 0.2) { // 20% chance
             const phrase = this.getRandomElement(this.config.voice.catchphrases);
             if (!message.includes(phrase)) {
                 if (Math.random() > 0.5) {
                     message = `${phrase} ${message}`;
                 } else {
                     message = `${message} ${phrase}`;
                 }
             }
         }
    }

    // Inject Emojis
    if (this.config.voice.emoji_usage !== "none") {
        const chance = this.config.voice.emoji_usage === "high" ? 0.5 : 0.2;
        if (Math.random() < chance) {
             if (!/[\u{1F600}-\u{1F64F}]/u.test(message)) {
                message += ` ${this.getRandomElement(DEFAULT_EMOJIS)}`;
             }
        }
    }

    // Simulate Latency (if not handled by interface)
    // The interface usually handles pre-response latency (typing indicator).
    // But if simulateLatency() wasn't called explicitly, we can do it here too?
    // The requirement says "Provides simulateLatency(): Promise<void>".
    // It also says "Update each adapter to Call persona.simulateLatency() before sending responses."
    // So transformResponse might not need to simulate latency if the adapter does it.
    // But existing code did it here. I'll keep the method but maybe not call it here if adapters are updated.
    // Actually, LLM.generate calls transformResponse. If I remove it from here, LLM.generate won't delay.
    // But adapters call simulateLatency BEFORE sending response.
    // LLM.generate happens BEFORE adapter sends response.
    // So if LLM.generate delays, it delays the *return* of the generation.
    // If adapter calls simulateLatency, it delays the *sending* to the user.
    // It's safer to have the adapter control the delay to show typing indicators during the delay.
    // So I will remove `simulateTyping` call from `transformResponse` and rely on `simulateLatency` being called by the consumer (Adapter).

    return {
      ...response,
      message,
      thought
    };
  }

  async simulateLatency(): Promise<void> {
    if (!this.config || !this.config.response_latency) return;
    const { min_ms, max_ms } = this.config.response_latency;
    const delay = Math.floor(Math.random() * (max_ms - min_ms + 1)) + min_ms;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  getWorkingHoursStatus(): { isWorkingHours: boolean, nextAvailable: string } {
    if (!this.config || !this.config.working_hours) {
        return { isWorkingHours: true, nextAvailable: "now" };
    }

    const workingHours = this.config.working_hours;
    // Parse "HH:mm-HH:mm" or "HH:mm-HH:mm Timezone"
    const match = workingHours.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})(?:\s+(.+))?$/);

    if (!match) {
        // Fallback or invalid format
        return { isWorkingHours: true, nextAvailable: "now" };
    }

    const [_, startHStr, startMStr, endHStr, endMStr, timezone] = match;
    const startH = parseInt(startHStr, 10);
    const startM = parseInt(startMStr, 10);
    const endH = parseInt(endHStr, 10);
    const endM = parseInt(endMStr, 10);

    // Get current time in target timezone or local
    const now = new Date();
    let currentH: number;
    let currentM: number;

    if (timezone) {
        try {
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                hour: 'numeric',
                minute: 'numeric',
                hour12: false
            }).formatToParts(now);
            const hPart = parts.find(p => p.type === 'hour');
            const mPart = parts.find(p => p.type === 'minute');
            currentH = hPart ? parseInt(hPart.value, 10) : now.getHours();
            currentM = mPart ? parseInt(mPart.value, 10) : now.getMinutes();
            // Handle 24h wrapping if format returns 24 instead of 0
            if (currentH === 24) currentH = 0;
        } catch (e) {
            // Invalid timezone, fallback to local
            currentH = now.getHours();
            currentM = now.getMinutes();
        }
    } else {
        currentH = now.getHours();
        currentM = now.getMinutes();
    }

    const currentMinutes = currentH * 60 + currentM;
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    let isWorking = false;
    if (startMinutes <= endMinutes) {
        isWorking = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
        // Overnight shift (e.g. 22:00 - 06:00)
        isWorking = currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }

    if (isWorking) {
        return { isWorkingHours: true, nextAvailable: "now" };
    } else {
        // Calculate next available
        // Simple string for now
        return { isWorkingHours: false, nextAvailable: `${startHStr}:${startMStr}` };
    }
  }

  generateReaction(input: string): string {
      if (!this.config || !this.config.enabled) return "";

      const lower = input.toLowerCase();

      // Simple keyword matching
      if (lower.includes("bug") || lower.includes("error") || lower.includes("fail")) return "🐛";
      if (lower.includes("great") || lower.includes("good") || lower.includes("thanks")) return "👍";
      if (lower.includes("deploy") || lower.includes("ship")) return "🚀";
      if (lower.includes("help") || lower.includes("question")) return "🤔";
      if (lower.includes("joke") || lower.includes("fun")) return "😂";
      if (lower.includes("urgent") || lower.includes("asap")) return "🔥";

      // Default random if emoji usage is enabled
      if (this.config.voice.emoji_usage !== "none") {
          // Only react sometimes? Or always if input is short?
          // Let's return empty string by default to avoid spamming reactions,
          // unless specific keywords are found.
          return "";
      }
      return "";
  }

  private getRandomElement<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }
}

// Export Singleton
export const persona = PersonaEngine.getInstance();
