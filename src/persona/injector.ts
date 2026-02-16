import { LLMResponse } from "../llm.js";
import { PersonaConfig } from "./loader.js";

const DEFAULT_EMOJIS = ["😊", "👍", "🚀", "🤖", "💻", "✨", "💡", "🔥"];

export function isWithinWorkingHours(workingHours: string): boolean {
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
    // Overnight shift (e.g. 22:00-06:00)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function insertCatchphrases(text: string, phrases: string[]): string {
  if (!phrases || phrases.length === 0) return text;

  // Insert a catchphrase after a sentence ending with roughly 20% probability
  return text.replace(/([.!?])\s+/g, (match, p1) => {
    if (Math.random() < 0.2) {
      const phrase = getRandomElement(phrases);
      return `${p1} ${phrase} `;
    }
    return match;
  });
}

export function injectPersonality(systemPrompt: string, config: PersonaConfig): string {
  if (!config.enabled) return systemPrompt;

  let personalityPrompt = `You are ${config.name}, a ${config.role}.`;
  if (config.voice && config.voice.tone) {
    personalityPrompt += ` Your voice is ${config.voice.tone}.`;
  }
  if (config.working_hours) {
    personalityPrompt += ` Your working hours are ${config.working_hours}.`;
  }

  return `${personalityPrompt}\n\n${systemPrompt}`;
}

export async function transformResponse(
  response: LLMResponse,
  config: PersonaConfig,
  onTyping?: () => void
): Promise<LLMResponse> {
  if (!config.enabled) return response;

  // Working Hours Check
  if (config.working_hours && !isWithinWorkingHours(config.working_hours)) {
    // Simulate some latency for the "canned" response too
    if (config.response_latency) {
       const { min, max } = config.response_latency;
       const delay = Math.floor(Math.random() * (max - min + 1)) + min;
       if (onTyping && delay > 500) onTyping();
       await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return {
      ...response,
      message: `I am currently offline. My working hours are ${config.working_hours}.`,
      thought: "Working hours check failed. Sending offline message.",
    };
  }

  let message = response.message || "";
  let thought = response.thought;

  // Inject Greeting
  if (config.catchphrases?.greeting?.length > 0) {
    const greeting = getRandomElement(config.catchphrases.greeting);
    if (!message.trim().startsWith(greeting)) {
       message = `${greeting} ${message}`;
    }
  }

  // Inject Filler Catchphrases
  if (config.catchphrases?.filler && config.catchphrases.filler.length > 0) {
    message = insertCatchphrases(message, config.catchphrases.filler);
  }

  // Inject Emojis
  if (config.emoji_usage) {
    if (!/[\u{1F600}-\u{1F64F}]/u.test(message)) {
      message += ` ${getRandomElement(DEFAULT_EMOJIS)}`;
    }
  }

  // Inject Signoff
  if (config.catchphrases?.signoff?.length > 0) {
    const signoff = getRandomElement(config.catchphrases.signoff);
    message = `${message}\n\n${signoff}`;
  }

  // Simulate Latency
  if (config.response_latency) {
    const { min, max } = config.response_latency;
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;

    // Only show typing if delay is substantial
    if (onTyping && delay > 100) {
        onTyping();
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  return {
    ...response,
    message,
    thought
  };
}
