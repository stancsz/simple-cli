import { z } from "zod";
import { readFile } from "fs/promises";
import { existsSync } from "fs";

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
  working_hours: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/, "Invalid working hours format (HH:mm-HH:mm)"),
  response_latency: z.object({
    min: z.number(),
    max: z.number(),
  }),
  enabled: z.boolean().optional().default(true),
});

export type PersonaConfig = z.infer<typeof PersonaConfigSchema>;

const DEFAULT_EMOJIS = ["😊", "👍", "🚀", "🤖", "💻", "✨", "💡", "🔥"];

export class Persona {
  private config: PersonaConfig | null = null;

  async load(configPath: string): Promise<void> {
    if (!existsSync(configPath)) {
      console.warn(`[Persona] Config file not found at ${configPath}`);
      return;
    }
    try {
      const content = await readFile(configPath, "utf-8");
      const parsed = JSON.parse(content);
      this.config = PersonaConfigSchema.parse(parsed);
    } catch (e) {
      console.error(`[Persona] Failed to load config from ${configPath}:`, e);
    }
  }

  injectPrompt(systemPrompt: string): string {
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

  async processResponse(response: string): Promise<string> {
    if (!this.config || !this.config.enabled) return response;

    // Working Hours Check
    if (this.config.working_hours && !this.isWithinWorkingHours(this.config.working_hours)) {
      await this.simulateLatency();
      return `I am currently offline. My working hours are ${this.config.working_hours}.`;
    }

    let message = response;

    // Inject Greeting
    if (this.config.catchphrases?.greeting?.length > 0) {
       const greeting = this.getRandomElement(this.config.catchphrases.greeting);
       message = `${greeting} ${message}`;
    }

    // Inject Filler
    if (this.config.catchphrases?.filler && this.config.catchphrases.filler.length > 0) {
      message = this.insertCatchphrases(message, this.config.catchphrases.filler);
    }

    // Inject Emojis
    if (this.config.emoji_usage) {
      if (!/[\u{1F600}-\u{1F64F}]/u.test(message)) {
        message += ` ${this.getRandomElement(DEFAULT_EMOJIS)}`;
      }
    }

    // Inject Signoff
    if (this.config.catchphrases?.signoff?.length > 0) {
      const signoff = this.getRandomElement(this.config.catchphrases.signoff);
      message = `${message}\n\n${signoff}`;
    }

    await this.simulateLatency();
    return message;
  }

  private isWithinWorkingHours(workingHours: string): boolean {
    if (!workingHours) return true;
    const match = workingHours.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
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
    return text.replace(/([.!?])\s+/g, (match, p1) => {
      if (Math.random() < 0.2) {
        const phrase = this.getRandomElement(phrases);
        return `${p1} ${phrase} `;
      }
      return match;
    });
  }

  private async simulateLatency(): Promise<void> {
    if (this.config?.response_latency) {
      const { min, max } = this.config.response_latency;
      const delay = Math.floor(Math.random() * (max - min + 1)) + min;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
